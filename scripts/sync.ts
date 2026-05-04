/**
 * Add missing submodules (shallow), pull latest, copy vendor skill folders into skills/,
 * and update the `available` map in meta.json with content hashes for all vendor skills.
 */

import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Meta } from './types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const metaPath = join(root, 'meta.json')
const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as Meta
const { sources, vendors } = meta

function exec(cmd: string, cwd = root): string {
  return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}

function execInherit(cmd: string): void {
  execSync(cmd, { cwd: root, stdio: 'inherit' })
}

function getGitSha(dir: string): string | null {
  try { return exec('git rev-parse HEAD', dir) }
  catch { return null }
}

function submoduleExists(path: string): boolean {
  const gitmodulesPath = join(root, '.gitmodules')
  if (!existsSync(gitmodulesPath)) return false
  return readFileSync(gitmodulesPath, 'utf-8').includes(`path = ${path}`)
}

/** Recursively find directories containing SKILL.md, relative to dir. */
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

/** Hash all file contents in a directory (sorted by relative path). 12-char prefix. */
function hashSkillDir(dir: string): string {
  const h = createHash('sha256')
  const entries: string[] = []
  function collect(current: string): void {
    let dirents: Dirent[]
    try { dirents = readdirSync(current, { withFileTypes: true }) }
    catch { return }
    for (const d of dirents) {
      const full = join(current, d.name)
      if (d.isDirectory() && !d.name.startsWith('.')) collect(full)
      else if (d.isFile()) entries.push(relative(dir, full))
    }
  }
  collect(dir)
  entries.sort()
  for (const rel of entries) {
    h.update(rel)
    h.update(readFileSync(join(dir, rel)))
  }
  return h.digest('hex').slice(0, 12)
}

// ── Step 1: Add any missing submodules ───────────────────────────────────────

const toAdd: Array<{ path: string; url: string }> = []

for (const [name, url] of Object.entries(sources)) {
  const path = `sources/${name}`
  if (!submoduleExists(path)) toAdd.push({ path, url })
}

for (const [name, config] of Object.entries(vendors)) {
  const path = `vendor/${name}`
  if (!submoduleExists(path)) toAdd.push({ path, url: config.source })
}

for (const { path, url } of toAdd) {
  const parentDir = join(root, dirname(path))
  if (!existsSync(parentDir)) mkdirSync(parentDir, { recursive: true })
  console.log(`Adding: ${path}`)
  execInherit(`git submodule add --depth 1 ${url} ${path}`)
}

// ── Step 2: Pull latest (shallow) ────────────────────────────────────────────

console.log('\nUpdating submodules...')
execInherit('git submodule update --remote --merge --depth 1')
console.log('Submodules updated\n')

// ── Step 3: Scan available skills, diff hashes, update meta.json ─────────────

for (const [vendorName, config] of Object.entries(vendors)) {
  const vendorPath = join(root, 'vendor', vendorName)
  if (!existsSync(vendorPath)) continue

  const oldAvailable = config.available ?? {}
  const newAvailable: Record<string, string> = {}

  for (const skillPath of findSkillDirs(vendorPath)) {
    newAvailable[skillPath] = hashSkillDir(
      skillPath === '.' ? vendorPath : join(vendorPath, skillPath),
    )
  }

  // Report changes
  const allPaths = new Set([...Object.keys(oldAvailable), ...Object.keys(newAvailable)])
  const isSelected = (p: string) => p in config.skills

  for (const p of [...allPaths].sort()) {
    const oldHash = oldAvailable[p]
    const newHash = newAvailable[p]
    const tag = isSelected(p) ? ' [included]' : ''

    if (!oldHash) {
      console.log(`  + ${vendorName}/${p}${tag}  (new)`)
    }
    else if (!newHash) {
      console.log(`  - ${vendorName}/${p}${tag}  (removed)`)
    }
    else if (oldHash !== newHash) {
      console.log(`  ~ ${vendorName}/${p}${tag}  (${oldHash} → ${newHash})`)
    }
  }

  meta.vendors[vendorName].available = newAvailable
}

writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n')

// ── Step 4: Copy selected vendor skills to skills/ ───────────────────────────

for (const [vendorName, config] of Object.entries(vendors)) {
  const vendorPath = join(root, 'vendor', vendorName)
  if (!existsSync(vendorPath)) {
    console.warn(`SKIP vendor/${vendorName} — submodule directory missing`)
    continue
  }

  for (const [skillPath, outputName] of Object.entries(config.skills)) {
    const sourcePath = skillPath === '.' ? vendorPath : join(vendorPath, skillPath)
    const outputPath = join(root, 'skills', outputName)

    if (!existsSync(sourcePath)) {
      console.warn(`SKIP ${vendorName}/${skillPath} — path not found in submodule`)
      continue
    }

    if (existsSync(outputPath)) rmSync(outputPath, { recursive: true })
    mkdirSync(outputPath, { recursive: true })
    cpSync(sourcePath, outputPath, { recursive: true })

    for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
      const licenseSrc = join(vendorPath, name)
      if (existsSync(licenseSrc)) { cpSync(licenseSrc, join(outputPath, 'LICENSE.md')); break }
    }

    const sha = getGitSha(vendorPath)
    const contentHash = meta.vendors[vendorName].available[skillPath] ?? 'unknown'
    const date = new Date().toISOString().split('T')[0]
    writeFileSync(
      join(outputPath, 'SYNC.md'),
      `# Sync Info\n\n- **Source:** \`vendor/${vendorName}/${skillPath}\`\n- **Git SHA:** \`${sha ?? 'unknown'}\`\n- **Content hash:** \`${contentHash}\`\n- **Synced:** ${date}\n`,
    )

    console.log(`synced  ${vendorName}/${skillPath} → skills/${outputName}`)
  }
}

console.log('\nDone')
