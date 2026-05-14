import * as fs from 'node:fs/promises'
import path from 'node:path'
import { Effect } from 'effect'

export interface CleanupInput {
  root: string
}

export interface CleanupOutput {
  exitCode: number
  removed: string[]
  message?: string
}

export function cleanup(input: CleanupInput): Effect.Effect<CleanupOutput, never> {
  return Effect.tryPromise(async () => {
    const metaPath = path.join(input.root, 'meta.json')
    let metaContent: string
    try {
      metaContent = await fs.readFile(metaPath, 'utf8')
    }
    catch {
      return { exitCode: 0, removed: [], message: 'No meta.json found' }
    }

    const meta = JSON.parse(metaContent) as { upstreams?: Record<string, { skills?: Record<string, string> }> }
    const declaredSet = new Set<string>()

    if (meta.upstreams) {
      for (const upstream of Object.values(meta.upstreams)) {
        if (upstream.skills) {
          for (const outputName of Object.values(upstream.skills)) {
            declaredSet.add(outputName)
          }
        }
      }
    }

    const skillsDirectory = path.join(input.root, 'skills')
    let skillsEntries: string[]
    try {
      skillsEntries = await fs.readdir(skillsDirectory, { withFileTypes: true })
        .then(entries => entries.filter(entry => entry.isDirectory()).map(entry => entry.name))
    }
    catch {
      return { exitCode: 0, removed: [], message: 'No skills/ directory found' }
    }

    const orphans = skillsEntries.filter(name => !declaredSet.has(name))
    const removed: string[] = []

    for (const orphan of orphans) {
      await fs.rm(path.join(skillsDirectory, orphan), { recursive: true, force: true })
      removed.push(orphan)
    }

    return { exitCode: 0, removed }
  }).pipe(
    Effect.catchAll((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      return Effect.succeed({ exitCode: 1, removed: [], message: `Cleanup failed: ${message}` })
    }),
  )
}
