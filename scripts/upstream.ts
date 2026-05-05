/**
 * Interactive upstream management.
 * Usage: pnpm upstream <github-url> [--branch <branch>] [--name <key>]
 *
 * 1. Adds/updates the repo as a shallow submodule under upstream/<key>
 * 2. Scans for SKILL.md files recursively
 * 3. If SKILL.md files found: multiselect prompt (pre-selects current config)
 * 4. Updates meta.json upstreams block
 * 5. Copies selected skills to skills/ (if any selected)
 * 6. Creates blank instructions file (if not already present)
 */

import type { UpstreamMeta } from './types.ts'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import { submoduleExists } from './lib/gitOps.ts'
import { MetaStore } from './lib/metaStore.ts'
import { discoverSkills } from './lib/skillDiscovery.ts'
import { copySkillsFromUpstream } from './lib/skillOps.ts'
import { ensureSubmodule } from './lib/submoduleOps.ts'
import { normalizeUrl } from './lib/urlOps.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const store = new MetaStore(root)
const meta = store.readMeta()
const errors: string[] = []

const args = process.argv.slice(2)
const branchFlagIdx = args.findIndex(a => a === '--branch' || a === '-b')
const branch: string | undefined = branchFlagIdx !== -1 ? args[branchFlagIdx + 1] : undefined
const nameFlagIdx = args.findIndex(a => a === '--name' || a === '-n')
const nameOverride: string | undefined = nameFlagIdx !== -1 ? args[nameFlagIdx + 1] : undefined
const positional = args.filter((_, i) => {
  if (branchFlagIdx !== -1 && (i === branchFlagIdx || i === branchFlagIdx + 1))
    return false
  if (nameFlagIdx !== -1 && (i === nameFlagIdx || i === nameFlagIdx + 1))
    return false
  return true
})
const url = positional[0]

// ── Validate URL early (before UI) ──────────────────────────────────────────

if (!url) {
  p.intro('Upstream')
  p.log.error('Usage: pnpm upstream <github-url> [--branch <branch>] [--name <key>]')
  process.exit(1)
}

// ── Normalize and derive key ────────────────────────────────────────────────

const normalizedUrl = normalizeUrl(url.replace(/\.git$/, ''))
const urlParts = normalizedUrl.split('/')
const repoName = urlParts[urlParts.length - 1]!
const orgName = urlParts[urlParts.length - 2]!

let upstreamKey = nameOverride ?? (repoName === 'skills' ? orgName : repoName)

p.intro('Upstream')

// ── Check for upstream key collision ────────────────────────────────────────

const existing = meta.upstreams[upstreamKey]
if (existing && existing.url !== normalizedUrl && !nameOverride) {
  const answer = await p.text({
    message: `Key "${upstreamKey}" is already used by ${existing.url}. Enter a different key:`,
    validate: v => (!v?.trim() ? 'Key cannot be empty' : undefined),
  })
  if (p.isCancel(answer)) { p.cancel('Cancelled'); process.exit(0) }
  upstreamKey = answer as string
}

const submodulePath = `upstream/${upstreamKey}`
const upstreamDir = join(root, submodulePath)
const spinner = p.spinner()

const isNew = !submoduleExists(root, submodulePath)
spinner.start(`${isNew ? 'Adding' : 'Updating'} ${submodulePath}${branch ? ` (branch: ${branch})` : ''}`)
const ensureResult = ensureSubmodule(root, submodulePath, url, branch)
if (!ensureResult.ok) {
  spinner.stop(`Failed: ${ensureResult.error}`)
  errors.push(ensureResult.error)
}
else {
  spinner.stop(`${isNew ? 'Added' : 'Updated'} ${submodulePath}`)
}

// --- Skill selection (only if SKILL.md files exist) ---

let skillDirs: string[] = []
const discoverResult = discoverSkills(upstreamDir)
if (!discoverResult.ok) {
  p.log.warn(`Failed to discover skills: ${discoverResult.error}`)
  errors.push(`Failed to discover skills: ${discoverResult.error}`)
}
else {
  skillDirs = discoverResult.data
    .map(skill => skill.path)
    .sort((a, b) =>
      (a.split('/').pop() ?? a).localeCompare(b.split('/').pop() ?? b),
    )
}

