#!/usr/bin/env node
/**
 * Add missing submodules (shallow), pull latest, copy upstream skill folders into skills/,
 * and update the `available` map in meta.json with content hashes for all upstream skills.
 */

import type { Meta } from './types.js'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import { Effect } from 'effect'
import {
  collectAuthoredSkillsWithMetadata,
  linkAuthoredSkillsToDirectory,
  pruneStaleLinksinAuthoredDirectory,
} from './effects/authored-skills.js'
import { readFile, writeFile } from './effects/fs.js'
import { loadMeta, saveMeta } from './effects/meta-io.js'
import { parseGitHubUrl } from './effects/url-parsing.js'
import { syncAllUpstreams } from './orchestrators/sync-all-upstreams.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const force = process.argv.includes('--force')
const errors: string[] = []

p.intro('Sync')

// ── Load and normalize meta.json using Effects ──────────────────────────────

const syncWorkflow = Effect.gen(function* () {
  // Load meta.json
  const metaJson = yield* readFile(path.join(root, 'meta.json'))
  const meta = yield* loadMeta(metaJson)

  // Normalize URLs
  let urlsNormalized = false
  const normalizedUpstreams: Record<string, any> = {}

  for (const [key, config] of Object.entries(meta.upstreams)) {
    const urlInfo = yield* parseGitHubUrl(config.url)
    if (urlInfo.normalized !== config.url)
      urlsNormalized = true

    normalizedUpstreams[key] = {
      ...config,
      url: urlInfo.normalized,
    }
  }

  // Save normalized meta if needed
  if (urlsNormalized) {
    const normalizedMeta = { upstreams: normalizedUpstreams }
    const serialized = yield* saveMeta(normalizedMeta)
    yield* writeFile(path.join(root, 'meta.json'), serialized)
  }

  return normalizedUpstreams
})

// Execute the workflow
let upstreams: Record<string, any> = {}
try {
  upstreams = Effect.runSync(syncWorkflow)
}
catch (error: unknown) {
  errors.push(
    `Failed to load/normalize meta.json: ${error instanceof Error ? error.message : String(error)}`,
  )
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

// ── Helper: Process a single upstream sync result ──────────────────────────

function processSyncDetail(
  detail: typeof syncResult.details[0],
  meta: Meta,
): Record<string, string> {
  const config = meta.upstreams[detail.upstreamName]
  if (!config)
    return {}

  const branchSuffix = config.branch ? ` (branch: ${config.branch})` : ''
  p.log.info(`  ${detail.upstreamName}${branchSuffix}`)

  if (!detail.success) {
    errors.push(`Failed to sync upstream ${detail.upstreamName}: ${detail.error}`)
    p.log.error(`  Error: ${detail.error}`)
    return {}
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

  return newAvailable
}

// ── Process results and update meta ──────────────────────────────────────────

// Load meta again to get fresh state (might have changed during sync)
const updateMetaWorkflow = Effect.gen(function* () {
  const metaJson = yield* readFile(path.join(root, 'meta.json'))
  const updatedMeta = yield* loadMeta(metaJson)

  for (const detail of syncResult.details) {
    const newAvailable = processSyncDetail(detail, updatedMeta)
    if (Object.keys(newAvailable).length > 0) {
      updatedMeta.upstreams[detail.upstreamName] = {
        ...updatedMeta.upstreams[detail.upstreamName],
        available: newAvailable,
      }
    }
  }

  // Save updated meta
  const serialized = yield* saveMeta(updatedMeta)
  yield* writeFile(path.join(root, 'meta.json'), serialized)

  return updatedMeta
})

try {
  Effect.runSync(updateMetaWorkflow)
}
catch (error: unknown) {
  errors.push(
    `Failed to update meta.json: ${error instanceof Error ? error.message : String(error)}`,
  )
}

p.log.step('Syncing upstreams completed')

// ── Maintain authored/ symlinks using Effects ────────────────────────────────

const authoredDirectory = path.join(root, 'authored')
const skillsDirectory = path.join(root, 'skills')

const authoredWorkflow = Effect.gen(function* () {
  const collected = yield* collectAuthoredSkillsWithMetadata(skillsDirectory)
  const linkMessages = yield* linkAuthoredSkillsToDirectory(collected, skillsDirectory, authoredDirectory)
  for (const message of linkMessages) {
    p.log.step(message)
  }

  const pruneMessages = yield* pruneStaleLinksinAuthoredDirectory(authoredDirectory, skillsDirectory)
  for (const message of pruneMessages) {
    p.log.step(message)
  }
})

try {
  Effect.runSync(authoredWorkflow)
}
catch (error: unknown) {
  errors.push(
    `Failed to manage authored skills: ${error instanceof Error ? error.message : String(error)}`,
  )
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
