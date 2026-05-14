import type { LogService } from '../shared/services/index.js'
import path from 'node:path'
import { Effect } from 'effect'
import {
  GitService,
  MetaFileService,
} from '../shared/services/index.js'

export interface CheckInput {
  root: string
}

export interface UpstreamCheckResult {
  upstreamKey: string
  branch: string
  behind: number
  error?: string
}

export interface CheckOutput {
  results: UpstreamCheckResult[]
}

type CheckServices = MetaFileService | LogService | GitService

interface UpstreamEntry {
  url: string
  branch?: string
  skills: Record<string, string>
  available: Record<string, string>
}

function checkUpstream(
  root: string,
  upstreamKey: string,
  upstream: UpstreamEntry,
): Effect.Effect<UpstreamCheckResult, never, CheckServices> {
  return Effect.gen(function* () {
    const gitService = yield* GitService
    const branch = upstream.branch ?? 'default'

    yield* gitService.fetchSubmodule(root, upstreamKey).pipe(
      Effect.catchAll(() => Effect.void),
    )

    const behind = yield* gitService.countCommitsBehind(root, upstreamKey).pipe(
      Effect.catchAll(() => Effect.succeed(-1)),
    )

    if (behind === -1) {
      return {
        upstreamKey,
        branch,
        behind: 0,
        error: 'unreachable',
      }
    }

    return {
      upstreamKey,
      branch,
      behind,
    }
  })
}

export function check(
  input: CheckInput,
): Effect.Effect<CheckOutput, never, CheckServices> {
  return Effect.gen(function* () {
    const metaFileService = yield* MetaFileService

    const metaPath = path.join(input.root, 'meta.json')
    const metaData = yield* metaFileService.read(metaPath).pipe(
      Effect.catchAllCause(() => Effect.succeed({ upstreams: {} })),
    )
    const rawUpstreams = 'upstreams' in metaData && typeof metaData.upstreams === 'object' && metaData.upstreams !== null
      ? metaData.upstreams
      : {}
    const upstreams = rawUpstreams as Record<string, UpstreamEntry>

    const upstreamEntries = Object.entries(upstreams)

    const results: UpstreamCheckResult[] = yield* Effect.all(
      upstreamEntries.map(([upstreamKey, rawUpstream]) => {
        const upstream = {
          ...rawUpstream,
          skills: rawUpstream.skills ?? {},
          available: rawUpstream.available ?? {},
        }
        return checkUpstream(input.root, upstreamKey, upstream)
      }),
      { concurrency: 'unbounded' },
    )

    return { results }
  })
}
