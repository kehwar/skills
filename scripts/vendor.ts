/**
 * Interactive vendor sync.
 * Usage: pnpm vendor <github-url>
 *
 * 1. Adds/updates the repo as a shallow submodule under vendor/<name>
 * 2. Scans for SKILL.md files recursively
 * 3. Multiselect prompt (pre-selects currently configured skills)
 * 4. Updates meta.json vendors block
 * 5. Copies selected skills to skills/
 */

import * as p from '@clack/prompts'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Meta, VendorSkillMeta } from './types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const metaPath = join(root, 'meta.json')
const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as Meta
const currentVendors = meta.vendors

const url = process.argv[2]
if (!url) {
  console.error('Usage: pnpm vendor <github-url>')
  process.exit(1)
}

// --- Utilities ---

function exec(cmd: string): void {
  execSync(cmd, { cwd: root, stdio: 'inherit' })
}

function submoduleExists(path: string): boolean {
  const gitmodulesPath = join(root, '.gitmodules')
  if (!existsSync(gitmodulesPath)) return false
  return readFileSync(gitmodulesPath, 'utf-8').includes(`path = ${path}`)
}

function getGitSha(dir: string): string | null {
  try {
    return execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf-8', stdio: 'pipe' }).trim()
  }
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
      const rel = relative(dir, current)
      results.push(rel || '.')
      return // don't recurse into skill dirs
    }

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.'))
        walk(join(current, entry.name))
    }
  }
  walk(dir)
  return results
}

function updateMetaVendors(newVendors: Record<string, VendorSkillMeta>): void {
  meta.vendors = newVendors
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n')
}

function copySkills(vendorName: string, vendorDir: string, config: VendorSkillMeta): void {
  const sha = getGitSha(vendorDir)
  const date = new Date().toISOString().split('T')[0]

  for (const [skillPath, outputName] of Object.entries(config.skills)) {
    const sourcePath = skillPath === '.' ? vendorDir : join(vendorDir, skillPath)
    const outputPath = join(root, 'skills', outputName)

    if (!existsSync(sourcePath)) {
      p.log.warn(`SKIP ${skillPath} — not found in submodule`)
      continue
    }

    if (existsSync(outputPath)) rmSync(outputPath, { recursive: true })
    mkdirSync(outputPath, { recursive: true })
    cpSync(sourcePath, outputPath, { recursive: true })

    for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
      const src = join(vendorDir, name)
      if (existsSync(src)) { cpSync(src, join(outputPath, 'LICENSE.md')); break }
    }

    writeFileSync(
      join(outputPath, 'SYNC.md'),
      `# Sync Info\n\n- **Source:** \`vendor/${vendorName}/${skillPath}\`\n- **Git SHA:** \`${sha ?? 'unknown'}\`\n- **Synced:** ${date}\n`,
    )

    p.log.step(`copied  ${skillPath} → skills/${outputName}`)
  }
}

// --- Main ---

p.intro('Vendor Skill Sync')

const urlParts = url.replace(/\.git$/, '').split('/')
// Use the org/user segment (second-to-last), not the repo name (last)
const vendorName = urlParts[urlParts.length - 2]!
const submodulePath = `vendor/${vendorName}`
const vendorDir = join(root, submodulePath)

const spinner = p.spinner()

if (!submoduleExists(submodulePath)) {
  spinner.start(`Adding submodule ${submodulePath}`)
  try {
    exec(`git submodule add --depth 1 ${url} ${submodulePath}`)
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

const skillDirs = findSkillDirs(vendorDir).sort((a, b) =>
  (a.split('/').pop() ?? a).localeCompare(b.split('/').pop() ?? b),
)
if (skillDirs.length === 0) {
  p.log.error('No SKILL.md files found in this repository')
  process.exit(1)
}

const existingConfig = currentVendors[vendorName]
const existingPaths = new Set(existingConfig ? Object.keys(existingConfig.skills) : [])

const selected = await p.multiselect({
  message: `Select skills to sync from ${vendorName} (${skillDirs.length} found)`,
  options: skillDirs.map(skillPath => ({
    value: skillPath,
    label: skillPath.split('/').pop() ?? skillPath,
    hint: skillPath === '.' ? '(repo root)' : skillPath,
  })),
  initialValues: skillDirs.filter(s => existingPaths.has(s)),
  required: false,
})

if (p.isCancel(selected)) {
  p.cancel('Cancelled')
  process.exit(0)
}

const skillsMap: Record<string, string> = {}
for (const skillPath of selected as string[]) {
  skillsMap[skillPath] = existingConfig?.skills[skillPath] ?? (skillPath.split('/').pop() ?? skillPath)
}

const newVendors = { ...currentVendors }
if (Object.keys(skillsMap).length > 0) {
  newVendors[vendorName] = { source: url, skills: skillsMap }
}
else if (vendorName in newVendors) {
  delete newVendors[vendorName]
}

updateMetaVendors(newVendors)
p.log.success('Updated meta.ts')

// Remove skills that were deselected
const selectedOutputNames = new Set(Object.values(skillsMap))
if (existingConfig) {
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

if (Object.keys(skillsMap).length > 0)
  copySkills(vendorName, vendorDir, { source: url, skills: skillsMap })

p.outro('Done')
