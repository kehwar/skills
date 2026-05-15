import type { Brand } from 'effect'
import type { SkillPath } from './skill-discovery.js'
import type { SkillHash } from './skill-hash.js'
import * as fs from 'node:fs/promises'
import { Data, Effect } from 'effect'

export type OutputName = string & Brand.Brand<'OutputName'>

export interface UpstreamEntry {
  url: string
  branch?: string
  skills: Record<SkillPath, OutputName>
  available: Record<SkillPath, SkillHash>
}

export interface MetaJson {
  upstreams: Record<string, UpstreamEntry>
}

export function buildUpstreamEntry(
  url: string,
  branch: string | undefined,
  skills: Record<SkillPath, OutputName>,
  available: Record<SkillPath, SkillHash>,
): UpstreamEntry {
  return {
    url,
    ...(branch !== undefined && branch.length > 0 ? { branch } : {}),
    skills,
    available,
  }
}

export class MetaFileNotFoundError extends Data.TaggedError('MetaFileNotFoundError')<{
  filePath: string
}> {}

export class MetaFileInvalidJsonError extends Data.TaggedError('MetaFileInvalidJsonError')<{
  filePath: string
  parseError: string
}> {}

export class MetaFilePermissionDeniedError extends Data.TaggedError('MetaFilePermissionDeniedError')<{
  filePath: string
}> {}

export class MetaFileUnknownError extends Data.TaggedError('MetaFileUnknownError')<{
  filePath: string
  message: string
}> {}

export class MetaFileWriteError extends Data.TaggedError('MetaFileWriteError')<{
  message: string
}> {}

function isSystemError(error: unknown): error is { code: string } {
  return error instanceof Error && 'code' in error
}

export class MetaFileService extends Effect.Service<MetaFileService>()('shared/MetaFileService', {
  effect: Effect.sync(() => ({
    read: (filePath: string) =>
      Effect.tryPromise({
        try: async () => {
          let content: string
          try {
            content = await fs.readFile(filePath, 'utf8')
          }
          catch (error) {
            if (isSystemError(error)) {
              if (error.code === 'ENOENT') {
                throw new MetaFileNotFoundError({ filePath })
              }
              if (error.code === 'EACCES' || error.code === 'EPERM') {
                throw new MetaFilePermissionDeniedError({ filePath })
              }
            }
            throw new MetaFileUnknownError({ filePath, message: String(error) })
          }

          try {
            return JSON.parse(content) as Partial<MetaJson>
          }
          catch (error) {
            throw new MetaFileInvalidJsonError({ filePath, parseError: String(error) })
          }
        },
        catch: error =>
          error as
          | MetaFileNotFoundError
          | MetaFileInvalidJsonError
          | MetaFilePermissionDeniedError
          | MetaFileUnknownError,
      }),

    write: (filePath: string, data: MetaJson) =>
      Effect.tryPromise({
        try: async () => {
          await fs.writeFile(filePath, `${JSON.stringify(data, undefined, 2)}\n`)
        },
        catch: () => new MetaFileWriteError({ message: 'Failed to write meta.json' }),
      }),
  })),
}) {}

type MetaFileServiceConfig = ConstructorParameters<typeof MetaFileService>[0]

export function createMockMetaFileService(
  overrides?: Partial<MetaFileServiceConfig>,
): MetaFileService {
  const defaults: MetaFileServiceConfig = {
    read: (_filePath: string) =>
      Effect.sync(() => ({ upstreams: {} })),
    write: (_filePath: string, _data: MetaJson) =>
      Effect.sync(() => {}),
  }
  return new MetaFileService({ ...defaults, ...overrides })
}
