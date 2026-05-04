/**
 * Check submodules for available upstream updates without pulling.
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { sources, vendors } from '../meta.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function execSafe(cmd: string, cwd: string): string | null {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  }
  catch {
    return null
  }
}

console.log('Fetching remote changes...')
execSync('git submodule foreach git fetch', { cwd: root, stdio: 'inherit' })
console.log()

const updates: Array<{ name: string; type: string; behind: number }> = []

for (const name of Object.keys(sources)) {
  const path = join(root, 'sources', name)
  if (!existsSync(path)) continue
  const count = parseInt(execSafe('git rev-list HEAD..@{u} --count', path) ?? '0')
  if (count > 0) updates.push({ name, type: 'source', behind: count })
}

for (const [name, config] of Object.entries(vendors)) {
  const path = join(root, 'vendor', name)
  if (!existsSync(path)) continue
  const count = parseInt(execSafe('git rev-list HEAD..@{u} --count', path) ?? '0')
  if (count > 0) {
    const skills = Object.values(config.skills).join(', ')
    updates.push({ name: `${name} (${skills})`, type: 'vendor', behind: count })
  }
}

if (updates.length === 0) {
  console.log('All submodules are up to date')
}
else {
  console.log('Updates available:')
  for (const u of updates) {
    console.log(`  ${u.name} [${u.type}]: ${u.behind} commit(s) behind`)
  }
}
