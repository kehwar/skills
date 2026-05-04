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

import * as p from '@clack/prompts'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Meta, SkillMeta, UpstreamMeta } from './types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const metaPath = join(root, 'meta.json')
const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as Meta

const args = process.argv.slice(2)
const branchFlagIdx = args.findIndex(a => a === '--branch' || a === '-b')
const branch: string | undefined = branchFlagIdx !== -1 ? args[branchFlagIdx + 1] : undefined
const nameFlagIdx = args.findIndex(a => a === '--name' || a === '-n')
const nameOverride: string | undefined = nameFlagIdx !== -1 ? args[nameFlagIdx + 1] : undefined
const positional = args.filter((_, i) => {
  if (branchFlagIdx !== -1 && (i === branchFlagIdx || i === branchFlagIdx + 1)) return false
  if (nameFlagIdx !== -1 && (i === nameFlagIdx || i === nameFlagIdx + 1)) return false
  return true
})
const url = positional[0]

if (!url) {
  console.error('Usage: pnpm upstream <github-url> [--branch <branch>] [--name <key>]')
  process.exit(1)
}

// --- Utilities ---

function exec(cmd: string): void {
  execSync(cmd, { cwd: root, stdio: 'inherit' })
}

function execCapture(cmd: string, cwd = root): string {
  return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}

function submoduleExists(path: string): boolean {
  const gitmodulesPath = join(root, '.gitmodules')
  if (!existsSync(gitmodulesPath)) return false
  return readFileSync(gitmodulesPath, 'utf-8').includes(`path = ${path}`)
}

function getGitSha(dir: string): string | null {
  try { return execCapture('git rev-parse HEAD', dir) }
  catch { return null }
}

/** Recursively find directories that contain a SKILL.md, relative to `dir`. */
function findSkillDirs(dir: string): string[] {
  const results: string[] = []
  function walk(current: string): void {
    let entries: Dirent[]
    try { entries = readdirSync(current, { withFileTypes: true }) }
    catch { return }
    if (entries.some(e => e.isFile() && e.name === 'SKILL.md')) {
      results.push(relative(dir, current) || '.')
      return
    }
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.'))
        walk(join(current, entry.name))
    }
  }
  walk(dir)
  return results
}

function saveMeta(): void {
  meta.upstreams = Object.fromEntries(Object.entries(meta.upstreams).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n')
}

function copySkills(upstreamName: string, upstreamDir: string, config: UpstreamMeta): void {
  if (!config.skills) return
  const sha = getGitSha(upstreamDir)
  const date = new Date().toISOString().split('T')[0]

  for (const [skillPath, outputName] of Object.entries(config.skills)) {
    const sourcePath = skillPath === '.' ? upstreamDir : join(upstreamDir, skillPath)
    const outputPath = join(root, 'skills', outputName)

    if (!existsSync(sourcePath)) {
      p.log.warn(`SKIP ${skillPath} — not found in submodule`)
      continue
    }

    if (existsSync(outputPath)) rmSync(outputPath, { recursive: true })
    mkdirSync(outputPath, { recursive: true })
    cpSync(sourcePath, outputPath, { recursive: true })

    for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
      const src = join(upstreamDir, name)
      if (existsSync(src)) { cpSync(src, join(outputPath, 'LICENSE.md')); break }
    }

    const skillMeta: SkillMeta = {
      type: 'synced',
      upstream: upstreamName,
      sourceUrl: config.url,
      ...(config.branch ? { branch: config.branch } : {}),
      skillPath,
      gitSha: sha ?? 'unknown',
      contentHash: 'pending',
      syncedAt: date,
    }
    writeFileSync(join(outputPath, 'meta.json'), JSON.stringify(skillMeta, null, 2) + '\n')
    p.log.step(`copied  ${skillPath} → skills/${outputName}`)
  }
}

// --- Derive key ---

const normalizedUrl = url.replace(/\.git$/, '')
const urlParts = normalizedUrl.split('/')
const repoName = urlParts[urlParts.length - 1]!
const orgName = urlParts[urlParts.length - 2]!

let upstreamKey = nameOverride ?? (repoName === 'skills' ? orgName : repoName)

// Check for collision with existing key pointing to a different URL
const existing = meta.upstreams[upstreamKey]
if (existing && existing.url !== url && !nameOverride) {
  const answer = await p.text({
    message: `Key "${upstreamKey}" is already used by ${existing.url}. Enter a different key:`,
    validate: v => (!v.trim() ? 'Key cannot be empty' : undefined),
  })
  if (p.isCancel(answer)) { p.cancel('Cancelled'); process.exit(0) }
  upstreamKey = answer as string
}

// --- Main ---

p.intro('Upstream')

const submodulePath = `upstream/${upstreamKey}`
const upstreamDir = join(root, submodulePath)
const spinner = p.spinner()

if (!submoduleExists(submodulePath)) {
  spinner.start(`Adding submodule ${submodulePath}${branch ? ` (branch: ${branch})` : ''}`)
  try {
    exec(`git submodule add --depth 1${branch ? ` -b ${branch}` : ''} ${url} ${submodulePath}`)
    spinner.stop(`Added ${submodulePath}`)
  }
  catch (e) {
    spinner.stop(`Failed: ${e}`)
    process.exit(1)
  }
}
else {
  spinner.start(`Updating ${submodulePath}`)
  try {
    exec(`git submodule update --remote --merge --depth 1 -- ${submodulePath}`)
    spinner.stop(`Updated ${submodulePath}`)
  }
  catch (e) {
    spinner.stop(`Failed to update: ${e}`)
  }
}

// --- Skill selection (only if SKILL.md files exist) ---

const skillDirs = findSkillDirs(upstreamDir).sort((a, b) =>
  (a.split('/').pop() ?? a).localeCompare(b.split('/').pop() ?? b),
)

const existingConfig = meta.upstreams[upstreamKey]
let skillsMap: Record<string, string> = {}

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

  for (const skillPath of selected as string[]) {
    skillsMap[skillPath] = existingConfig?.skills?.[skillPath] ?? (skillPath.split('/').pop() ?? skillPath)
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
  url,
  ...(branch ? { branch } : existingConfig?.branch ? { branch: existingConfig.branch } : {}),
  ...(Object.keys(skillsMap).length > 0 ? { skills: skillsMap } : existingConfig?.skills ? { skills: existingConfig.skills } : {}),
  ...(existingConfig?.available ? { available: existingConfig.available } : {}),
}
meta.upstreams[upstreamKey] = newConfig
saveMeta()
p.log.success('Updated meta.json')

// --- Copy selected skills ---

if (Object.keys(skillsMap).length > 0) copySkills(upstreamKey, upstreamDir, newConfig)

// --- Create instructions file (if this is a reference-only upstream with no skills) ---

const instructionsDir = join(root, 'instructions')
const instructionsFile = join(instructionsDir, `${upstreamKey}.md`)
if (!Object.keys(skillsMap).length && !existsSync(instructionsFile)) {
  mkdirSync(instructionsDir, { recursive: true })
  writeFileSync(instructionsFile, `# ${upstreamKey}\n\n<!-- Notes for authoring skills from this upstream -->\n`)
  p.log.step(`created instructions/${upstreamKey}.md`)
}

p.outro('Done')
