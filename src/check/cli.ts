#!/usr/bin/env node

import process from 'node:process'
import { defineCommand, runMain } from 'citty'
import { Effect } from 'effect'
import { isCalledDirectly, LogService, MetaFileService } from '../shared/index.js'
import { GitService } from '../upstream/services/index.js'
import { check } from './check.js'

export const checkCmd = defineCommand({
  meta: {
    name: 'check',
    description: 'Check how many commits behind each tracked upstream is',
  },
  async run() {
    const program = Effect.gen(function* () {
      const output = yield* check({ root: process.cwd() })

      for (const r of output.results) {
        const error = r.error
        if (error !== undefined) {
          console.log(`${r.upstreamKey}  (${r.branch})  ${error}`)
        }
        else if (r.behind === 0) {
          console.log(`${r.upstreamKey}  (${r.branch})  0 commits behind`)
        }
        else {
          console.log(`${r.upstreamKey}  (${r.branch})  ${r.behind} commits behind`)
        }
      }
    })

    await Effect.runPromise(
      program.pipe(
        Effect.catchAll((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          console.log(`Error: ${message}`)
          return Effect.void
        }),
        Effect.provide(MetaFileService.Default),
        Effect.provide(LogService.Default),
        Effect.provide(GitService.Default),
      ),
    )

    process.exit(0)
  },
})

if (isCalledDirectly(import.meta.url)) {
  void runMain(checkCmd)
}
