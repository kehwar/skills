/**
 * Add missing submodules (shallow), pull latest, copy upstream skill folders into skills/,
 * and update the `available` map in meta.json with content hashes for all upstream skills.
 */

import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Meta, SkillMeta } from './types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const metaPath = join(root, 'meta.json')
const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as Meta
const { upstreams } = meta

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

for (const [name, config] of Object.entries(upstreams)) {
  const path = `upstream/${name}`
  const subDir = join(root, path)
  if (!submoduleExists(path)) {
    // Not in .gitmodules at all — add from scratch
    const parentDir = join(root, dirname(path))
    if (!existsSync(parentDir)) mkdirSync(parentDir, { recursive: true })
    console.log(`Adding: ${path}${config.branch ? ` (branch: ${config.branch})` : ''}`)
    execInherit(`git submodule add --depth 1 ${config.url} ${path}`)
    if (config.branch) {
      execSync(
        `git fetch --depth 1 origin +refs/heads/${config.branch}:refs/remotes/origin/${config.branch}`,
        { cwd: subDir, stdio: 'inherit' },
      )
      execSync(`git checkout -B ${config.branch} FETCH_HEAD`, { cwd: subDir, stdio: 'inherit' })
    }
  }
  else if (!existsSync(subDir)) {
    // Registered in .gitmodules but directory missing — clone directly
    console.log(`Restoring: ${path}${config.branch ? ` (branch: ${config.branch})` : ''}`)
    mkdirSync(subDir, { recursive: true })
    execSync(
      `git clone --depth 1${config.branch ? ` -b ${config.branch}` : ''} ${config.url} ${subDir}`,
      { stdio: 'inherit' },
    )
  }
}

// ── Step 2: Ensure .gitmodules branch config matches meta.json ───────────────

for (const [name, config] of Object.entries(upstreams)) {
  const path = `upstream/${name}`
  if (!submoduleExists(path)) continue
  if (config.branch) {
    exec(`git config -f .gitmodules submodule.${path}.branch ${config.branch}`)
  }
  else {
    try { exec(`git config -f .gitmodules --unset submodule.${path}.branch`) } catch { /* not set */ }
  }
}

// ── Step 3: Pull latest (shallow) ────────────────────────────────────────────

console.log('\nUpdating submodules...')
for (const [name, config] of Object.entries(upstreams)) {
  const subDir = join(root, 'upstream', name)
  if (!existsSync(subDir)) {
    console.warn(`SKIP upstream/${name} — directory missing`)
    continue
  }
  if (config.branch) {
    console.log(`  fetching ${name} (branch: ${config.branch})`)
    execSync(
      `git fetch --depth 1 origin +refs/heads/${config.branch}:refs/remotes/origin/${config.branch}`,
      { cwd: subDir, stdio: 'inherit' },
    )
    execSync(`git checkout -B ${config.branch} FETCH_HEAD`, { cwd: subDir, stdio: 'inherit' })
  }
  else {
    execSync('git fetch --depth 1', { cwd: subDir, stdio: 'inherit' })
    execSync('git reset --hard FETCH_HEAD', { cwd: subDir, stdio: 'inherit' })
  }
}
console.log('Submodules updated\n')

// ── Step 4: Scan available skills, diff hashes, update meta.json ─────────────

for (const [upstreamName, config] of Object.entries(upstreams)) {
  if (!config.skills) continue
  const upstreamPath = join(root, 'upstream', upstreamName)
  if (!existsSync(upstreamPath)) continue

  const oldAvailable = config.available ?? {}
  const newAvailable: Record<string, string> = {}

  for (const skillPath of findSkillDirs(upstreamPath)) {
    newAvailable[skillPath] = hashSkillDir(
      skillPath === '.' ? upstreamPath : join(upstreamPath, skillPath),
    )
  }

  // Report changes
  const allPaths = new Set([...Object.keys(oldAvailable), ...Object.keys(newAvailable)])
  const isSelected = (p: string) => p in config.skills!

  for (const p of [...allPaths].sort()) {
    const oldHash = oldAvailable[p]
    const newHash = newAvailable[p]
    const tag = isSelected(p) ? ' [included]' : ''

    if (!oldHash) {
      console.log(`  + ${upstreamName}/${p}${tag}  (new)`)
    }
    else if (!newHash) {
      console.log(`  - ${upstreamName}/${p}${tag}  (removed)`)
    }
    else if (oldHash !== newHash) {
      console.log(`  ~ ${upstreamName}/${p}${tag}  (${oldHash} → ${newHash})`)
    }
  }

  meta.upstreams[upstreamName].available = newAvailable
}

