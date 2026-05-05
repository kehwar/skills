/**
 * Find and report (or remove with -y) skills and submodules not declared in meta.json.
 */

import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pruneStaleLinksinAuthoredDir } from './lib/authoredSkillsOps.ts'
import { exec } from './lib/gitOps.ts'
import { MetaStore } from './lib/metaStore.ts'
import { SkillMetaStore } from './lib/skillMetaStore.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const store = new MetaStore(root)
const upstreams = store.getAllUpstreams()
const skipPrompt = process.argv.includes('-y') || process.argv.includes('--yes')

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
  exec(`git submodule deinit -f ${submodulePath}`, { cwd: root, safe: true })
  const gitModulesDir = join(root, '.git', 'modules', submodulePath)
  if (existsSync(gitModulesDir))
    rmSync(gitModulesDir, { recursive: true })
  exec(`git rm -f ${submodulePath}`, { cwd: root, inherit: true })
}

let hasOrphans = false

// 1. Orphaned submodules
const extraSubmodules = getExistingSubmodulePaths().filter(
  p => !getExpectedSubmodulePaths().has(p),
)

if (extraSubmodules.length > 0) {
  hasOrphans = true
  console.log(`Orphaned submodules (${extraSubmodules.length}):`)
  for (const p of extraSubmodules) console.log(`  - ${p}`)

  if (skipPrompt) {
    for (const p of extraSubmodules) {
      console.log(`Removing: ${p}`)
      removeSubmodule(p)
    }
  }
  else {
    console.log('  → Re-run with -y to remove\n')
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
  console.log(`Orphaned skills (${extraSkills.length}):`)
  for (const name of extraSkills) console.log(`  - skills/${name}`)

  if (skipPrompt) {
    for (const name of extraSkills) {
      console.log(`Removing: skills/${name}`)
      rmSync(join(skillsDir, name), { recursive: true })
    }
  }
  else {
    console.log('  → Re-run with -y to remove\n')
  }
}

if (!hasOrphans) {
  console.log('Everything is clean')
}

// 3. Stale symlinks in authored/
const authoredDir = join(root, 'authored')
pruneStaleLinksinAuthoredDir(authoredDir, skillsDir, console.log)
