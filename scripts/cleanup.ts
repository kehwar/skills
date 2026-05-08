#!/usr/bin/env node
/**
 * Find and report (or remove with -y) skills and submodules not declared in meta.json.
 *
 * This is the CLI entry point that calls the cleanup orchestrator.
 */

import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import { Effect, pipe } from 'effect'
import { deinitSubmodule, rmFromIndex } from './effects/git.js'
import { cleanup } from './orchestrators/cleanup.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const skipPrompt = process.argv.includes('-y') || process.argv.includes('--yes')
const errors: string[] = []

async function removeSubmodule(submodulePath: string): Promise<void> {
  // Use Effect.runPromise to execute git operations
  const removeEffect = pipe(
    deinitSubmodule(submodulePath),
    Effect.flatMap(() => {
      // Remove the .git/modules directory
      const gitModulesDirectory = path.join(root, '.git', 'modules', submodulePath)
      if (existsSync(gitModulesDirectory)) {
        rmSync(gitModulesDirectory, { recursive: true })
      }
      return Effect.succeed(undefined)
    }),
    Effect.flatMap(() => rmFromIndex(submodulePath)),
    Effect.catchAll(() => {
      // Catch all errors and continue (don't throw)
      return Effect.succeed(undefined)
    }),
  )

  try {
    await Effect.runPromise(removeEffect)
  }
  catch (error) {
    p.log.warn(`Failed to remove submodule ${submodulePath}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function handleOrphanedSubmodules(submodules: string[]): Promise<boolean> {
  if (submodules.length === 0)
    return Promise.resolve(false)
  p.log.warn(`Orphaned submodules (${submodules.length}):`)
  for (const submodulePath of submodules) {
    p.log.warn(`  - ${submodulePath}`)
  }
  if (skipPrompt) {
    const promises = submodules.map(async (submodulePath) => {
      p.log.step(`Removing: ${submodulePath}`)
      await removeSubmodule(submodulePath)
    })
    return Promise.all(promises).then(() => true)
  }
  else {
    p.log.info('  → Re-run with -y to remove')
    return Promise.resolve(true)
  }
}

function handleOrphanedSkills(skills: string[]): boolean {
  if (skills.length === 0)
    return false
  p.log.warn(`Orphaned skills (${skills.length}):`)
  for (const skillName of skills) {
    p.log.warn(`  - skills/${skillName}`)
  }
  if (skipPrompt) {
    const skillsDirectory = path.join(root, 'skills')
    for (const skillName of skills) {
      p.log.step(`Removing: skills/${skillName}`)
      rmSync(path.join(skillsDirectory, skillName), { recursive: true })
    }
  }
  else {
    p.log.info('  → Re-run with -y to remove')
  }
  return true
}

function handleStaleSymlinks(links: string[]): boolean {
  if (links.length === 0)
    return false
  p.log.warn(`Stale symlinks (${links.length}):`)
  for (const link of links) {
    p.log.warn(`  - ${link}`)
  }
  return true
}

async function main() {
  try {
    p.intro('Cleanup')

    const result = await Effect.runPromise(cleanup({ root }))

    const orphanedSubmodulesHandled = await handleOrphanedSubmodules(result.orphanedSubmodules)
    const orphanedSkillsHandled = handleOrphanedSkills(result.orphanedSkills)
    const staleLinksHandled = handleStaleSymlinks(result.staleLinksinAuthored)

    const hasOrphans = orphanedSubmodulesHandled || orphanedSkillsHandled || staleLinksHandled

    if (!hasOrphans) {
      p.log.step('Everything is clean')
    }

    // Report any errors
    if (errors.length > 0) {
      p.log.warn(`${errors.length} error(s) occurred:`)
      for (const error of errors) {
        p.log.warn(`  - ${error}`)
      }
      p.outro('Cleanup completed with errors')
      process.exit(1)
    }

    p.outro('Done')
  }
  catch (error) {
    p.log.error(`Fatal error: ${(error as Error).message}`)
    process.exit(1)
  }
}

await main()
