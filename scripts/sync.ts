/**
 * Add missing submodules (shallow), pull latest, copy upstream skill folders into skills/,
 * and update the `available` map in meta.json with content hashes for all upstream skills.
 */

import type { Meta, SkillMeta } from './types.ts'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { saveMeta } from './lib/metadataOps.ts'
import { discoverSkills } from './lib/skillDiscovery.ts'
import { copySkillsFromUpstream, hashSkillDir } from './lib/skillOps.ts'
import { ensureSubmodule } from './lib/submoduleOps.ts'
import { normalizeUrl } from './lib/urlOps.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const metaPath = join(root, 'meta.json')
const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as Meta
const force = process.argv.includes('--force')

// ── Normalize any shorthand URLs in meta.json ───────────────────────────────

let urlsNormalized = false
for (const config of Object.values(meta.upstreams)) {
  const full = normalizeUrl(config.url)
  if (full !== config.url) {
    config.url = full
    urlsNormalized = true
  }
}
if (urlsNormalized)
  saveMeta(meta, root)

const { upstreams } = meta

// ── Add/update all submodules ───────────────────────────────────────────────

console.log('Updating submodules...')
for (const [name, config] of Object.entries(upstreams)) {
  const path = `upstream/${name}`
  console.log(`  ${name}${config.branch ? ` (branch: ${config.branch})` : ''}`)
  ensureSubmodule(root, path, config.url, config.branch)
}
console.log('Submodules updated\n')

// ── Scan available skills, diff hashes, update meta.json ───────────────────

for (const [upstreamName, config] of Object.entries(upstreams)) {
  if (!config.skills)
    continue
  const upstreamPath = join(root, 'upstream', upstreamName)
  if (!existsSync(upstreamPath))
    continue

  const oldAvailable = config.available ?? {}
  const newAvailable: Record<string, string> = {}

  for (const skill of discoverSkills(upstreamPath)) {
    const skillPath = skill.path
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

// ── Copy selected upstream skills to skills/ ────────────────────────────────

for (const [upstreamName, config] of Object.entries(upstreams)) {
  if (!config.skills)
    continue
  const upstreamPath = join(root, 'upstream', upstreamName)
  if (!existsSync(upstreamPath)) {
    console.warn(`SKIP upstream/${upstreamName} — submodule directory missing`)
    continue
  }

  copySkillsFromUpstream(upstreamName, upstreamPath, config, root, console.log, force)
}

// ── Maintain authored/ symlinks ─────────────────────────────────────────────

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
