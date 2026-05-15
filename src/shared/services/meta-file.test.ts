import type { MetaJson, UpstreamEntry } from './meta-file.js'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'
import { Effect } from 'effect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MetaFileService } from './meta-file.js'

async function runWithMetaFileService<T>(effect: Effect.Effect<T, unknown, MetaFileService>): Promise<T> {
  return Effect.runPromise(
    effect.pipe(Effect.provide(MetaFileService.Default)),
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
    // Compile-time check: verify types exist by using them
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
