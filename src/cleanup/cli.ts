#!/usr/bin/env node

import process from 'node:process'
import { defineCommand, runMain } from 'citty'
import { Effect } from 'effect'
import { isCalledDirectly } from '../shared/index.js'
import { MetaFileService, SkillCleanupService } from '../shared/services/index.js'
import { cleanup } from './cleanup.js'

export const cleanupCmd = defineCommand({
  meta: {
    name: 'cleanup',
    description: 'Remove synced skills that are no longer declared in meta.json',
  },
  async run() {
    const result = await Effect.runPromise(
      cleanup({ root: process.cwd() }).pipe(
        Effect.provide(MetaFileService.Default),
        Effect.provide(SkillCleanupService.Default),
      ),
    )

    if (result.removed.length > 0) {
      console.log(`Removed ${result.removed.length} orphaned skill(s):`)
      for (const name of result.removed) {
        console.log(`  - ${name}`)
      }
    }
    else {
      console.log(result.message ?? 'No orphaned skills found')
    }

    process.exit(result.exitCode)
  },
})

if (isCalledDirectly(import.meta.url)) {
  void runMain(cleanupCmd)
}
