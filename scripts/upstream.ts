#!/usr/bin/env node
/**
 * Interactive upstream management.
 * Usage: pnpm upstream <github-url> [--branch <branch>] [--name <key>]
 *
 * Workflow:
 * 1. Validates URL, derives upstream key
 * 2. Checks for key collision (prompts if needed)
 * 3. Discovers SKILL.md files
 * 4. Prompts user to select skills (if found)
 * 5. Calls upstreamAdd orchestrator for submodule + sync
 * 6. Updates meta.json with results
 */

import type { UpstreamAddInput } from './orchestrators/upstream-add.js'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import { Effect } from 'effect'
import { promptForSkillSelection, promptForUpstreamKey } from './lib/cli-prompts.ts'
import { validateBranchName } from './lib/cli-validators.ts'
import { MetaStore } from './lib/meta-store.ts'
import { discoverSkills } from './lib/skill-discovery.ts'
import { parseAndNormalizeUrl } from './lib/url.ts'
import { upstreamAdd } from './orchestrators/upstream-add.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const store = new MetaStore(root)
const meta = store.readMeta()

const arguments_ = process.argv.slice(2)
const branchFlagIndex = arguments_.findIndex(a => a === '--branch' || a === '-b')
const branch: string | undefined = branchFlagIndex === -1 ? undefined : arguments_[branchFlagIndex + 1]
const nameFlagIndex = arguments_.findIndex(a => a === '--name' || a === '-n')
const nameOverride: string | undefined = nameFlagIndex === -1 ? undefined : arguments_[nameFlagIndex + 1]
const positional = arguments_.find((_, index) => {
  if (branchFlagIndex !== -1 && (index === branchFlagIndex || index === branchFlagIndex + 1))
    return false
  if (nameFlagIndex !== -1 && (index === nameFlagIndex || index === nameFlagIndex + 1))
    return false
  return true
})
const url = positional

p.intro('Upstream')

// ── Validate URL ────────────────────────────────────────────────────────────

if (!url) {
  p.log.error('Usage: pnpm upstream <github-url> [--branch <branch>] [--name <key>]')
  process.exit(1)
}

const urlParseResult = parseAndNormalizeUrl(url)
if (!urlParseResult.ok) {
  p.log.error(urlParseResult.error)
  process.exit(1)
}

const urlInfo = urlParseResult.data
const normalizedUrl = urlInfo.normalized
const orgName = urlInfo.owner
const repoName = urlInfo.repo

// ── Validate branch if provided ─────────────────────────────────────────────

if (branch) {
  const branchValidation = validateBranchName(branch)
  if (!branchValidation.ok) {
    p.log.error(branchValidation.error)
    process.exit(1)
  }
}

// ── Derive upstream key ─────────────────────────────────────────────────────

let upstreamKey = nameOverride ?? (repoName === 'skills' ? orgName : repoName)

// ── Check for key collision ─────────────────────────────────────────────────

const existing = meta.upstreams[upstreamKey]
if (existing && existing.url !== normalizedUrl && !nameOverride) {
  const promptedKey = await promptForUpstreamKey(upstreamKey, true, existing.url)
  if (promptedKey === undefined) {
    p.cancel('Cancelled')
    process.exit(0)
  }
  upstreamKey = promptedKey
}

const submodulePath = `upstream/${upstreamKey}`
const upstreamDirectory = path.join(root, submodulePath)
const spinner = p.spinner()

// For now, detect isNew from meta (will be refined in future phase)
const isNew = !meta.upstreams[upstreamKey]
const updateAction = isNew ? 'Adding' : 'Updating'
const branchSuffix = branch ? ` (branch: ${branch})` : ''
spinner.start(`${updateAction} ${submodulePath}${branchSuffix}`)

// --- Discover skills (for UI only) ---

let skillPaths: string[] = []
const discoverResult = discoverSkills(upstreamDirectory)
if (discoverResult.ok) {
  skillPaths = discoverResult.data
    .map(skill => skill.path)
    .sort((a, b) =>
      (a.split('/').pop() ?? a).localeCompare(b.split('/').pop() ?? b),
    )
}
else {
  p.log.warn(`Failed to discover skills: ${discoverResult.error}`)
  spinner.stop(`${isNew ? 'Added' : 'Updated'} ${submodulePath}`)
  p.outro('Failed to discover skills')
  process.exit(1)
}

spinner.stop(`${isNew ? 'Added' : 'Updated'} ${submodulePath}`)

// --- Skill selection ---

const existingConfig = meta.upstreams[upstreamKey]
const existingPaths = new Set(existingConfig?.skills ? Object.keys(existingConfig.skills) : [])
const skillsMap: Record<string, string> = {}

if (skillPaths.length > 0) {
  const selectedPaths = await promptForSkillSelection(
    skillPaths,
    [...existingPaths],
    upstreamKey,
  )

  if (selectedPaths === undefined) {
    p.cancel('Cancelled')
    process.exit(0)
  }

  // Map selected paths to output names
  for (const skillPath of selectedPaths) {
    skillsMap[skillPath] = existingConfig?.skills?.[skillPath] ?? (skillPath.split('/').pop() ?? skillPath)
  }
}

// --- Call upstreamAdd orchestrator ---

const spinner2 = p.spinner()
spinner2.start(`Syncing skills...`)

const input: UpstreamAddInput = {
  root,
  upstreamKey,
  url: normalizedUrl,
  branch,
  selectedSkills: skillsMap,
}

const result = Effect.runSync(upstreamAdd(input))

spinner2.stop(`Skills synced`)

// --- Update meta.json with discovered skills ---

const upstreamConfig: typeof meta.upstreams[string] = {
  url: normalizedUrl,
  ...(branch && { branch }),
  skills: skillsMap,
  available: {}, // Will be populated from discovered skills
  gitSha: '', // Git SHA detection implemented in skills-bv3.6
}

// Populate available map from discovered skills
for (const { path: skillPath, hash } of result.discoveredSkills) {
  upstreamConfig.available![skillPath] = hash
}

store.updateUpstream(upstreamKey, upstreamConfig)
const saveResult = store.saveMeta()
if (!saveResult.ok) {
  p.log.error(saveResult.error)
  p.outro('Failed to save meta.json')
  process.exit(1)
}

// --- Report results ---

p.log.success(`Added upstream: ${upstreamKey}`)

if (result.syncResult.synced.length > 0) {
  p.log.info(`  Synced: ${result.syncResult.synced.length} skills`)
}
if (result.syncResult.skipped.length > 0) {
  p.log.info(`  Skipped: ${result.syncResult.skipped.length} skills`)
}
if (result.syncResult.errors.length > 0) {
  p.log.warn(`  Failed: ${result.syncResult.errors.length} skills`)
  for (const { skillPath, outputName, error } of result.syncResult.errors) {
    p.log.warn(`    ${outputName} (${skillPath}): ${error}`)
  }
}

p.outro('Done')
