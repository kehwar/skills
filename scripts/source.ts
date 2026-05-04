/**
 * Add a source submodule and create a blank instructions file.
 * Usage: pnpm source <github-url-or-org/repo>
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Meta } from './types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const metaPath = join(root, 'meta.json')

const args = process.argv.slice(2)
const branchFlagIdx = args.findIndex(a => a === '--branch' || a === '-b')
const branch: string | undefined = branchFlagIdx !== -1 ? args[branchFlagIdx + 1] : undefined
const positional = args.filter((_, i) => i !== branchFlagIdx && (branchFlagIdx === -1 || i !== branchFlagIdx + 1))
const arg = positional[0]

if (!arg) {
  console.error('Usage: pnpm source <github-url-or-org/repo> [--branch <branch>]')
  process.exit(1)
}

// Accept both full URLs and shorthand org/repo
const url = arg.startsWith('http') ? arg : `https://github.com/${arg}`
const sourceName = url.replace(/\.git$/, '').split('/').pop()!
const submodulePath = `sources/${sourceName}`

function exec(cmd: string): void {
  execSync(cmd, { cwd: root, stdio: 'inherit' })
}

function submoduleExists(path: string): boolean {
  const gitmodulesPath = join(root, '.gitmodules')
  if (!existsSync(gitmodulesPath)) return false
  return readFileSync(gitmodulesPath, 'utf-8').includes(`path = ${path}`)
}

// 1. Add submodule
if (submoduleExists(submodulePath)) {
  console.log(`Submodule already exists: ${submodulePath}`)
}
else {
  const parentDir = join(root, 'sources')
  if (!existsSync(parentDir)) mkdirSync(parentDir, { recursive: true })
  console.log(`Adding: ${submodulePath}${branch ? ` (branch: ${branch})` : ''}`)
  exec(`git submodule add --depth 1${branch ? ` -b ${branch}` : ''} ${url} ${submodulePath}`)
}

// 2. Update meta.json (always, so branch changes are persisted)
const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as Meta
const existing = meta.sources[sourceName]
const newEntry = branch ? { url, branch } : { url }
const changed = !existing
  || existing.url !== url
  || existing.branch !== branch

if (changed) {
  meta.sources[sourceName] = newEntry
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n')
  console.log(`Updated meta.json sources: ${sourceName}${branch ? ` (branch: ${branch})` : ''}`)

  // Update .gitmodules branch config when branch changed on an existing submodule
  if (existing && submoduleExists(submodulePath)) {
    if (branch) {
      execSync(`git config -f .gitmodules submodule.${submodulePath}.branch ${branch}`, { cwd: root, stdio: 'inherit' })
    }
    else {
      execSync(`git config -f .gitmodules --unset submodule.${submodulePath}.branch`, { cwd: root, stdio: 'pipe' })
    }
  }
}

// If a branch is specified, make sure the submodule is actually on it
if (branch && submoduleExists(submodulePath)) {
  const submoduleDir = join(root, submodulePath)
  let currentBranch: string | null = null
  try {
    currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: submoduleDir, encoding: 'utf-8', stdio: 'pipe' }).trim()
  }
  catch { /* not initialized yet */ }

  if (currentBranch !== branch) {
    console.log(`Switching ${submodulePath}: ${currentBranch ?? '?'} → ${branch}`)
    execSync(`git config -f .gitmodules submodule.${submodulePath}.branch ${branch}`, { cwd: root, stdio: 'inherit' })
    execSync(`git fetch --depth 1 origin ${branch}`, { cwd: submoduleDir, stdio: 'inherit' })
    execSync(`git checkout -B ${branch} FETCH_HEAD`, { cwd: submoduleDir, stdio: 'inherit' })
  }
}

// 3. Create instructions file
const instructionsDir = join(root, 'instructions')
if (!existsSync(instructionsDir)) mkdirSync(instructionsDir, { recursive: true })

const instructionsPath = join(instructionsDir, `${sourceName}.md`)
if (!existsSync(instructionsPath)) {
  writeFileSync(instructionsPath, '')
  console.log(`Created: instructions/${sourceName}.md`)
}
else {
  console.log(`Already exists: instructions/${sourceName}.md`)
}
