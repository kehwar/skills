import * as fs from 'node:fs/promises'
import { Data, Effect } from 'effect'

export class FsError extends Data.TaggedError('FsError')<{
  path: string
  message: string
}> {}

async function copySkillImpl(sourceDirectory: string, destinationDirectory: string): Promise<void> {
  await fs.rm(destinationDirectory, { recursive: true, force: true })
  await fs.mkdir(destinationDirectory, { recursive: true })
  const entries = await fs.readdir(sourceDirectory, { withFileTypes: true })
  for (const entry of entries) {
    const sourcePath = `${sourceDirectory}/${entry.name}`
    const targetPath = `${destinationDirectory}/${entry.name}`
    await (entry.isDirectory()
      ? fs.cp(sourcePath, targetPath, { recursive: true })
      : fs.copyFile(sourcePath, targetPath))
  }
}

export class SkillCloningService extends Effect.Service<SkillCloningService>()('shared/SkillCloningService', {
  effect: Effect.sync(() => ({
    copySkill: (sourceDirectory: string, destinationDirectory: string) =>
      Effect.tryPromise({
        try: async () => copySkillImpl(sourceDirectory, destinationDirectory),
        catch: (error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          return new FsError({ path: sourceDirectory, message })
        },
      }),
  })),
}) {}
