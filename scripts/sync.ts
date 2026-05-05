/**
 * Add missing submodules (shallow), pull latest, copy upstream skill folders into skills/,
 * and update the `available` map in meta.json with content hashes for all upstream skills.
 */

import type { Meta, SkillMeta } from './types.ts'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copySkillsFromUpstream, exec, findSkillDirs, hashSkillDir, saveMeta, submoduleExists } from './lib.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const metaPath = join(root, 'meta.json')
const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as Meta
const { upstreams } = meta

// ── Step 1: Add any missing submodules ───────────────────────────────────────

for (const [name, config] of Object.entries(upstreams)) {
  const path = `upstream/${name}`
  const subDir = join(root, path)
  if (!submoduleExists(root, path)) {
    // Not in .gitmodules at all — add from scratch
    const parentDir = join(root, dirname(path))
    if (!existsSync(parentDir))
      mkdirSync(parentDir, { recursive: true })
    console.log(`Adding: ${path}${config.branch ? ` (branch: ${config.branch})` : ''}`)
    exec(`git submodule add --depth 1 ${config.url} ${path}`, { cwd: root, inherit: true })
    if (config.branch) {
      exec(
        `git fetch --depth 1 origin +refs/heads/${config.branch}:refs/remotes/origin/${config.branch}`,
        { cwd: subDir, inherit: true },
      )
      exec(`git checkout -B ${config.branch} FETCH_HEAD`, { cwd: subDir, inherit: true })
    }
  }
  else if (!existsSync(subDir)) {
    // Registered in .gitmodules but directory missing — clone directly
    console.log(`Restoring: ${path}${config.branch ? ` (branch: ${config.branch})` : ''}`)
    mkdirSync(subDir, { recursive: true })
    exec(
      `git clone --depth 1${config.branch ? ` -b ${config.branch}` : ''} ${config.url} ${subDir}`,
      { inherit: true },
    )
  }
}

// ── Step 2: Ensure .gitmodules branch config matches meta.json ───────────────

for (const [name, config] of Object.entries(upstreams)) {
  const path = `upstream/${name}`
  if (!submoduleExists(root, path))
    continue
  if (config.branch) {
    exec(`git config -f .gitmodules submodule.${path}.branch ${config.branch}`, { cwd: root })
  }
  else {
    exec(`git config -f .gitmodules --unset submodule.${path}.branch`, { cwd: root, safe: true })
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
    exec(
      `git fetch --depth 1 origin +refs/heads/${config.branch}:refs/remotes/origin/${config.branch}`,
      { cwd: subDir, inherit: true },
    )
    exec(`git checkout -B ${config.branch} FETCH_HEAD`, { cwd: subDir, inherit: true })
  }
  else {
    exec('git fetch --depth 1', { cwd: subDir, inherit: true })
    exec('git reset --hard FETCH_HEAD', { cwd: subDir, inherit: true })
  }
}
console.log('Submodules updated\n')

// ── Step 4: Scan available skills, diff hashes, update meta.json ─────────────

for (const [upstreamName, config] of Object.entries(upstreams)) {
  if (!config.skills)
    continue
  const upstreamPath = join(root, 'upstream', upstreamName)
  if (!existsSync(upstreamPath))
    continue

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

saveMeta(meta, root)

// ── Step 5: Copy selected upstream skills to skills/ ─────────────────────────

for (const [upstreamName, config] of Object.entries(upstreams)) {
  if (!config.skills)
    continue
  const upstreamPath = join(root, 'upstream', upstreamName)
  if (!existsSync(upstreamPath)) {
    console.warn(`SKIP upstream/${upstreamName} — submodule directory missing`)
    continue
  }

  copySkillsFromUpstream(upstreamName, upstreamPath, config, root)
}

// ── Step 6: Maintain authored/ symlinks ──────────────────────────────────────

const authoredDir = join(root, 'authored')

// Collect all authored skills from per-skill meta.json
const skillsDir = join(root, 'skills')
for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
  if (!entry.isDirectory())
    continue
  const skillMetaPath = join(skillsDir, entry.name, 'meta.json')
  if (!existsSync(skillMetaPath))
    continue

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
  if (!existsSync(dir))
    return
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
      if (readdirSync(full).length === 0)
        rmSync(full)
    }
  }
}
pruneStaleSymlinks(authoredDir)

console.log('\nDone')
