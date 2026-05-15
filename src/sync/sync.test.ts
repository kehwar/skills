import type {
  MetaJson,
} from '../shared/services/index.js'
import type { OutputName } from '../shared/services/meta-file.js'
import type { SkillPath } from '../shared/services/skill-discovery.js'
import type { SkillHash } from '../shared/services/skill-hash.js'
import type { Skill } from '../upstream/upstream.js'
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
  FileReadError,
  GitService,
  SkillCloningService,
  SkillDiscoveryService,
  SkillHashService,
} from '../shared/services/index.js'

const MATT_POCOCK_URL = 'https://github.com/mattpocock/skills'
const KNOW_SKILL_PATH = 'skills/engineering/tdd'
const KNOW_SKILL_OUTPUT = 'tdd'

async function addSubmoduleFixture(root: string, upstreamKey: string): Promise<void> {
  const submodulePath = `upstream/${upstreamKey}`
  const git = simpleGit(root)
  const exists = await fs.stat(path.join(root, submodulePath)).then(() => true).catch(() => false)
  if (!exists) {
    await git.subModule(['add', '--depth', '1', MATT_POCOCK_URL, submodulePath])
  }
}

function mockSkillHashService(hash: SkillHash | undefined): SkillHashService {
  return new SkillHashService({
    hashSkillDirectory: (_path: string) => {
      if (hash === undefined) {
        return Effect.fail(new FileReadError({ path: _path, message: 'not found' }))
      }
      return Effect.succeed(hash)
    },
  })
}

