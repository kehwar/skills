import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'
import { Effect } from 'effect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FsError, SkillCloningService } from './skill-cloning.js'

async function run<T>(effect: Effect.Effect<T, unknown, SkillCloningService>): Promise<T> {
  return Effect.runPromise(
    effect.pipe(Effect.provide(SkillCloningService.Default)),
  )
}

describe('skillCloningService', () => {
  let temporaryDirectory: string

  beforeEach(async () => {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-cloning-'))
  })

  afterEach(async () => {
    await fs.rm(temporaryDirectory, { recursive: true, force: true })
  })

  it('copies source directory contents to destination', async () => {
    const sourceDirectory = path.join(temporaryDirectory, 'source')
    const destinationDirectory = path.join(temporaryDirectory, 'dest')
    await fs.mkdir(sourceDirectory, { recursive: true })
    await fs.writeFile(path.join(sourceDirectory, 'SKILL.md'), '# Test Skill')
    await fs.writeFile(path.join(sourceDirectory, 'config.json'), '{"key": "value"}')

    await run(
      Effect.gen(function* () {
        const svc = yield* SkillCloningService
        return yield* svc.copySkill(sourceDirectory, destinationDirectory)
      }),
    )

    const skillContent = await fs.readFile(path.join(destinationDirectory, 'SKILL.md'), 'utf8')
    expect(skillContent).toBe('# Test Skill')
    const configContent = await fs.readFile(path.join(destinationDirectory, 'config.json'), 'utf8')
    expect(configContent).toBe('{"key": "value"}')
  })

  it('creates parent directories when dest is nested', async () => {
    const sourceDirectory = path.join(temporaryDirectory, 'source')
    const destinationDirectory = path.join(temporaryDirectory, 'nested', 'deep', 'dest')
    await fs.mkdir(sourceDirectory, { recursive: true })
    await fs.writeFile(path.join(sourceDirectory, 'SKILL.md'), '# Nested')

    await run(
      Effect.gen(function* () {
        const svc = yield* SkillCloningService
        return yield* svc.copySkill(sourceDirectory, destinationDirectory)
      }),
    )

    const content = await fs.readFile(path.join(destinationDirectory, 'SKILL.md'), 'utf8')
    expect(content).toBe('# Nested')
  })

  it('returns FsError when source does not exist', async () => {
    const result = await Effect.runPromise(
      Effect.either(
        Effect.gen(function* () {
          const svc = yield* SkillCloningService
          return yield* svc.copySkill('/nonexistent/path', path.join(temporaryDirectory, 'dest'))
        }).pipe(Effect.provide(SkillCloningService.Default)),
      ),
    )

    expect(result._tag).toBe('Left')
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(FsError)
    }
  })
})
