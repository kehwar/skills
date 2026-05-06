/**
 * Check submodules for available upstream updates without pulling.
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import { exec } from './lib/gitOps.ts'
import { MetaStore } from './lib/metaStore.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const store = new MetaStore(root)
const upstreams = store.getAllUpstreams()

p.intro('Check')

p.log.step('Fetching remote changes...')
const fetchResult = exec('git submodule foreach git fetch', { cwd: root })
if (!fetchResult.ok) {
  p.log.error(`Failed to fetch submodules: ${fetchResult.error}`)
  process.exit(1)
}

const updates: Array<{ name: string, behind: number, skills?: string }> = []

for (const [name, config] of Object.entries(upstreams)) {
  const path = join(root, 'upstream', name)
  if (!existsSync(path))
    continue
  const countResult = exec('git rev-list HEAD..@{u} --count', { cwd: path })
  const count = countResult.ok ? Number.parseInt(countResult.data) || 0 : 0
  if (count > 0) {
    updates.push({
      name,
      behind: count,
      skills: config.skills ? Object.values(config.skills).join(', ') : undefined,
    })
  }
}

if (updates.length === 0) {
  p.log.step('All submodules are up to date')
}
else {
  p.log.info('Updates available:')
  for (const u of updates) {
    const detail = u.skills ? ` (${u.skills})` : ''
    p.log.info(`  ${u.name}${detail}: ${u.behind} commit(s) behind`)
  }
}

p.outro('Done')
