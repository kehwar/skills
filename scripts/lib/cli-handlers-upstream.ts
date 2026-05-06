/**
 * Handler for add-upstream workflow.
 * Pure business logic: validate, update meta.json, sync skills via orchestrator.
 */

import type { Result, UpstreamMeta } from '../types.ts'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { MetaStore } from './meta-store.ts'
import { runSyncOrchestrator } from './sync-orchestrator.ts'

// Helper functions to reduce cognitive complexity
function buildBranchValue(branch: string | undefined, existing: UpstreamMeta | undefined): Record<string, string> {
  if (branch)
    return { branch }
  if (existing?.branch)
    return { branch: existing.branch }
  return {}
}

function buildSkillsValue(
  selectedSkills: Record<string, string>,
  existing: UpstreamMeta | undefined,
): Record<string, Record<string, string>> {
  if (Object.keys(selectedSkills).length > 0)
    return { skills: selectedSkills }
  if (existing?.skills)
    return { skills: existing.skills }
  return {}
}

function buildAvailableValue(existing: UpstreamMeta | undefined): Record<string, Record<string, string>> {
  if (existing?.available)
    return { available: existing.available }
  return {}
}

function cleanupDeselectedSkills(
  root: string,
  selectedSkills: Record<string, string>,
  existingConfig: UpstreamMeta | undefined,
): void {
  if (!existingConfig?.skills)
    return

  const selectedOutputNames = new Set(Object.values(selectedSkills))
  for (const outputName of Object.values(existingConfig.skills)) {
    if (!selectedOutputNames.has(outputName)) {
      const outputPath = path.join(root, 'skills', outputName)
      if (existsSync(outputPath)) {
        rmSync(outputPath, { recursive: true })
      }
    }
  }
}

function syncSelectedSkills(
  root: string,
  upstreamKey: string,
  selectedSkills: Record<string, string>,
  newConfig: UpstreamMeta,
): { skillsSynced: number, skillsFailed: number, error?: string } {
  let skillsSynced = 0
  let skillsFailed = 0

  if (Object.keys(selectedSkills).length === 0)
    return { skillsSynced, skillsFailed }

  const orcResult = runSyncOrchestrator({
    root,
    upstreamName: upstreamKey,
    upstreamConfig: newConfig,
    selectedSkills,
  })

  if (!orcResult.ok)
    return { skillsSynced, skillsFailed, error: `Failed to sync skills: ${orcResult.error}` }

  skillsSynced = orcResult.data.syncResult.synced.length
  skillsFailed = orcResult.data.syncResult.errors.length

  return { skillsSynced, skillsFailed }
}

function createInstructionsFile(root: string, upstreamKey: string, selectedSkills: Record<string, string>): void {
  if (Object.keys(selectedSkills).length > 0)
    return

  const instructionsDirectory = path.join(root, 'instructions')
  const instructionsFile = path.join(instructionsDirectory, `${upstreamKey}.md`)
  if (existsSync(instructionsFile))
    return

  mkdirSync(instructionsDirectory, { recursive: true })
  writeFileSync(
    instructionsFile,
    `# ${upstreamKey}\n\n<!-- Notes for authoring skills from this upstream -->\n`,
  )
}

export interface AddUpstreamInput {
  url: string
  upstreamKey: string
  branch?: string
  selectedSkills: Record<string, string> // skillPath → outputName
  root: string
}

export interface AddUpstreamOutput {
  upstreamKey: string
  url: string
  branch?: string
  metaUpdated: boolean
  skillsSynced: number
  skillsFailed: number
  message: string
}

/**
 * Add or update an upstream and optionally sync selected skills.
 * Handles: meta.json update, orchestrated sync, cleanup of deselected skills.
 */
export function handleAddUpstream(input: AddUpstreamInput): Result<AddUpstreamOutput> {
  const { url, upstreamKey, branch, selectedSkills, root } = input

  try {
    const store = new MetaStore(root)
    const existingConfig = store.getUpstream(upstreamKey)

    // Build new upstream config
    const branchValue = buildBranchValue(branch, existingConfig)
    const skillsValue = buildSkillsValue(selectedSkills, existingConfig)
    const availableValue = buildAvailableValue(existingConfig)

    const newConfig: UpstreamMeta = {
      url,
      ...branchValue,
      ...skillsValue,
      ...availableValue,
    }

    store.updateUpstream(upstreamKey, newConfig)
    const saveResult = store.saveMeta()
    if (!saveResult.ok) {
      return { ok: false, error: `Failed to save meta.json: ${saveResult.error}` }
    }

    // Cleanup deselected skills
    cleanupDeselectedSkills(root, selectedSkills, existingConfig)

    // Sync selected skills via orchestrator
    const syncResult = syncSelectedSkills(root, upstreamKey, selectedSkills, newConfig)
    if (syncResult.error)
      return { ok: false, error: syncResult.error }

    // Create instructions file
    createInstructionsFile(root, upstreamKey, selectedSkills)

    const branchSuffix = branch ? ` (branch: ${branch})` : ''
    const message = `Updated upstream: ${upstreamKey} from ${url}${branchSuffix}`

    return {
      ok: true,
      data: {
        upstreamKey,
        url,
        branch,
        metaUpdated: true,
        skillsSynced: syncResult.skillsSynced,
        skillsFailed: syncResult.skillsFailed,
        message,
      },
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `Failed to add upstream: ${message}` }
  }
}
