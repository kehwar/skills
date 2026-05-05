/**
 * Check submodules for available upstream updates without pulling.
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exec } from './lib/gitOps.ts'
import { MetaStore } from './lib/metaStore.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const store = new MetaStore(root)
const upstreams = store.getAllUpstreams()

console.log('Fetching remote changes...')
exec('git submodule foreach git fetch', { cwd: root, inherit: true })
console.log()

const updates: Array<{ name: string, behind: number, skills?: string }> = []

for (const [name, config] of Object.entries(upstreams)) {
  const path = join(root, 'upstream', name)
  if (!existsSync(path))
    continue
  const count = Number.parseInt(exec('git rev-list HEAD..@{u} --count', { cwd: path, safe: true }) ?? '0')
  if (count > 0) {
    updates.push({
      name,
      behind: count,
      skills: config.skills ? Object.values(config.skills).join(', ') : undefined,
    })
  }
}

if (updates.length === 0) {
  console.log('All submodules are up to date')
}
else {
  console.log('Updates available:')
  for (const u of updates) {
    const detail = u.skills ? ` (${u.skills})` : ''
    console.log(`  ${u.name}${detail}: ${u.behind} commit(s) behind`)
  }
}
