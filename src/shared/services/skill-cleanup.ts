import * as fs from 'node:fs/promises'
import path from 'node:path'
import { Effect } from 'effect'

export class SkillCleanupService extends Effect.Service<SkillCleanupService>()('shared/SkillCleanupService', {
  effect: Effect.sync(() => ({
    removeOrphans: (declaredNames: string[], syncedRoot: string): Effect.Effect<string[], never> =>
      Effect.tryPromise(async () => {
        let entries: string[]
        try {
          const directoryEntries = await fs.readdir(syncedRoot, { withFileTypes: true })
          entries = directoryEntries.filter(entry => entry.isDirectory()).map(entry => entry.name)
        }
        catch {
          return []
        }

        const declaredSet = new Set(declaredNames)
        const orphans = entries.filter(name => !declaredSet.has(name))

        for (const orphan of orphans) {
          await fs.rm(path.join(syncedRoot, orphan), { recursive: true, force: true })
        }

        return orphans
      }).pipe(Effect.catchAll(() => Effect.succeed([] as string[]))),
  })),
}) {}
