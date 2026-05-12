import type { Buffer } from 'node:buffer'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Data, Effect } from 'effect'

export class FileReadError extends Data.TaggedError('FileReadError')<{
  path: string
  message: string
}> {}

export class SkillHashService extends Effect.Service<SkillHashService>()('upstream/SkillHashService', {
  effect: Effect.sync(() => {
    async function hashSkillDirectoryImpl(skillDir: string): Promise<string> {
      const files: Array<{ relativePath: string, content: Buffer }> = []
      await collectFiles(skillDir, skillDir, files)

      // Sort by relative path for deterministic hashing
      files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))

      const hash = crypto.createHash('sha256')
      for (const file of files) {
        // Include the path in the hash so renames are detected
        hash.update(file.relativePath)
        hash.update(file.content)
      }

      return hash.digest('hex')
    }

    async function collectFiles(
      baseDir: string,
      currentDir: string,
      results: Array<{ relativePath: string, content: Buffer }>,
    ): Promise<void> {
      const entries = await fs.readdir(currentDir, { withFileTypes: true })

      await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(currentDir, entry.name)

          if (entry.isDirectory()) {
            // Skip .git and node_modules within skill dirs
            if (entry.name === '.git' || entry.name === 'node_modules')
              return
            await collectFiles(baseDir, fullPath, results)
          }
          else if (entry.isFile()) {
            const content = await fs.readFile(fullPath)
            const relativePath = path.relative(baseDir, fullPath).split('\\').join('/')
            results.push({ relativePath, content })
          }
        }),
      )
    }

    return {
      hashSkillDirectory: (directoryPath: string) =>
        Effect.gen(function* () {
          const result = yield* Effect.tryPromise({
            try: async () => hashSkillDirectoryImpl(directoryPath),
            catch: () =>
              new FileReadError({
                path: directoryPath,
                message: `Could not hash skill directory at ${directoryPath}`,
              }),
          })

          return result
        }),
    }
  }),
}) {}
