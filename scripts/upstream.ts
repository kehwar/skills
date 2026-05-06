#!/usr/bin/env node
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
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import { submoduleExists } from './lib/git-ops.ts'
import { MetaStore } from './lib/meta-store.ts'
import { discoverSkills } from './lib/skill-discovery.ts'
import { runSyncOrchestrator } from './lib/sync-orchestrator.ts'
import { normalizeUrl } from './lib/url-ops.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const store = new MetaStore(root)
const meta = store.readMeta()
const errors: string[] = []

const arguments_ = process.argv.slice(2)
const branchFlagIndex = arguments_.findIndex(a => a === '--branch' || a === '-b')
const branch: string | undefined = branchFlagIndex === -1 ? undefined : arguments_[branchFlagIndex + 1]
const nameFlagIndex = arguments_.findIndex(a => a === '--name' || a === '-n')
const nameOverride: string | undefined = nameFlagIndex === -1 ? undefined : arguments_[nameFlagIndex + 1]
const positional = arguments_.find((_, index) => {
  if (branchFlagIndex !== -1 && (index === branchFlagIndex || index === branchFlagIndex + 1))
    return false
  if (nameFlagIndex !== -1 && (index === nameFlagIndex || index === nameFlagIndex + 1))
    return false
  return true
})
const url = positional

// ── Validate URL early (before UI) ──────────────────────────────────────────

if (!url) {
  p.intro('Upstream')
  p.log.error('Usage: pnpm upstream <github-url> [--branch <branch>] [--name <key>]')
  process.exit(1)
}

// ── Normalize and derive key ────────────────────────────────────────────────

const normalizedUrl = normalizeUrl(url.replace(/\.git$/, ''))
const urlParts = normalizedUrl.split('/')
const repoName = urlParts.at(-1)!
const orgName = urlParts.at(-2)!

let upstreamKey = nameOverride ?? (repoName === 'skills' ? orgName : repoName)

p.intro('Upstream')

// ── Check for upstream key collision ────────────────────────────────────────

const existing = meta.upstreams[upstreamKey]
if (existing && existing.url !== normalizedUrl && !nameOverride) {
  const answer = await p.text({
    message: `Key "${upstreamKey}" is already used by ${existing.url}. Enter a different key:`,
    validate: v => (v?.trim() ? undefined : 'Key cannot be empty'),
  })
  if (p.isCancel(answer)) {
    p.cancel('Cancelled')
    process.exit(0)
  }
  upstreamKey = answer as string
}

const submodulePath = `upstream/${upstreamKey}`
const upstreamDirectory = path.join(root, submodulePath)
const spinner = p.spinner()

const isNew = !submoduleExists(root, submodulePath)
const updateAction = isNew ? 'Adding' : 'Updating'
const branchSuffix = branch ? ` (branch: ${branch})` : ''
spinner.start(`${updateAction} ${submodulePath}${branchSuffix}`)

// --- Discover skills (for UI only; actual sync happens via orchestrator) ---

let skillDirectories: string[] = []
const discoverResult = discoverSkills(upstreamDirectory)
if (discoverResult.ok) {
  skillDirectories = discoverResult.data
    .map(skill => skill.path)
    .sort((a, b) =>
      (a.split('/').pop() ?? a).localeCompare(b.split('/').pop() ?? b),
    )
}
else {
  p.log.warn(`Failed to discover skills: ${discoverResult.error}`)
  errors.push(`Failed to discover skills: ${discoverResult.error}`)
}
spinner.stop(`${isNew ? 'Added' : 'Updated'} ${submodulePath}`)

// --- Skill selection (only if SKILL.md files exist) ---

const existingConfig = meta.upstreams[upstreamKey]
const skillsMap: Record<string, string> = {}

if (skillDirectories.length > 0) {
  const existingPaths = new Set(existingConfig?.skills ? Object.keys(existingConfig.skills) : [])

  const selected = await p.multiselect({
    message: `Select skills to sync from ${upstreamKey} (${skillDirectories.length} found, space to skip all)`,
    options: skillDirectories.map(skillPath => ({
      value: skillPath,
      label: skillPath.split('/').pop() ?? skillPath,
      hint: skillPath === '.' ? '(repo root)' : skillPath,
    })),
    initialValues: skillDirectories.filter(s => existingPaths.has(s)),
    required: false,
  })

  if (p.isCancel(selected)) {
    p.cancel('Cancelled')
    process.exit(0)
  }

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
        const outputPath = path.join(root, 'skills', outputName)
        if (existsSync(outputPath)) {
          rmSync(outputPath, { recursive: true })
          p.log.step(`removed skills/${outputName}`)
        }
      }
    }
  }
}

// --- Update meta.json ---

const branchValue = getBranchValue(branch, existingConfig)
const skillsValue = getSkillsValue(skillsMap, existingConfig)
const availableValue = existingConfig?.available ? { available: existingConfig.available } : {}
const newConfig: UpstreamMeta = {
  url: normalizedUrl,
  ...branchValue,
  ...skillsValue,
  ...availableValue,
}
store.updateUpstream(upstreamKey, newConfig)
const saveResult = store.saveMeta()
if (saveResult.ok) {
  p.log.success('Updated meta.json')
}
else {
  p.log.error(`Failed to save meta.json: ${saveResult.error}`)
  errors.push(saveResult.error)
}

// --- Copy selected skills via orchestrator ---

if (Object.keys(skillsMap).length > 0) {
  const orcResult = runSyncOrchestrator(
    {
      root,
      upstreamName: upstreamKey,
      upstreamConfig: newConfig,
      selectedSkills: skillsMap,
    },
    {
      onPhaseFailed: (phaseName, error) => {
        p.log.error(`Phase ${phaseName} failed: ${error}`)
      },
    },
  )

  if (orcResult.ok) {
    const result = orcResult.data.syncResult

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
  else {
    p.log.error(`Failed to sync skills: ${orcResult.error}`)
    errors.push(orcResult.error)
  }
}

// --- Create instructions file (if this is a reference-only upstream with no skills) ---

const instructionsDirectory = path.join(root, 'instructions')
const instructionsFile = path.join(instructionsDirectory, `${upstreamKey}.md`)
if (Object.keys(skillsMap).length === 0 && !existsSync(instructionsFile)) {
  mkdirSync(instructionsDirectory, { recursive: true })
  writeFileSync(instructionsFile, `# ${upstreamKey}\n\n<!-- Notes for authoring skills from this upstream -->\n`)
  p.log.step(`created instructions/${upstreamKey}.md`)
}

// ── Report and exit ───────────────────────────────────────────────────────

if (errors.length > 0) {
  p.log.warn(`${errors.length} error(s) occurred:`)
  for (const error of errors) {
    p.log.warn(`  - ${error}`)
  }
  p.outro('Upstream completed with errors')
  process.exit(1)
}

p.outro('Done')

function getBranchValue(branch: string | undefined, existingConfig: UpstreamMeta | undefined): Record<string, string> {
  if (branch)
    return { branch }
  if (existingConfig?.branch)
    return { branch: existingConfig.branch }
  return {}
}

function getSkillsValue(skillsMap: Record<string, string>, existingConfig: UpstreamMeta | undefined): Record<string, Record<string, string>> {
  if (Object.keys(skillsMap).length > 0)
    return { skills: skillsMap }
  if (existingConfig?.skills)
    return { skills: existingConfig.skills }
  return {}
}