describe('computeDiff', () => {
  const root = '/fake/root'
  const upstreamKey = 'test-upstream'

  it('should mark selected skills not in discovered as toRemove with warning', async () => {
    const { computeDiff } = await import('./sync.js')

    const result = await Effect.runPromise(
      computeDiff(root, upstreamKey, [['foo/bar' as SkillPath, 'bar' as OutputName]], [], { available: {} }).pipe(
        Effect.provideService(SkillHashService, mockSkillHashService()),
      ),
    )

    expect(result.toRemove).toEqual([{ skillPath: 'foo/bar' as SkillPath, outputName: 'bar' as OutputName }])
    expect(result.warnings).toEqual(['Skill "foo/bar" no longer found in upstream "test-upstream"'])
    expect(result.toCopy).toHaveLength(0)
    expect(result.toSkip).toHaveLength(0)
  })

  it('should mark as toCopy when stored hash differs from upstream hash', async () => {
    const { computeDiff } = await import('./sync.js')

    const discovered: Skill[] = [{ path: 'foo/bar' as SkillPath, hash: 'abc123' as SkillHash }]
    const available: Record<SkillPath, SkillHash> = { ['foo/bar' as SkillPath]: 'old-hash' as SkillHash }

    const result = await Effect.runPromise(
      computeDiff(root, upstreamKey, [['foo/bar' as SkillPath, 'bar' as OutputName]], discovered, { available }).pipe(
        Effect.provideService(SkillHashService, mockSkillHashService()),
      ),
    )

    expect(result.toCopy).toEqual([{ skillPath: 'foo/bar' as SkillPath, outputName: 'bar' as OutputName }])
    expect(result.toSkip).toHaveLength(0)
    expect(result.toRemove).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('should mark as toCopy when skill is not in stored available at all', async () => {
    const { computeDiff } = await import('./sync.js')

    const discovered: Skill[] = [{ path: 'foo/bar' as SkillPath, hash: 'abc123' as SkillHash }]

    const result = await Effect.runPromise(
      computeDiff(root, upstreamKey, [['foo/bar' as SkillPath, 'bar' as OutputName]], discovered, { available: {} }).pipe(
        Effect.provideService(SkillHashService, mockSkillHashService()),
      ),
    )

    expect(result.toCopy).toHaveLength(1)
    expect(result.toSkip).toHaveLength(0)
  })

  it('should mark as toSkip when stored hash matches upstream and target dir hash matches', async () => {
    const { computeDiff } = await import('./sync.js')

    const discovered: Skill[] = [{ path: 'foo/bar' as SkillPath, hash: 'abc123' as SkillHash }]
    const available: Record<SkillPath, SkillHash> = { ['foo/bar' as SkillPath]: 'abc123' as SkillHash }

    const result = await Effect.runPromise(
      computeDiff(root, upstreamKey, [['foo/bar' as SkillPath, 'bar' as OutputName]], discovered, { available }).pipe(
        Effect.provideService(SkillHashService, mockSkillHashService('abc123' as SkillHash)),
      ),
    )

    expect(result.toSkip).toEqual([{ skillPath: 'foo/bar' as SkillPath, outputName: 'bar' as OutputName }])
    expect(result.toCopy).toHaveLength(0)
    expect(result.toRemove).toHaveLength(0)
  })

  it('should mark as toCopy when stored hash matches upstream but target dir hash differs', async () => {
    const { computeDiff } = await import('./sync.js')

    const discovered: Skill[] = [{ path: 'foo/bar' as SkillPath, hash: 'abc123' as SkillHash }]
    const available: Record<SkillPath, SkillHash> = { ['foo/bar' as SkillPath]: 'abc123' as SkillHash }

    const result = await Effect.runPromise(
      computeDiff(root, upstreamKey, [['foo/bar' as SkillPath, 'bar' as OutputName]], discovered, { available }).pipe(
        Effect.provideService(SkillHashService, mockSkillHashService('def456' as SkillHash)),
      ),
    )

    expect(result.toCopy).toHaveLength(1)
    expect(result.toSkip).toHaveLength(0)
  })

  it('should mark as toCopy when stored hash matches upstream but target dir is missing', async () => {
    const { computeDiff } = await import('./sync.js')

    const discovered: Skill[] = [{ path: 'foo/bar' as SkillPath, hash: 'abc123' as SkillHash }]
    const available: Record<SkillPath, SkillHash> = { ['foo/bar' as SkillPath]: 'abc123' as SkillHash }

    const result = await Effect.runPromise(
      computeDiff(root, upstreamKey, [['foo/bar' as SkillPath, 'bar' as OutputName]], discovered, { available }).pipe(
        Effect.provideService(SkillHashService, mockSkillHashService()),
      ),
    )

    expect(result.toCopy).toHaveLength(1)
    expect(result.toSkip).toHaveLength(0)
  })

  it('should handle mixed scenarios with multiple entries', async () => {
    const { computeDiff } = await import('./sync.js')

    const discovered: Skill[] = [
      { path: 'skills/a' as SkillPath, hash: 'hash-a' as SkillHash },
      { path: 'skills/b' as SkillPath, hash: 'hash-b' as SkillHash },
      { path: 'skills/c' as SkillPath, hash: 'hash-c' as SkillHash },
    ]
    const available: Record<SkillPath, SkillHash> = { ['skills/a' as SkillPath]: 'hash-a' as SkillHash, ['skills/b' as SkillPath]: 'stale-hash' as SkillHash }

    const selected: Array<[SkillPath, OutputName]> = [
      ['skills/a' as SkillPath, 'a' as OutputName],
      ['skills/b' as SkillPath, 'b' as OutputName],
      ['skills/c' as SkillPath, 'c' as OutputName],
      ['skills/d' as SkillPath, 'd' as OutputName],
    ]

    const result = await Effect.runPromise(
      computeDiff(root, upstreamKey, selected, discovered, { available }).pipe(
        Effect.provideService(SkillHashService, mockSkillHashService('hash-a' as SkillHash)),
      ),
    )

    expect(result.toSkip).toEqual([{ skillPath: 'skills/a' as SkillPath, outputName: 'a' as OutputName }])
    expect(result.toCopy).toHaveLength(2)
    const copyPaths = result.toCopy.map(entry => entry.skillPath)
    expect(copyPaths).toEqual(['skills/b' as SkillPath, 'skills/c' as SkillPath])
    expect(result.toRemove).toEqual([{ skillPath: 'skills/d' as SkillPath, outputName: 'd' as OutputName }])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('skills/d')
  })
})

describe('sync e2e with real repo', () => {
  let temporaryDirectory: string

  beforeEach(async () => {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'sync-e2e-'))
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

  it('should clone a real upstream and copy a selected skill', async () => {
    await addSubmoduleFixture(temporaryDirectory, 'mattpocock')

    const metaPath = path.join(temporaryDirectory, 'meta.json')
    await fs.writeFile(
      metaPath,
      JSON.stringify({
        upstreams: {
          mattpocock: {
            url: MATT_POCOCK_URL,
            skills: { [KNOW_SKILL_PATH]: KNOW_SKILL_OUTPUT },
            available: {},
          },
        },
      }),
    )

    const { sync } = await import('./sync.js')
    const result = await Effect.runPromise(
      sync({ root: temporaryDirectory }).pipe(
        Effect.provide(MetaFileService.Default),
        Effect.provide(SkillDiscoveryService.Default),
        Effect.provide(SkillHashService.Default),
        Effect.provide(SkillCloningService.Default),
        Effect.provideService(LogService, createMockLogService()),
        Effect.provide(GitService.Default),
      ),
    )

    expect(result.upstreams).toHaveLength(1)
    expect(result.upstreams[0]?.upstreamKey).toBe('mattpocock')
    expect(result.upstreams[0]?.skillsCopied).toBe(1)

    const skillFile = path.join(temporaryDirectory, 'synced', KNOW_SKILL_OUTPUT, 'SKILL.md')
    const content = await fs.readFile(skillFile, 'utf8')
    expect(content).toContain('#')
    expect(content.toLowerCase()).toContain('tdd')
  }, 60_000)

  it('should skip copy on second sync when skill is unchanged', async () => {
    await addSubmoduleFixture(temporaryDirectory, 'mattpocock')

    const metaPath = path.join(temporaryDirectory, 'meta.json')
    await fs.writeFile(
      metaPath,
      JSON.stringify({
        upstreams: {
          mattpocock: {
            url: MATT_POCOCK_URL,
            skills: { [KNOW_SKILL_PATH]: KNOW_SKILL_OUTPUT },
            available: {},
          },
        },
      }),
    )

    const { sync } = await import('./sync.js')

    await Effect.runPromise(
      sync({ root: temporaryDirectory }).pipe(
        Effect.provide(MetaFileService.Default),
        Effect.provide(SkillDiscoveryService.Default),
        Effect.provide(SkillHashService.Default),
        Effect.provide(SkillCloningService.Default),
        Effect.provideService(LogService, createMockLogService()),
        Effect.provide(GitService.Default),
      ),
    )

    const result = await Effect.runPromise(
      sync({ root: temporaryDirectory }).pipe(
        Effect.provide(MetaFileService.Default),
        Effect.provide(SkillDiscoveryService.Default),
        Effect.provide(SkillHashService.Default),
        Effect.provide(SkillCloningService.Default),
        Effect.provideService(LogService, createMockLogService()),
        Effect.provide(GitService.Default),
      ),
    )

    expect(result.upstreams[0]?.skillsCopied).toBe(0)
    expect(result.upstreams[0]?.skillsSkipped).toBe(1)
  }, 90_000)

  it('should re-copy when stored hash differs from upstream', async () => {
    await addSubmoduleFixture(temporaryDirectory, 'mattpocock')

    const metaPath = path.join(temporaryDirectory, 'meta.json')
    await fs.writeFile(
      metaPath,
      JSON.stringify({
        upstreams: {
          mattpocock: {
            url: MATT_POCOCK_URL,
            skills: { [KNOW_SKILL_PATH]: KNOW_SKILL_OUTPUT },
            available: {},
          },
        },
      }),
    )

    const { sync } = await import('./sync.js')

    await Effect.runPromise(
      sync({ root: temporaryDirectory }).pipe(
        Effect.provide(MetaFileService.Default),
        Effect.provide(SkillDiscoveryService.Default),
        Effect.provide(SkillHashService.Default),
        Effect.provide(SkillCloningService.Default),
        Effect.provideService(LogService, createMockLogService()),
        Effect.provide(GitService.Default),
      ),
    )

    const staleFile = path.join(temporaryDirectory, 'synced', KNOW_SKILL_OUTPUT, 'stale.txt')
    await fs.writeFile(staleFile, 'stale')

    const metaContent = JSON.parse(await fs.readFile(metaPath, 'utf8')) as MetaJson
    metaContent.upstreams.mattpocock!.available[KNOW_SKILL_PATH as SkillPath] = 'tampered-hash' as SkillHash
    await fs.writeFile(metaPath, JSON.stringify(metaContent, undefined, 2))

    const result = await Effect.runPromise(
      sync({ root: temporaryDirectory }).pipe(
        Effect.provide(MetaFileService.Default),
        Effect.provide(SkillDiscoveryService.Default),
        Effect.provide(SkillHashService.Default),
        Effect.provide(SkillCloningService.Default),
        Effect.provideService(LogService, createMockLogService()),
        Effect.provide(GitService.Default),
      ),
    )

    expect(result.upstreams[0]?.skillsCopied).toBe(1)

    const staleExists = await fs.stat(staleFile).then(() => true).catch(() => false)
    expect(staleExists).toBe(false)

    const freshContent = await fs.readFile(
      path.join(temporaryDirectory, 'synced', KNOW_SKILL_OUTPUT, 'SKILL.md'),
      'utf8',
    )
    expect(freshContent).toContain('#')
  }, 90_000)

  it('should warn and remove a selected skill that no longer exists in upstream, and update meta.json', async () => {
    await addSubmoduleFixture(temporaryDirectory, 'mattpocock')

    const metaPath = path.join(temporaryDirectory, 'meta.json')
    await fs.writeFile(
      metaPath,
      JSON.stringify({
        upstreams: {
          mattpocock: {
            url: MATT_POCOCK_URL,
            skills: { 'nonexistent/skill': 'nope' },
            available: {},
          },
        },
      }),
    )

    const staleDirectory = path.join(temporaryDirectory, 'synced', 'nope')
    await fs.mkdir(staleDirectory, { recursive: true })
    await fs.writeFile(path.join(staleDirectory, 'SKILL.md'), '# Stale')

    const { sync } = await import('./sync.js')
    const result = await Effect.runPromise(
      sync({ root: temporaryDirectory }).pipe(
        Effect.provide(MetaFileService.Default),
        Effect.provide(SkillDiscoveryService.Default),
        Effect.provide(SkillHashService.Default),
        Effect.provide(SkillCloningService.Default),
        Effect.provideService(LogService, createMockLogService()),
        Effect.provide(GitService.Default),
      ),
    )

    expect(result.upstreams[0]?.skillsRemoved).toBe(1)
    expect(result.upstreams[0]?.warnings.length).toBeGreaterThanOrEqual(1)

    const staleExists = await fs.stat(staleDirectory).then(() => true).catch(() => false)
    expect(staleExists).toBe(false)

    const updatedMeta = JSON.parse(await fs.readFile(metaPath, 'utf8')) as MetaJson
    const skills = updatedMeta.upstreams.mattpocock!.skills
    expect(skills['nonexistent/skill' as SkillPath]).toBeUndefined()
    expect(Object.keys(skills)).toHaveLength(0)
  }, 60_000)

  it('should auto-detect and persist branch when upstream has none configured', async () => {
    await addSubmoduleFixture(temporaryDirectory, 'mattpocock')

    const metaPath = path.join(temporaryDirectory, 'meta.json')
    await fs.writeFile(
      metaPath,
      JSON.stringify({
        upstreams: {
          mattpocock: {
            url: MATT_POCOCK_URL,
            skills: {},
            available: {},
          },
        },
      }),
    )

    const { sync } = await import('./sync.js')
    await Effect.runPromise(
      sync({ root: temporaryDirectory }).pipe(
        Effect.provide(MetaFileService.Default),
        Effect.provide(SkillDiscoveryService.Default),
        Effect.provide(SkillHashService.Default),
        Effect.provide(SkillCloningService.Default),
        Effect.provideService(LogService, createMockLogService()),
        Effect.provide(GitService.Default),
      ),
    )

    const updatedMeta = JSON.parse(await fs.readFile(metaPath, 'utf8')) as MetaJson
    expect(updatedMeta.upstreams.mattpocock?.branch).toBeDefined()
    expect(updatedMeta.upstreams.mattpocock?.branch?.length).toBeGreaterThan(0)
  }, 60_000)

  it('should update submodule and available for reference-only upstream (no selected skills)', async () => {
    await addSubmoduleFixture(temporaryDirectory, 'mattpocock')

    const metaPath = path.join(temporaryDirectory, 'meta.json')
    await fs.writeFile(
      metaPath,
      JSON.stringify({
        upstreams: {
          mattpocock: {
            url: MATT_POCOCK_URL,
            skills: {},
            available: {},
          },
        },
      }),
    )

    const { sync } = await import('./sync.js')
    const result = await Effect.runPromise(
      sync({ root: temporaryDirectory }).pipe(
        Effect.provide(MetaFileService.Default),
        Effect.provide(SkillDiscoveryService.Default),
        Effect.provide(SkillHashService.Default),
        Effect.provide(SkillCloningService.Default),
        Effect.provideService(LogService, createMockLogService()),
        Effect.provide(GitService.Default),
      ),
    )

    expect(result.upstreams).toHaveLength(1)
    expect(result.upstreams[0]?.upstreamKey).toBe('mattpocock')
    expect(result.upstreams[0]?.skillsCopied).toBe(0)

    const updatedMeta = JSON.parse(await fs.readFile(metaPath, 'utf8')) as MetaJson
    const available = updatedMeta.upstreams.mattpocock!.available
    expect(Object.keys(available).length).toBeGreaterThan(0)
  }, 60_000)

  it('should sync multiple selected skills from the same upstream', async () => {
    await addSubmoduleFixture(temporaryDirectory, 'mattpocock')

    const metaPath = path.join(temporaryDirectory, 'meta.json')
    await fs.writeFile(
      metaPath,
      JSON.stringify({
        upstreams: {
          mattpocock: {
            url: MATT_POCOCK_URL,
            skills: {
              'skills/engineering/tdd': 'tdd',
              'skills/productivity/caveman': 'caveman',
            },
            available: {},
          },
        },
      }),
    )

    const { sync } = await import('./sync.js')
    const result = await Effect.runPromise(
      sync({ root: temporaryDirectory }).pipe(
        Effect.provide(MetaFileService.Default),
        Effect.provide(SkillDiscoveryService.Default),
        Effect.provide(SkillHashService.Default),
        Effect.provide(SkillCloningService.Default),
        Effect.provideService(LogService, createMockLogService()),
        Effect.provide(GitService.Default),
      ),
    )

    expect(result.upstreams[0]?.skillsCopied).toBe(2)

    const tddExists = await fs.stat(
      path.join(temporaryDirectory, 'synced', 'tdd', 'SKILL.md'),
    ).then(() => true).catch(() => false)
    expect(tddExists).toBe(true)

    const cavemanExists = await fs.stat(
      path.join(temporaryDirectory, 'synced', 'caveman', 'SKILL.md'),
    ).then(() => true).catch(() => false)
    expect(cavemanExists).toBe(true)
  }, 60_000)

  it('should re-copy when target skill directory is deleted after initial sync', async () => {
    await addSubmoduleFixture(temporaryDirectory, 'mattpocock')

    const metaPath = path.join(temporaryDirectory, 'meta.json')
    await fs.writeFile(
      metaPath,
      JSON.stringify({
        upstreams: {
          mattpocock: {
            url: MATT_POCOCK_URL,
            skills: { [KNOW_SKILL_PATH]: KNOW_SKILL_OUTPUT },
            available: {},
          },
        },
      }),
    )

    const { sync } = await import('./sync.js')

    await Effect.runPromise(
      sync({ root: temporaryDirectory }).pipe(
        Effect.provide(MetaFileService.Default),
        Effect.provide(SkillDiscoveryService.Default),
        Effect.provide(SkillHashService.Default),
        Effect.provide(SkillCloningService.Default),
        Effect.provideService(LogService, createMockLogService()),
        Effect.provide(GitService.Default),
      ),
    )

    await fs.rm(
      path.join(temporaryDirectory, 'synced', KNOW_SKILL_OUTPUT),
      { recursive: true, force: true },
    )

    const result = await Effect.runPromise(
      sync({ root: temporaryDirectory }).pipe(
        Effect.provide(MetaFileService.Default),
        Effect.provide(SkillDiscoveryService.Default),
        Effect.provide(SkillHashService.Default),
        Effect.provide(SkillCloningService.Default),
        Effect.provideService(LogService, createMockLogService()),
        Effect.provide(GitService.Default),
      ),
    )

    expect(result.upstreams[0]?.skillsCopied).toBe(1)

    const skillFile = path.join(temporaryDirectory, 'synced', KNOW_SKILL_OUTPUT, 'SKILL.md')
    const content = await fs.readFile(skillFile, 'utf8')
    expect(content).toContain('#')
  }, 90_000)

  it('should re-copy when target skill directory is emptied after initial sync', async () => {
    await addSubmoduleFixture(temporaryDirectory, 'mattpocock')

    const metaPath = path.join(temporaryDirectory, 'meta.json')
    await fs.writeFile(
      metaPath,
      JSON.stringify({
        upstreams: {
          mattpocock: {
            url: MATT_POCOCK_URL,
            skills: { [KNOW_SKILL_PATH]: KNOW_SKILL_OUTPUT },
            available: {},
          },
        },
      }),
    )

    const { sync } = await import('./sync.js')

    await Effect.runPromise(
      sync({ root: temporaryDirectory }).pipe(
        Effect.provide(MetaFileService.Default),
        Effect.provide(SkillDiscoveryService.Default),
        Effect.provide(SkillHashService.Default),
        Effect.provide(SkillCloningService.Default),
        Effect.provideService(LogService, createMockLogService()),
        Effect.provide(GitService.Default),
      ),
    )

    const skillTargetDirectory = path.join(temporaryDirectory, 'synced', KNOW_SKILL_OUTPUT)
    const entries = await fs.readdir(skillTargetDirectory)
    await Promise.all(
      entries.map(async (entry) => {
        await fs.rm(path.join(skillTargetDirectory, entry), { recursive: true, force: true })
      }),
    )

    const result = await Effect.runPromise(
      sync({ root: temporaryDirectory }).pipe(
        Effect.provide(MetaFileService.Default),
        Effect.provide(SkillDiscoveryService.Default),
        Effect.provide(SkillHashService.Default),
        Effect.provide(SkillCloningService.Default),
        Effect.provideService(LogService, createMockLogService()),
        Effect.provide(GitService.Default),
      ),
    )

    expect(result.upstreams[0]?.skillsCopied).toBe(1)

    const skillFile = path.join(temporaryDirectory, 'synced', KNOW_SKILL_OUTPUT, 'SKILL.md')
    const content = await fs.readFile(skillFile, 'utf8')
    expect(content).toContain('#')
  }, 90_000)

  it('should re-copy when files are removed from target skill directory after initial sync', async () => {
    await addSubmoduleFixture(temporaryDirectory, 'mattpocock')

    const metaPath = path.join(temporaryDirectory, 'meta.json')
    await fs.writeFile(
      metaPath,
      JSON.stringify({
        upstreams: {
          mattpocock: {
            url: MATT_POCOCK_URL,
            skills: { [KNOW_SKILL_PATH]: KNOW_SKILL_OUTPUT },
            available: {},
          },
        },
      }),
    )

    const { sync } = await import('./sync.js')

    await Effect.runPromise(
      sync({ root: temporaryDirectory }).pipe(
        Effect.provide(MetaFileService.Default),
        Effect.provide(SkillDiscoveryService.Default),
        Effect.provide(SkillHashService.Default),
        Effect.provide(SkillCloningService.Default),
        Effect.provideService(LogService, createMockLogService()),
        Effect.provide(GitService.Default),
      ),
    )

    const skillFile = path.join(temporaryDirectory, 'synced', KNOW_SKILL_OUTPUT, 'SKILL.md')
    await fs.rm(skillFile)

    const result = await Effect.runPromise(
      sync({ root: temporaryDirectory }).pipe(
        Effect.provide(MetaFileService.Default),
        Effect.provide(SkillDiscoveryService.Default),
        Effect.provide(SkillHashService.Default),
        Effect.provide(SkillCloningService.Default),
        Effect.provideService(LogService, createMockLogService()),
        Effect.provide(GitService.Default),
      ),
    )

    expect(result.upstreams[0]?.skillsCopied).toBe(1)

    const restoredContent = await fs.readFile(skillFile, 'utf8')
    expect(restoredContent).toContain('#')
  }, 90_000)

  it('should handle upstreams with missing skills/available fields gracefully', async () => {
    const metaPath = path.join(temporaryDirectory, 'meta.json')
    await fs.writeFile(
      metaPath,
      JSON.stringify({
        upstreams: {
          'no-skills-field': {
            url: MATT_POCOCK_URL,
          },
        },
      }),
    )

    await addSubmoduleFixture(temporaryDirectory, 'mattpocock')
    const upstreamDirectory = path.join(temporaryDirectory, 'upstream', 'no-skills-field')
    await fs.rename(
      path.join(temporaryDirectory, 'upstream', 'mattpocock'),
      upstreamDirectory,
    )

    const { sync } = await import('./sync.js')
    const result = await Effect.runPromise(
      sync({ root: temporaryDirectory }).pipe(
        Effect.provide(MetaFileService.Default),
        Effect.provide(SkillDiscoveryService.Default),
        Effect.provide(SkillHashService.Default),
        Effect.provide(SkillCloningService.Default),
        Effect.provideService(LogService, createMockLogService()),
        Effect.provide(GitService.Default),
      ),
    )

    expect(result.upstreams).toHaveLength(1)
    expect(result.upstreams[0]?.skillsCopied).toBe(0)
    expect(result.upstreams[0]?.skillsRemoved).toBe(0)

    const updatedMeta = JSON.parse(await fs.readFile(metaPath, 'utf8')) as MetaJson
    expect(updatedMeta.upstreams['no-skills-field']?.skills).toEqual({})
    expect(updatedMeta.upstreams['no-skills-field']?.available).toBeDefined()
  }, 60_000)
})
