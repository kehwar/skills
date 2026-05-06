#!/usr/bin/env node
/**
 * Find and report (or remove with -y) skills and submodules not declared in meta.json.
 */

import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import { pruneStaleLinksinAuthoredDirectory } from './lib/authored-skills-ops.ts'
import { exec } from './lib/git-ops.ts'
import { MetaStore } from './lib/meta-store.ts'
import { SkillMetaStore } from './lib/skill-meta-store.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const store = new MetaStore(root)
const upstreams = store.getAllUpstreams()
const skipPrompt = process.argv.includes('-y') || process.argv.includes('--yes')
const errors: string[] = []

function getExpectedSkillNames(): Set<string> {
  const expected = new Set<string>()
  for (const config of Object.values(upstreams)) {
    if (config.skills) {
      for (const outputName of Object.values(config.skills)) expected.add(outputName)
    }
  }
  // Skills with authored meta.json are never orphans
  const skillsDirectory = path.join(root, 'skills')
  const skillStore = new SkillMetaStore(skillsDirectory)
  const allSkills = skillStore.readAllSkills()
  for (const [name, meta] of Object.entries(allSkills)) {
    if (meta.type === 'authored')
      expected.add(name)
  }
  return expected
}

function getExpectedSubmodulePaths(): Set<string> {
  return new Set(Object.keys(upstreams).map(name => `upstream/${name}`))
}

function getExistingSubmodulePaths(): string[] {
  const gitmodulesPath = path.join(root, '.gitmodules')
  if (!existsSync(gitmodulesPath))
    return []
  const content = readFileSync(gitmodulesPath, 'utf8')
  return Array.from(content.matchAll(/path\s*=\s*(.+)/g), m => m[1].trim())
}

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

p.intro('Cleanup')

let hasOrphans = false

// 1. Orphaned submodules
const extraSubmodules = getExistingSubmodulePaths().filter(
  path => !getExpectedSubmodulePaths().has(path),
)

if (extraSubmodules.length > 0) {
  hasOrphans = true
  p.log.warn(`Orphaned submodules (${extraSubmodules.length}):`)
  for (const path of extraSubmodules) p.log.warn(`  - ${path}`)

  if (skipPrompt) {
    for (const path of extraSubmodules) {
      p.log.step(`Removing: ${path}`)
      removeSubmodule(path)
    }
  }
  else {
    p.log.info('  → Re-run with -y to remove')
  }
}

// 2. Orphaned skills
const skillsDirectory = path.join(root, 'skills')
const existingSkills = existsSync(skillsDirectory)
  ? readdirSync(skillsDirectory, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  : []

const extraSkills = existingSkills.filter(name => !getExpectedSkillNames().has(name))

if (extraSkills.length > 0) {
  hasOrphans = true
  p.log.warn(`Orphaned skills (${extraSkills.length}):`)
  for (const name of extraSkills) p.log.warn(`  - skills/${name}`)

  if (skipPrompt) {
    for (const name of extraSkills) {
      p.log.step(`Removing: skills/${name}`)
      rmSync(path.join(skillsDirectory, name), { recursive: true })
    }
  }
  else {
    p.log.info('  → Re-run with -y to remove')
  }
}

if (!hasOrphans) {
  p.log.step('Everything is clean')
}

// 3. Stale symlinks in authored/
const authoredDirectory = path.join(root, 'authored')
const pruneResult = pruneStaleLinksinAuthoredDirectory(authoredDirectory, skillsDirectory)
if (pruneResult.ok) {
  for (const message of pruneResult.data) {
    p.log.step(message)
  }
}
else {
  errors.push(`Failed to prune stale symlinks: ${pruneResult.error}`)
}

// ── Report and exit ───────────────────────────────────────────────────────

if (errors.length > 0) {
  p.log.warn(`${errors.length} error(s) occurred:`)
  for (const error of errors) {
    p.log.warn(`  - ${error}`)
  }
  p.outro('Cleanup completed with errors')
  process.exit(1)
}

p.outro('Done')