const existingConfig = meta.upstreams[upstreamKey]
const skillsMap: Record<string, string> = {}

if (skillDirs.length > 0) {
  const existingPaths = new Set(existingConfig?.skills ? Object.keys(existingConfig.skills) : [])

  const selected = await p.multiselect({
    message: `Select skills to sync from ${upstreamKey} (${skillDirs.length} found, space to skip all)`,
    options: skillDirs.map(skillPath => ({
      value: skillPath,
      label: skillPath.split('/').pop() ?? skillPath,
      hint: skillPath === '.' ? '(repo root)' : skillPath,
    })),
    initialValues: skillDirs.filter(s => existingPaths.has(s)),
    required: false,
  })

  if (p.isCancel(selected)) { p.cancel('Cancelled'); process.exit(0) }

  const selectedPaths = Array.isArray(selected) ? selected : []
  for (const skillPath of selectedPaths) {
    if (typeof skillPath === 'string') {
      skillsMap[skillPath] = existingConfig?.skills?.[skillPath] ?? (skillPath.split('/').pop() ?? skillPath)
    }
  }

  // Remove skills that were deselected
  if (existingConfig?.skills) {
    const selectedOutputNames = new Set(Object.values(skillsMap))
    for (const outputName of Object.values(existingConfig.skills)) {
      if (!selectedOutputNames.has(outputName)) {
        const outputPath = join(root, 'skills', outputName)
        if (existsSync(outputPath)) {
          rmSync(outputPath, { recursive: true })
          p.log.step(`removed skills/${outputName}`)
        }
      }
    }
  }
}

// --- Update meta.json ---

const newConfig: UpstreamMeta = {
  url: normalizedUrl,
  ...(branch ? { branch } : existingConfig?.branch ? { branch: existingConfig.branch } : {}),
  ...(Object.keys(skillsMap).length > 0 ? { skills: skillsMap } : existingConfig?.skills ? { skills: existingConfig.skills } : {}),
  ...(existingConfig?.available ? { available: existingConfig.available } : {}),
}
store.updateUpstream(upstreamKey, newConfig)
const saveResult = store.saveMeta()
if (!saveResult.ok) {
  p.log.error(`Failed to save meta.json: ${saveResult.error}`)
  errors.push(saveResult.error)
}
else {
  p.log.success('Updated meta.json')
}

// --- Copy selected skills ---

if (Object.keys(skillsMap).length > 0) {
  const copyResult = copySkillsFromUpstream(upstreamKey, upstreamDir, newConfig, root)

  if (!copyResult.ok) {
    p.log.error(`Failed to copy skills: ${copyResult.error}`)
    errors.push(copyResult.error)
  }
  else {
    const result = copyResult.data

    // Log results
    for (const skill of result.synced) {
      p.log.step(`synced  ${upstreamKey}/${skill.skillPath} → skills/${skill.outputName}`)
    }
    for (const skill of result.skipped) {
      p.log.info(`unchanged  ${upstreamKey}/${skill.skillPath} → skills/${skill.outputName}`)
    }
    for (const skill of result.errors) {
      p.log.error(`FAILED ${upstreamKey}/${skill.skillPath}: ${skill.error}`)
      errors.push(`Skill copy failed: ${upstreamKey}/${skill.skillPath}: ${skill.error}`)
    }
  }
}

// --- Create instructions file (if this is a reference-only upstream with no skills) ---

const instructionsDir = join(root, 'instructions')
const instructionsFile = join(instructionsDir, `${upstreamKey}.md`)
if (!Object.keys(skillsMap).length && !existsSync(instructionsFile)) {
  mkdirSync(instructionsDir, { recursive: true })
  writeFileSync(instructionsFile, `# ${upstreamKey}\n\n<!-- Notes for authoring skills from this upstream -->\n`)
  p.log.step(`created instructions/${upstreamKey}.md`)
}

// ── Report and exit ───────────────────────────────────────────────────────

if (errors.length > 0) {
  p.log.warn(`${errors.length} error(s) occurred:`)
  for (const err of errors) {
    p.log.warn(`  - ${err}`)
  }
  p.outro('Upstream completed with errors')
  process.exit(1)
}

p.outro('Done')
