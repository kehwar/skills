/**
 * Handler for add-upstream workflow.
 * Pure business logic: validate, update meta.json, sync skills via orchestrator.
 */

import type { Result, UpstreamMeta } from '../types.ts'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { MetaStore } from './meta-store.ts'
import { runSyncOrchestrator } from './sync-orchestrator.ts'

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
    const branchValue = branch ? { branch } : (existingConfig?.branch ? { branch: existingConfig.branch } : {})
    const skillsValue = Object.keys(selectedSkills).length > 0
      ? { skills: selectedSkills }
      : (existingConfig?.skills ? { skills: existingConfig.skills } : {})
    const availableValue = existingConfig?.available ? { available: existingConfig.available } : {}

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
    if (existingConfig?.skills) {
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

    // Sync selected skills via orchestrator
    let skillsSynced = 0
    let skillsFailed = 0

    if (Object.keys(selectedSkills).length > 0) {
      const orcResult = runSyncOrchestrator({
        root,
        upstreamName: upstreamKey,
        upstreamConfig: newConfig,
        selectedSkills,
      })

      if (orcResult.ok) {
        skillsSynced = orcResult.data.syncResult.synced.length
        skillsFailed = orcResult.data.syncResult.errors.length
      }
      else {
        return {
          ok: false,
          error: `Failed to sync skills: ${orcResult.error}`,
        }
      }
    }

    // Create instructions file if reference-only upstream
    if (Object.keys(selectedSkills).length === 0) {
      const instructionsDirectory = path.join(root, 'instructions')
      const instructionsFile = path.join(instructionsDirectory, `${upstreamKey}.md`)
      if (!existsSync(instructionsFile)) {
        mkdirSync(instructionsDirectory, { recursive: true })
        writeFileSync(
          instructionsFile,
          `# ${upstreamKey}\n\n<!-- Notes for authoring skills from this upstream -->\n`,
        )
      }
    }

    const branchSuffix = branch ? ` (branch: ${branch})` : ''
    const message = `Updated upstream: ${upstreamKey} from ${url}${branchSuffix}`

    return {
      ok: true,
      data: {
        upstreamKey,
        url,
        branch,
        metaUpdated: true,
        skillsSynced,
        skillsFailed,
        message,
      },
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `Failed to add upstream: ${message}` }
  }
}
