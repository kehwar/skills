/**
 * Add missing submodules (shallow), pull latest, copy upstream skill folders into skills/,
 * and update the `available` map in meta.json with content hashes for all upstream skills.
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectAuthoredSkills, linkAuthoredSkills, pruneStaleLinksinAuthoredDir } from './lib/authoredSkillsOps.ts'
import { getGitSha } from './lib/gitOps.ts'
import { MetaStore } from './lib/metaStore.ts'
import { discoverSkills } from './lib/skillDiscovery.ts'
import { copySkillsFromUpstream, hashSkillDir } from './lib/skillOps.ts'
import { ensureSubmodule } from './lib/submoduleOps.ts'
import { normalizeUrl } from './lib/urlOps.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const store = new MetaStore(root)
const force = process.argv.includes('--force')

// ── Normalize any shorthand URLs in meta.json ───────────────────────────────

let urlsNormalized = false
const upstreams = store.getAllUpstreams()
for (const [key, config] of Object.entries(upstreams)) {
  const full = normalizeUrl(config.url)
  if (full !== config.url) {
    store.updateUpstream(key, { url: full })
    urlsNormalized = true
  }
}
if (urlsNormalized)
  store.saveMeta()

// ── Add/update all submodules ───────────────────────────────────────────────

console.log('Updating submodules...')
for (const [name, config] of Object.entries(upstreams)) {
  const path = `upstream/${name}`
  console.log(`  ${name}${config.branch ? ` (branch: ${config.branch})` : ''}`)
  ensureSubmodule(root, path, config.url, config.branch)
}
console.log('Submodules updated\n')

// ── Scan available skills, capture git SHA, diff hashes, update meta.json ───

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

  // Capture git SHA
  const gitSha = getGitSha(upstreamPath)

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

  store.updateUpstream(upstreamName, { available: newAvailable, ...(gitSha && { gitSha }) })
}

store.saveMeta()

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
const skillsDir = join(root, 'skills')

const collected = collectAuthoredSkills(skillsDir)
linkAuthoredSkills(collected, skillsDir, authoredDir, console.log)
pruneStaleLinksinAuthoredDir(authoredDir, skillsDir, console.log)

console.log('\nDone')
