/**
 * Add missing submodules (shallow), pull latest, copy upstream skill folders into skills/,
 * and update the `available` map in meta.json with content hashes for all upstream skills.
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import { collectAuthoredSkills, linkAuthoredSkills, pruneStaleLinksinAuthoredDir } from './lib/authoredSkillsOps.ts'
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

p.log.step('Updating submodules...')
for (const [name, config] of Object.entries(upstreams)) {
  const path = `upstream/${name}`
  p.log.info(`  ${name}${config.branch ? ` (branch: ${config.branch})` : ''}`)
  ensureSubmodule(root, path, config.url, config.branch)
}
p.log.step('Submodules updated')

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

  // Report changes
  const allPaths = new Set([...Object.keys(oldAvailable), ...Object.keys(newAvailable)])
  const isSelected = (path: string) => path in config.skills!

  for (const path of [...allPaths].sort()) {
    const oldHash = oldAvailable[path]
    const newHash = newAvailable[path]
    const tag = isSelected(path) ? ' [included]' : ''

    if (!oldHash) {
      p.log.info(`  + ${upstreamName}/${path}${tag}  (new)`)
    }
    else if (!newHash) {
      p.log.info(`  - ${upstreamName}/${path}${tag}  (removed)`)
    }
    else if (oldHash !== newHash) {
      p.log.info(`  ~ ${upstreamName}/${path}${tag}  (${oldHash} → ${newHash})`)
    }
  }

  store.updateUpstream(upstreamName, { available: newAvailable })
}

store.saveMeta()

// ── Copy selected upstream skills to skills/ ────────────────────────────────

for (const [upstreamName, config] of Object.entries(upstreams)) {
  if (!config.skills)
    continue
  const upstreamPath = join(root, 'upstream', upstreamName)
  if (!existsSync(upstreamPath)) {
    p.log.warn(`SKIP upstream/${upstreamName} — submodule directory missing`)
    continue
  }

  const result = copySkillsFromUpstream(upstreamName, upstreamPath, config, root, force)

  // Log results
  for (const skill of result.synced) {
    p.log.step(`synced  ${upstreamName}/${skill.skillPath} → skills/${skill.outputName}`)
  }
  for (const skill of result.skipped) {
    p.log.info(`unchanged  ${upstreamName}/${skill.skillPath} → skills/${skill.outputName}`)
  }
  for (const skill of result.errors) {
    p.log.error(`FAILED ${upstreamName}/${skill.skillPath}: ${skill.error}`)
  }
}

// ── Maintain authored/ symlinks ─────────────────────────────────────────────

const authoredDir = join(root, 'authored')
const skillsDir = join(root, 'skills')

const collected = collectAuthoredSkills(skillsDir)
linkAuthoredSkills(collected, skillsDir, authoredDir, msg => p.log.step(msg))
pruneStaleLinksinAuthoredDir(authoredDir, skillsDir, msg => p.log.step(msg))

p.outro('Done')