meta.upstreams = Object.fromEntries(Object.entries(meta.upstreams).sort(([a], [b]) => a.localeCompare(b)))
writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n')

// ── Step 5: Copy selected upstream skills to skills/ ─────────────────────────

for (const [upstreamName, config] of Object.entries(upstreams)) {
  if (!config.skills) continue
  const upstreamPath = join(root, 'upstream', upstreamName)
  if (!existsSync(upstreamPath)) {
    console.warn(`SKIP upstream/${upstreamName} — submodule directory missing`)
    continue
  }

  for (const [skillPath, outputName] of Object.entries(config.skills)) {
    const sourcePath = skillPath === '.' ? upstreamPath : join(upstreamPath, skillPath)
    const outputPath = join(root, 'skills', outputName)

    if (!existsSync(sourcePath)) {
      console.warn(`SKIP ${upstreamName}/${skillPath} — path not found in submodule`)
      continue
    }

    if (existsSync(outputPath)) rmSync(outputPath, { recursive: true })
    mkdirSync(outputPath, { recursive: true })
    cpSync(sourcePath, outputPath, { recursive: true })

    for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
      const licenseSrc = join(upstreamPath, name)
      if (existsSync(licenseSrc)) { cpSync(licenseSrc, join(outputPath, 'LICENSE.md')); break }
    }

    const sha = getGitSha(upstreamPath)
    const contentHash = meta.upstreams[upstreamName].available?.[skillPath] ?? 'unknown'
    const date = new Date().toISOString().split('T')[0]
    const upstreamConfig = meta.upstreams[upstreamName]
    const skillMeta: SkillMeta = {
      type: 'synced',
      upstream: upstreamName,
      sourceUrl: upstreamConfig.url,
      ...(upstreamConfig.branch ? { branch: upstreamConfig.branch } : {}),
      skillPath,
      gitSha: sha ?? 'unknown',
      contentHash,
      syncedAt: date,
    }
    writeFileSync(join(outputPath, 'meta.json'), JSON.stringify(skillMeta, null, 2) + '\n')

    console.log(`synced  ${upstreamName}/${skillPath} → skills/${outputName}`)
  }
}

// ── Step 6: Maintain authored/ symlinks ──────────────────────────────────────

const authoredDir = join(root, 'authored')

// Collect all authored skills from per-skill meta.json
const skillsDir = join(root, 'skills')
for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const skillMetaPath = join(skillsDir, entry.name, 'meta.json')
  if (!existsSync(skillMetaPath)) continue

  const skillMeta = JSON.parse(readFileSync(skillMetaPath, 'utf-8')) as SkillMeta
  let linkPath: string
  let linkTarget: string

  if (skillMeta.type === 'authored') {
    linkPath = join(authoredDir, entry.name)
    linkTarget = relative(authoredDir, join(skillsDir, entry.name))
  }
  else if (skillMeta.type === 'authored-from-source') {
    const sourceDir = join(authoredDir, skillMeta.source)
    mkdirSync(sourceDir, { recursive: true })
    linkPath = join(sourceDir, entry.name)
    linkTarget = relative(sourceDir, join(skillsDir, entry.name))
  }
  else {
    continue
  }

  if (!existsSync(linkPath)) {
    mkdirSync(dirname(linkPath), { recursive: true })
    symlinkSync(linkTarget, linkPath)
    console.log(`linked  authored: ${entry.name}`)
  }
}

// Remove stale symlinks in authored/
function pruneStaleSymlinks(dir: string): void {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isSymbolicLink()) {
      const skillName = entry.name
      const targetMetaPath = join(skillsDir, skillName, 'meta.json')
      if (!existsSync(targetMetaPath)) {
        rmSync(full)
        console.log(`removed stale authored symlink: ${skillName}`)
        continue
      }
      const targetMeta = JSON.parse(readFileSync(targetMetaPath, 'utf-8')) as SkillMeta
      if (targetMeta.type !== 'authored' && targetMeta.type !== 'authored-from-source') {
        rmSync(full)
        console.log(`removed stale authored symlink: ${skillName}`)
      }
    }
    else if (entry.isDirectory()) {
      pruneStaleSymlinks(full)
      // Remove empty subdirs
      if (readdirSync(full).length === 0) rmSync(full)
    }
  }
}
pruneStaleSymlinks(authoredDir)

console.log('\nDone')
