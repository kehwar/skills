/**
 * Find and report (or remove with -y) skills and submodules not declared in meta.json.
 */

import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import { pruneStaleLinksinAuthoredDir } from './lib/authoredSkillsOps.ts'
import { exec } from './lib/gitOps.ts'
import { MetaStore } from './lib/metaStore.ts'
import { SkillMetaStore } from './lib/skillMetaStore.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
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
  const skillsDir = join(root, 'skills')
  const skillStore = new SkillMetaStore(skillsDir)
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
  const gitmodulesPath = join(root, '.gitmodules')
  if (!existsSync(gitmodulesPath))
    return []
  const content = readFileSync(gitmodulesPath, 'utf-8')
  return Array.from(content.matchAll(/path\s*=\s*(.+)/g), m => m[1].trim())
}

function removeSubmodule(submodulePath: string): void {
  const deinitResult = exec(`git submodule deinit -f ${submodulePath}`, { cwd: root })
  if (!deinitResult.ok) {
    p.log.warn(`Failed to deinit submodule ${submodulePath}: ${deinitResult.error}`)
  }
  const gitModulesDir = join(root, '.git', 'modules', submodulePath)
  if (existsSync(gitModulesDir))
    rmSync(gitModulesDir, { recursive: true })
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
const skillsDir = join(root, 'skills')
const existingSkills = existsSync(skillsDir)
  ? readdirSync(skillsDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
  : []

const extraSkills = existingSkills.filter(name => !getExpectedSkillNames().has(name))

if (extraSkills.length > 0) {
  hasOrphans = true
  p.log.warn(`Orphaned skills (${extraSkills.length}):`)
  for (const name of extraSkills) p.log.warn(`  - skills/${name}`)

  if (skipPrompt) {
    for (const name of extraSkills) {
      p.log.step(`Removing: skills/${name}`)
      rmSync(join(skillsDir, name), { recursive: true })
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
const authoredDir = join(root, 'authored')
const pruneResult = pruneStaleLinksinAuthoredDir(authoredDir, skillsDir)
if (!pruneResult.ok) {
  errors.push(`Failed to prune stale symlinks: ${pruneResult.error}`)
}
else {
  for (const msg of pruneResult.data) {
    p.log.step(msg)
  }
}

// ── Report and exit ───────────────────────────────────────────────────────

if (errors.length > 0) {
  p.log.warn(`${errors.length} error(s) occurred:`)
  for (const err of errors) {
    p.log.warn(`  - ${err}`)
  }
  p.outro('Cleanup completed with errors')
  process.exit(1)
}

p.outro('Done')
