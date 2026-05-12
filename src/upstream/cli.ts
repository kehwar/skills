import process from 'node:process'
import { defineCommand } from 'citty'
import { Effect } from 'effect'
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
    const args = input.args
    const nameIndex = args.findIndex(a => a === '--name' || a === '-n')
    const nameOverride = nameIndex === -1 ? undefined : args[nameIndex + 1]
    const url = args.find((_, i) => !(nameIndex !== -1 && (i === nameIndex || i === nameIndex + 1)))

    if (typeof url === 'undefined') {
      return { exitCode: 1, message: 'Missing URL argument' }
    }

    const result = yield* upstreamAdd({
      root: input.root,
      url,
      upstreamKey: nameOverride,
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
  },
  async run({ args }) {
    const cmdArgs: string[] = [args.url]

    if (typeof args.name === 'string') {
      cmdArgs.push('--name', args.name)
    }

    const result = await Effect.runPromise(
      handleUpstream({ root: process.cwd(), args: cmdArgs }),
    )

    if (typeof result.message === 'string') {
      console.log(result.message)
    }

    process.exit(result.exitCode)
  },
})
