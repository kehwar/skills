import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'
import { Effect } from 'effect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SkillCleanupService } from './skill-cleanup.js'

async function run<T>(effect: Effect.Effect<T, unknown, SkillCleanupService>): Promise<T> {
  return Effect.runPromise(
    effect.pipe(Effect.provide(SkillCleanupService.Default)),
  )
}

describe('skillCleanupService', () => {
  let temporaryDirectory: string

  beforeEach(async () => {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-cleanup-'))
  })

  afterEach(async () => {
    await fs.rm(temporaryDirectory, { recursive: true, force: true })
  })

  async function createSyncedDirectory(name: string): Promise<void> {
    const directory = path.join(temporaryDirectory, 'synced', name)
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(path.join(directory, 'SKILL.md'), `# ${name}`)
  }

  it('removes orphaned synced directories not in declared set', async () => {
    await createSyncedDirectory('orphan-a')
    await createSyncedDirectory('orphan-b')
    await createSyncedDirectory('keep-me')

    const result = await run(
      Effect.gen(function* () {
        const svc = yield* SkillCleanupService
        return yield* svc.removeOrphans(['keep-me'], path.join(temporaryDirectory, 'synced'))
      }),
    )

    expect(result).toEqual(['orphan-a', 'orphan-b'])

    const keptExists = await fs.stat(path.join(temporaryDirectory, 'synced', 'keep-me')).then(() => true).catch(() => false)
    expect(keptExists).toBe(true)

    const aExists = await fs.stat(path.join(temporaryDirectory, 'synced', 'orphan-a')).then(() => true).catch(() => false)
    const bExists = await fs.stat(path.join(temporaryDirectory, 'synced', 'orphan-b')).then(() => true).catch(() => false)
    expect(aExists).toBe(false)
    expect(bExists).toBe(false)
  })

  it('returns empty array when no orphans exist', async () => {
    await createSyncedDirectory('skill-a')
    await createSyncedDirectory('skill-b')

    const result = await run(
      Effect.gen(function* () {
        const svc = yield* SkillCleanupService
        return yield* svc.removeOrphans(['skill-a', 'skill-b'], path.join(temporaryDirectory, 'synced'))
      }),
    )

    expect(result).toEqual([])
  })

  it('handles missing synced directory gracefully', async () => {
    const result = await run(
      Effect.gen(function* () {
        const svc = yield* SkillCleanupService
        return yield* svc.removeOrphans(['some-skill'], path.join(temporaryDirectory, 'nonexistent'))
      }),
    )

    expect(result).toEqual([])
  })
})
