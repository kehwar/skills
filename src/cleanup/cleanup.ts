import path from 'node:path'
import { Effect } from 'effect'
import {
  MetaFileNotFoundError,
  MetaFileService,
  SkillCleanupService,
} from '../shared/services/index.js'

export interface CleanupInput {
  root: string
}

export interface CleanupOutput {
  exitCode: number
  removed: string[]
  message?: string
}

type CleanupServices = MetaFileService | SkillCleanupService

export function cleanup(input: CleanupInput): Effect.Effect<CleanupOutput, never, CleanupServices> {
  return Effect.gen(function* () {
    const metaFileService = yield* MetaFileService
    const skillCleanupService = yield* SkillCleanupService

    const metaPath = path.join(input.root, 'meta.json')
    const metaData = yield* metaFileService.read(metaPath).pipe(
      Effect.catchAll((error) => {
        if (error instanceof MetaFileNotFoundError) {
          return Effect.succeed({ upstreams: {} })
        }
        // Re-throw MetaFileInvalidJsonError and other errors
        return Effect.fail(error)
      }),
    )

    const declaredNames: string[] = []
    if (metaData.upstreams !== undefined) {
      for (const upstream of Object.values(metaData.upstreams)) {
        const upstreamSkills = (upstream as { skills?: Record<string, string> }).skills
        if (upstreamSkills !== undefined) {
          for (const outputName of Object.values(upstreamSkills)) {
            declaredNames.push(outputName)
          }
        }
      }
    }

    const removed = yield* skillCleanupService.removeOrphans(
      declaredNames,
      path.join(input.root, 'synced'),
    )

    return { exitCode: 0, removed }
  }).pipe(
    Effect.catchAll((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      return Effect.succeed({ exitCode: 1, removed: [], message: `Cleanup failed: ${message}` })
    }),
  )
}
