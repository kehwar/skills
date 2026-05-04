/**
 * Add missing submodules (shallow), pull latest, and copy vendor skill folders into skills/.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { sources, vendors } from '../meta.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function exec(cmd: string, cwd = root): string {
  return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}

function execInherit(cmd: string): void {
  execSync(cmd, { cwd: root, stdio: 'inherit' })
}

function getGitSha(dir: string): string | null {
  try {
    return exec('git rev-parse HEAD', dir)
  }
  catch {
    return null
  }
}

function submoduleExists(path: string): boolean {
  const gitmodulesPath = join(root, '.gitmodules')
  if (!existsSync(gitmodulesPath)) return false
  return readFileSync(gitmodulesPath, 'utf-8').includes(`path = ${path}`)
}

// Step 1: Add any missing submodules
const toAdd: Array<{ path: string; url: string }> = []

for (const [name, url] of Object.entries(sources)) {
  const path = `sources/${name}`
  if (!submoduleExists(path)) toAdd.push({ path, url })
}

for (const [name, config] of Object.entries(vendors)) {
  const path = `vendor/${name}`
  if (!submoduleExists(path)) toAdd.push({ path, url: config.source })
}

for (const { path, url } of toAdd) {
  const parentDir = join(root, dirname(path))
  if (!existsSync(parentDir)) mkdirSync(parentDir, { recursive: true })
  console.log(`Adding: ${path}`)
  execInherit(`git submodule add --depth 1 ${url} ${path}`)
}

// Step 2: Pull latest (shallow)
console.log('\nUpdating submodules...')
execInherit('git submodule update --remote --merge --depth 1')
console.log('Submodules updated\n')

// Step 3: Sync vendor skills
for (const [vendorName, config] of Object.entries(vendors)) {
  const vendorPath = join(root, 'vendor', vendorName)

  if (!existsSync(vendorPath)) {
    console.warn(`SKIP vendor/${vendorName} — submodule directory missing`)
    continue
  }

  for (const [skillPath, outputName] of Object.entries(config.skills)) {
    const sourcePath = join(vendorPath, skillPath)
    const outputPath = join(root, 'skills', outputName)

    if (!existsSync(sourcePath)) {
      console.warn(`SKIP ${vendorName}/${skillPath} — path not found in submodule`)
      continue
    }

    if (existsSync(outputPath)) rmSync(outputPath, { recursive: true })
    mkdirSync(outputPath, { recursive: true })
    cpSync(sourcePath, outputPath, { recursive: true })

    // Copy LICENSE from vendor root if present
    for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
      const licenseSrc = join(vendorPath, name)
      if (existsSync(licenseSrc)) {
        cpSync(licenseSrc, join(outputPath, 'LICENSE.md'))
        break
      }
    }

    // Write SYNC.md
    const sha = getGitSha(vendorPath)
    const date = new Date().toISOString().split('T')[0]
    writeFileSync(
      join(outputPath, 'SYNC.md'),
      `# Sync Info\n\n- **Source:** \`vendor/${vendorName}/${skillPath}\`\n- **Git SHA:** \`${sha ?? 'unknown'}\`\n- **Synced:** ${date}\n`,
    )

    console.log(`synced  ${vendorName}/${skillPath} → skills/${outputName}`)
  }
}

console.log('\nDone')
