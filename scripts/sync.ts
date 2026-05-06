#!/usr/bin/env node
/**
 * Add missing submodules (shallow), pull latest, copy upstream skill folders into skills/,
 * and update the `available` map in meta.json with content hashes for all upstream skills.
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import { collectAuthoredSkills, linkAuthoredSkills, pruneStaleLinksinAuthoredDirectory } from './lib/authored-skills-ops.ts'
import { MetaStore } from './lib/meta-store.ts'
import { discoverSkills } from './lib/skill-discovery.ts'
import { copySkillsFromUpstream, hashSkillDirectory } from './lib/skill-ops.ts'
import { ensureSubmodule } from './lib/submodule-ops.ts'
import { normalizeUrl } from './lib/url-ops.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
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
  const branchSuffix = config.branch ? ` (branch: ${config.branch})` : ''
  p.log.info(`  ${name}${branchSuffix}`)
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
  const upstreamPath = path.join(root, 'upstream', upstreamName)
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
    newAvailable[skillPath] = hashSkillDirectory(
      skillPath === '.' ? upstreamPath : path.join(upstreamPath, skillPath),
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
  const upstreamPath = path.join(root, 'upstream', upstreamName)
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

const authoredDirectory = path.join(root, 'authored')
const skillsDirectory = path.join(root, 'skills')

const collectResult = collectAuthoredSkills(skillsDirectory)
if (collectResult.ok) {
  const linkResult = linkAuthoredSkills(collectResult.data, skillsDirectory, authoredDirectory)
  if (linkResult.ok) {
    for (const message of linkResult.data) {
      p.log.step(message)
    }
  }
  else {
    errors.push(`Failed to link authored skills: ${linkResult.error}`)
  }

  const pruneResult = pruneStaleLinksinAuthoredDirectory(authoredDirectory, skillsDirectory)
  if (pruneResult.ok) {
    for (const message of pruneResult.data) {
      p.log.step(message)
    }
  }
  else {
    errors.push(`Failed to prune stale symlinks: ${pruneResult.error}`)
  }
}
else {
  errors.push(`Failed to collect authored skills: ${collectResult.error}`)
}

// ── Report and exit ───────────────────────────────────────────────────────

if (errors.length > 0) {
  p.log.warn(`${errors.length} error(s) occurred:`)
  for (const error of errors) {
    p.log.warn(`  - ${error}`)
  }
  p.outro('Sync completed with errors')
  process.exit(1)
}

p.outro('Done')
