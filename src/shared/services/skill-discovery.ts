import type { Brand } from 'effect'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { Data, Effect } from 'effect'

export type SkillPath = string & Brand.Brand<'SkillPath'>

export class DirectoryReadError extends Data.TaggedError('DirectoryReadError')<{
  path: string
  message: string
}> {}

export class SkillDiscoveryService extends Effect.Service<SkillDiscoveryService>()(
  'shared/SkillDiscoveryService',
  {
    effect: Effect.sync(() => ({
      discoverSkillsInDirectory: (directoryPath: string) =>
        Effect.gen(function* () {
          const skills: SkillPath[] = []

          const walkDirectory = async (currentPath: string, relativePath: string = ''): Promise<void> => {
            try {
              const entries = await fs.readdir(currentPath, { withFileTypes: true })

              for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name)
                const relativePath_ = relativePath ? path.join(relativePath, entry.name) : entry.name

                if (entry.isDirectory()) {
                  await walkDirectory(fullPath, relativePath_)
                }
                else if (entry.name === 'SKILL.md') {
                  skills.push(relativePath as SkillPath)
                }
              }
            }
            catch {
              // Silently skip directories we can't read
            }
          }

          yield* Effect.tryPromise({
            try: async () => walkDirectory(directoryPath),
            catch: () =>
              new DirectoryReadError({
                path: directoryPath,
                message: `Could not discover skills in ${directoryPath}`,
              }),
          })

          return skills
        }),
    })),
  },
) {}
