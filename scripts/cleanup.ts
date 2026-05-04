/**
 * Find and report (or remove with -y) skills and submodules not declared in meta.json.
 */

import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Meta, SkillMeta } from './types.ts'

const { sources, vendors } = JSON.parse(readFileSync(new URL('../meta.json', import.meta.url), 'utf-8')) as Meta

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const skipPrompt = process.argv.includes('-y') || process.argv.includes('--yes')

function exec(cmd: string): void {
  execSync(cmd, { cwd: root, stdio: 'inherit' })
}

function getExpectedSkillNames(): Set<string> {
  const expected = new Set<string>()
  for (const name of Object.keys(sources)) expected.add(name)
  for (const config of Object.values(vendors))
    for (const outputName of Object.values(config.skills)) expected.add(outputName)
  // Skills with authored/authored-from-source meta.json are never orphans
  const skillsDir = join(root, 'skills')
  if (existsSync(skillsDir)) {
    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const metaPath = join(skillsDir, entry.name, 'meta.json')
      if (!existsSync(metaPath)) continue
      const skillMeta = JSON.parse(readFileSync(metaPath, 'utf-8')) as SkillMeta
      if (skillMeta.type === 'authored' || skillMeta.type === 'authored-from-source')
        expected.add(entry.name)
    }
  }
  return expected
}

function getExpectedSubmodulePaths(): Set<string> {
  const expected = new Set<string>()
  for (const name of Object.keys(sources)) expected.add(`sources/${name}`)
  for (const name of Object.keys(vendors)) expected.add(`vendor/${name}`)
  return expected
}

function getExistingSubmodulePaths(): string[] {
  const gitmodulesPath = join(root, '.gitmodules')
  if (!existsSync(gitmodulesPath)) return []
  const content = readFileSync(gitmodulesPath, 'utf-8')
  return Array.from(content.matchAll(/path\s*=\s*(.+)/g), m => m[1].trim())
}

function removeSubmodule(submodulePath: string): void {
  execSync(`git submodule deinit -f ${submodulePath}`, { cwd: root, stdio: 'pipe' })
  const gitModulesDir = join(root, '.git', 'modules', submodulePath)
  if (existsSync(gitModulesDir)) rmSync(gitModulesDir, { recursive: true })
  exec(`git rm -f ${submodulePath}`)
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
