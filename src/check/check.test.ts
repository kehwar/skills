import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'
import { Effect } from 'effect'
import { simpleGit } from 'simple-git'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createMockLogService,
  LogService,
  MetaFileService,
} from '../shared/index.js'
import {
  GitService,
} from '../shared/services/index.js'

const MATT_POCOCK_URL = 'https://github.com/mattpocock/skills'

async function addSubmoduleFixture(root: string, upstreamKey: string): Promise<void> {
  const submodulePath = `upstream/${upstreamKey}`
  const git = simpleGit(root)
  const exists = await fs.stat(path.join(root, submodulePath)).then(() => true).catch(() => false)
  if (!exists) {
    await git.subModule(['add', '--depth', '1', MATT_POCOCK_URL, submodulePath])
  }
}

describe('check e2e with real repo', () => {
  let temporaryDirectory: string

  beforeEach(async () => {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'check-e2e-'))
    const git = simpleGit(temporaryDirectory)
    await git.init()
    await git.raw(['config', 'user.email', 'test@example.com'])
    await git.raw(['config', 'user.name', 'Test User'])
    await fs.writeFile(path.join(temporaryDirectory, 'README.md'), '# E2E Test\n')
    await git.add('.')
    await git.commit('Initial commit')
  })

  afterEach(async () => {
    await fs.rm(temporaryDirectory, { recursive: true, force: true })
  })

  it('should report 0 behind for a submodule that is up to date', async () => {
    await addSubmoduleFixture(temporaryDirectory, 'mattpocock')

    const metaPath = path.join(temporaryDirectory, 'meta.json')
    await fs.writeFile(
      metaPath,
      JSON.stringify({
        upstreams: {
          mattpocock: {
            url: MATT_POCOCK_URL,
            branch: 'main',
            skills: {},
            available: {},
          },
        },
      }),
    )

    const { check } = await import('./check.js')
    const result = await Effect.runPromise(
      check({ root: temporaryDirectory }).pipe(
        Effect.provide(MetaFileService.Default),
        Effect.provideService(LogService, createMockLogService()),
        Effect.provide(GitService.Default),
      ),
    )

    expect(result.results).toHaveLength(1)
    expect(result.results[0]?.upstreamKey).toBe('mattpocock')
    expect(result.results[0]?.branch).toBe('main')
    expect(result.results[0]?.error).toBeUndefined()
    expect(typeof result.results[0]?.behind).toBe('number')
    expect(result.results[0]?.behind).toBeGreaterThanOrEqual(0)
  }, 60_000)

  it('should handle unreachable upstream gracefully', async () => {
    const metaPath = path.join(temporaryDirectory, 'meta.json')
    await fs.writeFile(
      metaPath,
      JSON.stringify({
        upstreams: {
          ghost: {
            url: 'https://github.com/nonexistent-org/nonexistent-repo',
            branch: 'main',
            skills: {},
            available: {},
          },
        },
      }),
    )

    const { check } = await import('./check.js')
    const result = await Effect.runPromise(
      check({ root: temporaryDirectory }).pipe(
        Effect.provide(MetaFileService.Default),
        Effect.provideService(LogService, createMockLogService()),
        Effect.provide(GitService.Default),
      ),
    )

    expect(result.results).toHaveLength(1)
    expect(result.results[0]?.upstreamKey).toBe('ghost')
    expect(result.results[0]?.error).toBe('unreachable')
  }, 30_000)

  it('should check multiple upstreams', async () => {
    await addSubmoduleFixture(temporaryDirectory, 'mattpocock')

    const metaPath = path.join(temporaryDirectory, 'meta.json')
    await fs.writeFile(
      metaPath,
      JSON.stringify({
        upstreams: {
          mattpocock: {
            url: MATT_POCOCK_URL,
            branch: 'main',
            skills: {},
            available: {},
          },
          ghost: {
            url: 'https://github.com/nonexistent-org/nonexistent-repo',
            branch: 'main',
            skills: {},
            available: {},
          },
        },
      }),
    )

    const { check } = await import('./check.js')
    const result = await Effect.runPromise(
      check({ root: temporaryDirectory }).pipe(
        Effect.provide(MetaFileService.Default),
        Effect.provideService(LogService, createMockLogService()),
        Effect.provide(GitService.Default),
      ),
    )

    expect(result.results).toHaveLength(2)

    const mattpocockResult = result.results.find(r => r.upstreamKey === 'mattpocock')
    expect(mattpocockResult).toBeDefined()
    expect(mattpocockResult?.error).toBeUndefined()
    expect(mattpocockResult?.branch).toBe('main')

    const ghostResult = result.results.find(r => r.upstreamKey === 'ghost')
    expect(ghostResult).toBeDefined()
    expect(ghostResult?.error).toBe('unreachable')
  }, 60_000)
})
