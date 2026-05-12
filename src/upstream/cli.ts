#!/usr/bin/env node

import process from 'node:process'
import { defineCommand, runMain } from 'citty'
import { Effect } from 'effect'
import { isCalledDirectly } from '../shared/index.js'
import {
  GitService,
  LogService,
  MetaFileService,
  SkillDiscoveryService,
  SkillHashService,
  UserPromptService,
} from './services/index.js'
import { upstreamAdd } from './upstream.js'

export interface CommandResult {
  exitCode: number
  message?: string
}

export interface CommandInput {
  root: string
  args: string[]
}

function handleUpstream(input: CommandInput): Effect.Effect<CommandResult, Error> {
  return Effect.gen(function* () {
    const arguments_ = input.args
    const nameIndex = arguments_.findIndex(a => a === '--name' || a === '-n')
    const nameOverride = nameIndex === -1 ? undefined : arguments_[nameIndex + 1]
    const branchIndex = arguments_.findIndex(a => a === '--branch' || a === '-b')
    const branch = branchIndex === -1 ? undefined : arguments_[branchIndex + 1]
    const url = arguments_.find((_, index) =>
      !(nameIndex !== -1 && (index === nameIndex || index === nameIndex + 1))
      && !(branchIndex !== -1 && (index === branchIndex || index === branchIndex + 1)),
    )

    if (url === undefined) {
      return { exitCode: 1, message: 'Missing URL argument' }
    }

    const result = yield* upstreamAdd({
      root: input.root,
      url,
      upstreamKey: nameOverride,
      branch,
      selectedSkills: {},
    })

    return { exitCode: 0, message: `Added upstream: ${result.upstreamKey}` }
  }).pipe(
    Effect.provide(
      MetaFileService.Default,
    ),
    Effect.provide(
      UserPromptService.Default,
    ),
    Effect.provide(
      LogService.Default,
    ),
    Effect.provide(
      GitService.Default,
    ),
    Effect.provide(
      SkillDiscoveryService.Default,
    ),
    Effect.provide(
      SkillHashService.Default,
    ),
  )
}

export const upstreamCmd = defineCommand({
  meta: {
    name: 'upstream',
    description: 'Add upstream to meta.json',
  },
  args: {
    url: {
      type: 'positional',
      description: 'GitHub URL (https://, git@, or github.com/org/repo)',
      required: true,
    },
    name: {
      type: 'string',
      alias: 'n',
      description: 'Upstream name (auto-derived from URL if omitted)',
    },
    branch: {
      type: 'string',
      alias: 'b',
      description: 'Git branch to track (default: repository default branch)',
    },
  },
  async run({ args }) {
    const cmdArguments: string[] = [args.url]

    if (typeof args.name === 'string') {
      cmdArguments.push('--name', args.name)
    }

    if (typeof args.branch === 'string') {
      cmdArguments.push('--branch', args.branch)
    }

    const result = await Effect.runPromise(
      handleUpstream({ root: process.cwd(), args: cmdArguments }),
    )

    if (typeof result.message === 'string') {
      console.log(result.message)
    }

    process.exit(result.exitCode)
  },
})

if (isCalledDirectly(import.meta.url)) {
  void runMain(upstreamCmd)
}
