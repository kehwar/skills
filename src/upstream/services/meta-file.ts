import * as fs from 'node:fs/promises'
import { Data, Effect } from 'effect'

export class MetaFileReadError extends Data.TaggedError('MetaFileReadError')<{
  message: string
}> {}

export class MetaFileWriteError extends Data.TaggedError('MetaFileWriteError')<{
  message: string
}> {}

export class MetaFileService extends Effect.Service<MetaFileService>()('upstream/MetaFileService', {
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
