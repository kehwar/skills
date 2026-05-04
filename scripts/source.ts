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

const arg = process.argv[2]
if (!arg) {
  console.error('Usage: pnpm source <github-url-or-org/repo>')
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
  console.log(`Adding: ${submodulePath}`)
  exec(`git submodule add --depth 1 ${url} ${submodulePath}`)
}

// 2. Update meta.json
const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as Meta
if (!(sourceName in meta.sources)) {
  meta.sources[sourceName] = url
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n')
  console.log(`Added to meta.json sources: ${sourceName}`)
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
