import * as fs from 'node:fs/promises'
import { Data, Effect } from 'effect'

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
            return JSON.parse(content) as Record<string, unknown>
          }
          catch {
            return { upstreams: {} }
          }
        },
        catch: () => new MetaFileReadError({ message: 'Failed to read meta.json' }),
      }),

    write: (filePath: string, data: Record<string, unknown>) =>
      Effect.tryPromise({
        try: async () => {
          await fs.writeFile(filePath, JSON.stringify(data, undefined, 2))
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
    write: (_filePath: string, _data: Record<string, unknown>) =>
      Effect.sync(() => {}),
  }
  return new MetaFileService({ ...defaults, ...overrides })
}
