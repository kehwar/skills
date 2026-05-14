#!/usr/bin/env node

import process from 'node:process'
import { defineCommand, runMain } from 'citty'
import { Effect } from 'effect'
import { isCalledDirectly, LogService, MetaFileService } from '../shared/index.js'
import {
  GitService,
  SkillDiscoveryService,
  SkillHashService,
} from '../upstream/services/index.js'
import { sync } from './sync.js'

export interface CommandResult {
  exitCode: number
  message?: string
}

function handleSync(root: string): Effect.Effect<CommandResult, Error> {
  return Effect.gen(function* () {
    const result = yield* sync({ root })

    const upstreamCount = result.upstreams.length
    const totalCopied = result.upstreams.reduce((s, u) => s + u.skillsCopied, 0)
    const totalSkipped = result.upstreams.reduce((s, u) => s + u.skillsSkipped, 0)
    const totalRemoved = result.upstreams.reduce((s, u) => s + u.skillsRemoved, 0)

    const warnings = result.upstreams.flatMap(u => u.warnings)
    for (const w of warnings) {
      const logService = yield* LogService
      yield* logService.warn(w)
    }

    return {
      exitCode: warnings.length > 0 ? 1 : 0,
      message: `Sync complete: ${upstreamCount} upstream(s), ${totalCopied} copied, ${totalSkipped} skipped, ${totalRemoved} removed`,
    }
  }).pipe(
    Effect.catchAll((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      return Effect.succeed({ exitCode: 1, message: `Error: ${message}` })
    }),
    Effect.provide(MetaFileService.Default),
    Effect.provide(LogService.Default),
    Effect.provide(SkillDiscoveryService.Default),
    Effect.provide(SkillHashService.Default),
    Effect.provide(GitService.Default),
  )
}

export const syncCmd = defineCommand({
  meta: {
    name: 'sync',
    description: 'Pull latest upstream submodules and copy selected skills to skills/',
  },
  async run() {
    const result = await Effect.runPromise(
      handleSync(process.cwd()),
    )

    if (typeof result.message === 'string') {
      console.log(result.message)
    }

    process.exit(result.exitCode)
  },
})

if (isCalledDirectly(import.meta.url)) {
  void runMain(syncCmd)
}
