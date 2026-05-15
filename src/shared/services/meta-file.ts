import * as fs from 'node:fs/promises'
import { Data, Effect } from 'effect'

export interface UpstreamEntry {
  url: string
  branch?: string
  skills: Record<string, string>
  available: Record<string, string>
}

export interface MetaJson {
  upstreams: Record<string, UpstreamEntry>
}

export class MetaFileReadError extends Data.TaggedError('MetaFileReadError')<{
  message: string
}> {}

export class MetaFileWriteError extends Data.TaggedError('MetaFileWriteError')<{
  message: string
}> {}

export class MetaFileService extends Effect.Service<MetaFileService>()('shared/MetaFileService', {
  effect: Effect.sync(() => ({
    read: (filePath: string) =>
      Effect.tryPromise({
        try: async () => {
          try {
            const content = await fs.readFile(filePath, 'utf8')
            return JSON.parse(content) as Partial<MetaJson>
          }
          catch {
            return { upstreams: {} }
          }
        },
        catch: () => new MetaFileReadError({ message: 'Failed to read meta.json' }),
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
