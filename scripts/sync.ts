#!/usr/bin/env node
/**
 * Add missing submodules (shallow), pull latest, copy upstream skill folders into skills/,
 * and update the `available` map in meta.json with content hashes for all upstream skills.
 */

import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import { Effect } from 'effect'
import { collectAuthoredSkills, linkAuthoredSkills, pruneStaleLinksinAuthoredDirectory } from './lib/authored-skills-ops.ts'
import { MetaStore } from './lib/meta-store.ts'
import { parseAndNormalizeUrl } from './lib/url.ts'
import { syncAllUpstreams } from './orchestrators/sync-all-upstreams.js'

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
  const parseResult = parseAndNormalizeUrl(config.url)
  if (parseResult.ok && parseResult.data.normalized !== config.url) {
    store.updateUpstream(key, { url: parseResult.data.normalized })
    urlsNormalized = true
  }
  else if (!parseResult.ok) {
    errors.push(`Invalid upstream URL for ${key}: ${parseResult.error}`)
  }
}
if (urlsNormalized) {
  const saveResult = store.saveMeta()
  if (!saveResult.ok)
    errors.push(saveResult.error)
}

// ── Sync each upstream using Effect orchestrator ─────────────────────────────

p.log.step('Syncing upstreams...')

const upstreamMap = Object.fromEntries(
  Object.entries(upstreams).filter(([, config]) => config.skills),
)

const syncEffect = syncAllUpstreams({
  root,
  upstreams: upstreamMap,
  concurrency: 3,
  force,
})

const syncResult = Effect.runSync(syncEffect)

// Process results and update meta
for (const detail of syncResult.details) {
  const config = upstreams[detail.upstreamName]
  if (!config)
    continue

  const branchSuffix = config.branch ? ` (branch: ${config.branch})` : ''
  p.log.info(`  ${detail.upstreamName}${branchSuffix}`)

  if (!detail.success) {
    errors.push(`Failed to sync upstream ${detail.upstreamName}: ${detail.error}`)
    p.log.error(`  Error: ${detail.error}`)
    continue
  }

  const { discoveredSkills, syncResult: skillSyncResult } = detail.output!

  const oldAvailable = config.available ?? {}
  const newAvailable: Record<string, string> = {}

  // Build the new available map from discovered hashes
  for (const { path: skillPath, hash } of discoveredSkills) {
    newAvailable[skillPath] = hash
  }

  // Report changes
  const allPaths = new Set([...Object.keys(oldAvailable), ...Object.keys(newAvailable)])

  for (const skillPath of [...allPaths].sort()) {
    const oldHash = oldAvailable[skillPath]
    const newHash = newAvailable[skillPath]
    const tag = skillPath in config.skills! ? ' [included]' : ''

    if (!oldHash) {
      p.log.info(`    + ${detail.upstreamName}/${skillPath}${tag}  (new)`)
    }
    else if (!newHash) {
      p.log.info(`    - ${detail.upstreamName}/${skillPath}${tag}  (removed)`)
    }
    else if (oldHash !== newHash) {
      p.log.info(`    ~ ${detail.upstreamName}/${skillPath}${tag}  (${oldHash} → ${newHash})`)
    }
  }

  // Log sync results
  for (const skill of skillSyncResult.synced) {
    p.log.step(`    synced  ${detail.upstreamName}/${skill.skillPath} → skills/${skill.outputName}`)
  }
  for (const skill of skillSyncResult.skipped) {
    p.log.info(`    unchanged  ${detail.upstreamName}/${skill.skillPath} → skills/${skill.outputName}`)
  }
  for (const skill of skillSyncResult.errors) {
    p.log.error(`    FAILED ${detail.upstreamName}/${skill.skillPath}: ${skill.error}`)
    errors.push(`Skill copy failed: ${detail.upstreamName}/${skill.skillPath}: ${skill.error}`)
  }

  // Update available map in config
  store.updateUpstream(detail.upstreamName, { available: newAvailable })
}

p.log.step('Syncing upstreams completed')

const saveMeta = store.saveMeta()
if (!saveMeta.ok)
  errors.push(saveMeta.error)

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
