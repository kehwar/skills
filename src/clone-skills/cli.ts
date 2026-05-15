#!/usr/bin/env node

import process from 'node:process'
import { defineCommand, runMain } from 'citty'
import { Effect } from 'effect'
import { isCalledDirectly, LogService, MetaFileService, UserPromptService } from '../shared/index.js'
import {
  SkillCloningService,
} from '../shared/services/index.js'
import { cloneSkills } from './clone-skills.js'

export interface CommandResult {
  exitCode: number
  message?: string
}

export interface CommandInput {
  root: string
  upstreamName: string
}

function handleCloneSkills(input: CommandInput): Effect.Effect<CommandResult, Error> {
  return Effect.gen(function* () {
    const result = yield* cloneSkills({
      root: input.root,
      upstreamName: input.upstreamName,
    })

    return {
      exitCode: 0,
      message: result.message,
    }
  }).pipe(
    Effect.catchAll((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      return Effect.succeed({
        exitCode: 1,
        message: `Error: ${message}`,
      })
    }),
    Effect.provide(MetaFileService.Default),
    Effect.provide(UserPromptService.Default),
    Effect.provide(LogService.Default),
    Effect.provide(SkillCloningService.Default),
  )
}

export const cloneSkillsCmd = defineCommand({
  meta: {
    name: 'clone-skills',
    description: 'Select which skills to clone from an upstream',
  },
  args: {
    upstream: {
      type: 'positional',
      description: 'Upstream name to select skills from',
      required: true,
    },
  },
  async run({ args }) {
    const result = await Effect.runPromise(
      handleCloneSkills({
        root: process.cwd(),
        upstreamName: args.upstream,
      }),
    )

    if (typeof result.message === 'string') {
      console.log(result.message)
    }

    process.exit(result.exitCode)
  },
})

if (isCalledDirectly(import.meta.url)) {
  void runMain(cloneSkillsCmd)
}
