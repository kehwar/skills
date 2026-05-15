import type { MetaJson, UpstreamEntry } from './meta-file.js'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'
import { Effect, Either } from 'effect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MetaFileInvalidJsonError, MetaFileNotFoundError, MetaFileService, MetaFileUnknownError } from './meta-file.js'

async function runWithMetaFileService<T>(effect: Effect.Effect<T, unknown, MetaFileService>): Promise<T> {
  return Effect.runPromise(
    effect.pipe(Effect.provide(MetaFileService.Default)),
  )
}

async function runWithMetaFileServiceEither<T, E>(
  effect: Effect.Effect<T, E, MetaFileService>,
): Promise<Either.Either<T, E>> {
  return Effect.runPromise(
    Effect.either(effect.pipe(Effect.provide(MetaFileService.Default))),
  )
}

describe('metaJson types from shared module', () => {
  let temporaryDirectory: string

  beforeEach(async () => {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'meta-test-'))
  })

  afterEach(async () => {
    await fs.rm(temporaryDirectory, { recursive: true, force: true })
  })

  it('metaJson and UpstreamEntry types are importable', () => {
    const entry: UpstreamEntry = {
      url: 'https://github.com/test/skills',
      skills: {},
      available: {},
    }
    const meta: MetaJson = {
      upstreams: { test: entry },
    }
    expect(meta.upstreams.test!.url).toBe('https://github.com/test/skills')
  })

  it('read returns Partial<MetaJson> — empty file gives empty object', async () => {
    const metaPath = path.join(temporaryDirectory, 'meta.json')
    await fs.writeFile(metaPath, '{}')

    const result = await runWithMetaFileService(
      Effect.gen(function* () {
        const svc = yield* MetaFileService
        return yield* svc.read(metaPath)
      }),
    )

    expect(result).toEqual({})
  })

  it('read returns parsed upstream entry', async () => {
    const metaPath = path.join(temporaryDirectory, 'meta.json')
    await fs.writeFile(
      metaPath,
      JSON.stringify({
        upstreams: {
          test: {
            url: 'https://github.com/test/skills',
            skills: { 'skills/foo': 'foo' },
            available: {},
          },
        },
      }),
    )

    const result = await runWithMetaFileService(
      Effect.gen(function* () {
        const svc = yield* MetaFileService
        return yield* svc.read(metaPath)
      }),
    )

    expect(result.upstreams?.test?.url).toBe('https://github.com/test/skills')
  })

  it('read returns MetaFileNotFoundError for missing file', async () => {
    const metaPath = path.join(temporaryDirectory, 'nonexistent.json')

    const result = await runWithMetaFileServiceEither(
      Effect.gen(function* () {
        const svc = yield* MetaFileService
        return yield* svc.read(metaPath)
      }),
    )

    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(MetaFileNotFoundError)
      expect(result.left.filePath).toBe(metaPath)
    }
  })

  it('read returns MetaFileInvalidJsonError for bad JSON', async () => {
    const metaPath = path.join(temporaryDirectory, 'meta.json')
    await fs.writeFile(metaPath, '{ bad json }')

    const result = await runWithMetaFileServiceEither(
      Effect.gen(function* () {
        const svc = yield* MetaFileService
        return yield* svc.read(metaPath)
      }),
    )

    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(MetaFileInvalidJsonError)
      expect(result.left.filePath).toBe(metaPath)
    }
  })

  it('read returns MetaFileUnknownError for non-ENOENT/EACCES system errors', async () => {
    const metaPath = path.join(temporaryDirectory, 'meta.json')
    await fs.writeFile(metaPath, '{}')

    const result = await runWithMetaFileServiceEither(
      Effect.gen(function* () {
        const svc = yield* MetaFileService
        return yield* svc.read('/dev/null/meta.json')
      }),
    )

    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(MetaFileUnknownError)
    }
  })

  it('write accepts MetaJson shape', async () => {
    const metaPath = path.join(temporaryDirectory, 'meta.json')
    const data: MetaJson = {
      upstreams: {
        test: {
          url: 'https://github.com/test/skills',
          skills: { 'skills/foo': 'foo' },
          available: {},
        },
      },
    }

    await runWithMetaFileService(
      Effect.gen(function* () {
        const svc = yield* MetaFileService
        return yield* svc.write(metaPath, data)
      }),
    )

    const content = await fs.readFile(metaPath, 'utf8')
    const parsed = JSON.parse(content) as { upstreams: Record<string, { url: string }> }
    expect(parsed.upstreams.test!.url).toBe('https://github.com/test/skills')
  })
})
