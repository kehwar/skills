#!/usr/bin/env node
/**
 * Add missing submodules (shallow), pull latest, copy upstream skill folders into skills/,
 * and update the `available` map in meta.json with content hashes for all upstream skills.
 */

import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import { collectAuthoredSkills, linkAuthoredSkills, pruneStaleLinksinAuthoredDirectory } from './lib/authored-skills-ops.ts'
import { MetaStore } from './lib/meta-store.ts'
import { runSyncOrchestrator } from './lib/sync-orchestrator.ts'
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

// ── Sync each upstream using orchestrator ──────────────────────────────────

p.log.step('Syncing upstreams...')
for (const [upstreamName, config] of Object.entries(upstreams)) {
  if (!config.skills)
    continue

  const branchSuffix = config.branch ? ` (branch: ${config.branch})` : ''
  p.log.info(`  ${upstreamName}${branchSuffix}`)

  const oldAvailable = config.available ?? {}
  const newAvailable: Record<string, string> = {}

  const orcResult = runSyncOrchestrator(
    {
      root,
      upstreamName,
      upstreamConfig: config,
      selectedSkills: config.skills,
      force,
    },
    {
      onPhaseSuccess: () => {
        // Silent success; we log after orchestration completes
      },
      onPhaseFailed: (phaseName, error) => {
        p.log.error(`  Phase ${phaseName} failed: ${error}`)
      },
    },
  )

  if (!orcResult.ok) {
    errors.push(`Failed to sync upstream ${upstreamName}: ${orcResult.error}`)
    continue
  }

  const { discoveredSkills, syncResult } = orcResult.data

  // Build the new available map from discovered hashes
  for (const { path: skillPath, hash } of discoveredSkills) {
    newAvailable[skillPath] = hash
  }

  // Report changes
  const allPaths = new Set([...Object.keys(oldAvailable), ...Object.keys(newAvailable)])
  const isSelected = (skillPath: string) => skillPath in config.skills!

  for (const skillPath of [...allPaths].sort()) {
    const oldHash = oldAvailable[skillPath]
    const newHash = newAvailable[skillPath]
    const tag = isSelected(skillPath) ? ' [included]' : ''

    if (!oldHash) {
      p.log.info(`    + ${upstreamName}/${skillPath}${tag}  (new)`)
    }
    else if (!newHash) {
      p.log.info(`    - ${upstreamName}/${skillPath}${tag}  (removed)`)
    }
    else if (oldHash !== newHash) {
      p.log.info(`    ~ ${upstreamName}/${skillPath}${tag}  (${oldHash} → ${newHash})`)
    }
  }

  // Log sync results
  for (const skill of syncResult.synced) {
    p.log.step(`    synced  ${upstreamName}/${skill.skillPath} → skills/${skill.outputName}`)
  }
  for (const skill of syncResult.skipped) {
    p.log.info(`    unchanged  ${upstreamName}/${skill.skillPath} → skills/${skill.outputName}`)
  }
  for (const skill of syncResult.errors) {
    p.log.error(`    FAILED ${upstreamName}/${skill.skillPath}: ${skill.error}`)
    errors.push(`Skill copy failed: ${upstreamName}/${skill.skillPath}: ${skill.error}`)
  }

  // Update available map in config
  store.updateUpstream(upstreamName, { available: newAvailable })
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
