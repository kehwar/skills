#!/usr/bin/env node
/**
 * Check submodules for available upstream updates without pulling.
 *
 * This is the CLI entry point that calls the check orchestrator.
 */

import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import { Effect } from 'effect'
import { MetaStore } from './lib/meta-store.ts'
import { check } from './orchestrators/check.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

async function main() {
  try {
    const store = new MetaStore(root)
    const upstreams = store.getAllUpstreams()

    p.intro('Check')

    const result = await Effect.runPromise(check({
      root,
      upstreams,
    }))

    // Filter for upstreams with updates
    const updates = result.results.filter(r => r.behind > 0 && !r.error)

    if (updates.length === 0) {
      p.log.step('All substreams are up to date')
    }
    else {
      p.log.info('Updates available:')
      for (const u of updates) {
        const skillsString = u.skills && u.skills.length > 0 ? ` (${u.skills.join(', ')})` : ''
        p.log.info(`  ${u.upstreamName}${skillsString}: ${u.behind} commit(s) behind`)
      }
    }

    // Report any errors
    const errors = result.results.filter(r => r.error)
    if (errors.length > 0) {
      p.log.warn(`${errors.length} upstream(s) failed to check:`)
      for (const error of errors) {
        p.log.warn(`  ${error.upstreamName}: ${error.error}`)
      }
    }

    p.outro('Done')
  }
  catch (error) {
    p.log.error(`Fatal error: ${(error as Error).message}`)
    process.exit(1)
  }
}

await main()
