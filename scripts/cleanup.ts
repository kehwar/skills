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
import { Effect } from 'effect'
import { exec } from './lib/git-ops.ts'
import { cleanup } from './orchestrators/cleanup.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const skipPrompt = process.argv.includes('-y') || process.argv.includes('--yes')
const errors: string[] = []

function removeSubmodule(submodulePath: string): void {
  const deinitResult = exec(`git submodule deinit -f ${submodulePath}`, { cwd: root })
  if (!deinitResult.ok) {
    p.log.warn(`Failed to deinit submodule ${submodulePath}: ${deinitResult.error}`)
  }
  const gitModulesDirectory = path.join(root, '.git', 'modules', submodulePath)
  if (existsSync(gitModulesDirectory))
    rmSync(gitModulesDirectory, { recursive: true })
  const rmResult = exec(`git rm -f ${submodulePath}`, { cwd: root })
  if (!rmResult.ok) {
    p.log.warn(`Failed to remove submodule ${submodulePath}: ${rmResult.error}`)
  }
}

function handleOrphanedSubmodules(submodules: string[]): boolean {
  if (submodules.length === 0)
    return false
  p.log.warn(`Orphaned submodules (${submodules.length}):`)
  for (const submodulePath of submodules) {
    p.log.warn(`  - ${submodulePath}`)
  }
  if (skipPrompt) {
    for (const submodulePath of submodules) {
      p.log.step(`Removing: ${submodulePath}`)
      removeSubmodule(submodulePath)
    }
  }
  else {
    p.log.info('  → Re-run with -y to remove')
  }
  return true
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

    const hasOrphans = handleOrphanedSubmodules(result.orphanedSubmodules)
      || handleOrphanedSkills(result.orphanedSkills)
      || handleStaleSymlinks(result.staleLinksinAuthored)

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
