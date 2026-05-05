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
const errors: string[] = []

p.intro('Sync')

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
if (urlsNormalized) {
  const saveResult = store.saveMeta()
  if (!saveResult.ok)
    errors.push(saveResult.error)
}

// ── Add/update all submodules ───────────────────────────────────────────────

p.log.step('Updating submodules...')
for (const [name, config] of Object.entries(upstreams)) {
  const path = `upstream/${name}`
  p.log.info(`  ${name}${config.branch ? ` (branch: ${config.branch})` : ''}`)
  const result = ensureSubmodule(root, path, config.url, config.branch)
  if (!result.ok) {
    errors.push(`Failed to update submodule ${name}: ${result.error}`)
  }
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

  const discoverResult = discoverSkills(upstreamPath)
  if (!discoverResult.ok) {
    errors.push(`Failed to discover skills in ${upstreamName}: ${discoverResult.error}`)
    continue
  }

  for (const skill of discoverResult.data) {
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

const saveMeta = store.saveMeta()
if (!saveMeta.ok)
  errors.push(saveMeta.error)

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

  if (!result.ok) {
    errors.push(`Failed to copy skills from ${upstreamName}: ${result.error}`)
    continue
  }

  // Log results
  for (const skill of result.data.synced) {
    p.log.step(`synced  ${upstreamName}/${skill.skillPath} → skills/${skill.outputName}`)
  }
  for (const skill of result.data.skipped) {
    p.log.info(`unchanged  ${upstreamName}/${skill.skillPath} → skills/${skill.outputName}`)
  }
  for (const skill of result.data.errors) {
    p.log.error(`FAILED ${upstreamName}/${skill.skillPath}: ${skill.error}`)
    errors.push(`Skill copy failed: ${upstreamName}/${skill.skillPath}: ${skill.error}`)
  }
}

// ── Maintain authored/ symlinks ─────────────────────────────────────────────

const authoredDir = join(root, 'authored')
const skillsDir = join(root, 'skills')

const collectResult = collectAuthoredSkills(skillsDir)
if (!collectResult.ok) {
  errors.push(`Failed to collect authored skills: ${collectResult.error}`)
}
else {
  const linkResult = linkAuthoredSkills(collectResult.data, skillsDir, authoredDir)
  if (!linkResult.ok) {
    errors.push(`Failed to link authored skills: ${linkResult.error}`)
  }
  else {
    for (const msg of linkResult.data) {
      p.log.step(msg)
    }
  }

  const pruneResult = pruneStaleLinksinAuthoredDir(authoredDir, skillsDir)
  if (!pruneResult.ok) {
    errors.push(`Failed to prune stale symlinks: ${pruneResult.error}`)
  }
  else {
    for (const msg of pruneResult.data) {
      p.log.step(msg)
    }
  }
}

// ── Report and exit ───────────────────────────────────────────────────────

if (errors.length > 0) {
  p.log.warn(`${errors.length} error(s) occurred:`)
  for (const err of errors) {
    p.log.warn(`  - ${err}`)
  }
  p.outro('Sync completed with errors')
  process.exit(1)
}

p.outro('Done')
