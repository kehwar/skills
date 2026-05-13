import type { UpstreamAddInput } from './upstream.js'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'
import { Effect } from 'effect'
import { simpleGit } from 'simple-git'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createMockLogService,
  createMockUserPromptService,
  GitService,
  LogService,
  MetaFileService,
  SkillDiscoveryService,
  SkillHashService,
  UserPromptService,
} from './services/index.js'
import { parseGitHubUrl, resolveUpstreamKey, upstreamAdd, UpstreamConflict } from './upstream.js'

describe('parseGitHubUrl', () => {
  it('should parse https URLs', () => {
    const result = parseGitHubUrl('https://github.com/antfu/auto')
    expect(result).toEqual({ owner: 'antfu', repo: 'auto', normalizedUrl: 'https://github.com/antfu/auto' })
  })

  it('should parse SSH URLs and normalize to https', () => {
    const result = parseGitHubUrl('git@github.com:antfu/auto.git')
    expect(result).toEqual({ owner: 'antfu', repo: 'auto', normalizedUrl: 'https://github.com/antfu/auto' })
  })

  it('should parse plain github.com URLs and normalize to https', () => {
    const result = parseGitHubUrl('github.com/effect/effect')
    expect(result).toEqual({ owner: 'effect', repo: 'effect', normalizedUrl: 'https://github.com/effect/effect' })
  })

  it('should return null for non-GitHub URLs', () => {
    const result = parseGitHubUrl('https://gitlab.com/owner/repo')
    expect(result).toBeUndefined()
  })
})

describe('resolveUpstreamKey', () => {
  it('should use repo name by default and prompt for alternatives', () => {
    const parsed = parseGitHubUrl('https://github.com/antfu/auto')!
    const result = resolveUpstreamKey(parsed)
    expect(result.default).toBe('auto')
    expect(result.alternatives).toHaveLength(1)
    expect(result.alternatives[0]).toBe('antfu')
    expect(result.needsUserInput).toBe(true)
  })

  it('should use author name when repo is "skills" and prompt for alternative', () => {
    const parsed = parseGitHubUrl('https://github.com/vercel-labs/skills')!
    const result = resolveUpstreamKey(parsed)
    expect(result.default).toBe('vercel-labs')
    expect(result.alternatives).toContain('skills')
    expect(result.needsUserInput).toBe(true)
  })

  it('should normalize hyphens and lowercase names, prompting for choice', () => {
    const parsed = parseGitHubUrl('https://github.com/My-Org/My-Repo')!
    const result = resolveUpstreamKey(parsed)
    expect(result.default).toBe('my-repo')
    expect(result.alternatives).toContain('my-org')
    expect(result.needsUserInput).toBe(true)
  })

  it('should not prompt when owner and repo normalize to same name', () => {
    const parsed = parseGitHubUrl('https://github.com/effect/effect')!
    const result = resolveUpstreamKey(parsed)
    expect(result.default).toBe('effect')
    expect(result.alternatives).toHaveLength(0)
    expect(result.needsUserInput).toBe(false)
  })

  it('should handle null input gracefully', () => {
    const nullInput = undefined
    const result = resolveUpstreamKey(nullInput)
    expect(result.default).toBeDefined()
    expect(result.alternatives).toEqual([])
    expect(result.needsUserInput).toBe(false)
  })

  it('should work with raw owner/repo without normalizedUrl', () => {
    const result = resolveUpstreamKey({ owner: 'antfu', repo: 'auto' })
    expect(result.default).toBe('auto')
    expect(result.alternatives).toContain('antfu')
    expect(result.needsUserInput).toBe(true)
  })
})

describe('upstream-add', () => {
  let temporaryDirectory: string

  beforeEach(async () => {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'upstream-add-test-'))
    // Initialize as a git repository so submodule operations work
    try {
      const git = simpleGit(temporaryDirectory)
      await git.init()
      await git.raw(['config', 'user.email', 'test@example.com'])
      await git.raw(['config', 'user.name', 'Test User'])
    }
    catch {
      // Git init might fail in some test environments, but we'll continue
    }
  })

  afterEach(async () => {
    await fs.rm(temporaryDirectory, { recursive: true, force: true })
  })

  describe('e2E: add upstream from URL', () => {
    it('should add a new upstream, discover skills, hash them, and update meta.json', async () => {
      const upstreamDirectory = path.join(temporaryDirectory, 'upstream', 'test-upstream')
      await fs.mkdir(upstreamDirectory, { recursive: true })

      const skillDirectory1 = path.join(upstreamDirectory, 'skill-one')
      await fs.mkdir(skillDirectory1)
      await fs.writeFile(path.join(skillDirectory1, 'SKILL.md'), '# Skill One\n\nDescription of skill one')

      const skillDirectory2 = path.join(upstreamDirectory, 'skill-two')
      await fs.mkdir(skillDirectory2)
      await fs.writeFile(path.join(skillDirectory2, 'SKILL.md'), '# Skill Two\n\nDescription of skill two')

      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(
        metaJsonPath,
        JSON.stringify(
          {
            upstreams: {},
          },
          undefined,
          2,
        ),
      )

      const input: UpstreamAddInput = {
        root: temporaryDirectory,
        upstreamKey: 'test-upstream',
        url: 'https://github.com/test/skills',
        selectedSkills: {
          'skill-one': 'test-skill-one',
          'skill-two': 'test-skill-two',
        },
      }

      const result = await Effect.runPromise(
        upstreamAdd(input).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      const updatedMeta = JSON.parse(
        await fs.readFile(metaJsonPath, 'utf8'),
      ) as Record<string, unknown>

      expect(updatedMeta.upstreams).toBeDefined()
      const upstreams = updatedMeta.upstreams as Record<string, Record<string, unknown>>
      expect(upstreams['test-upstream']).toBeDefined()
      expect(upstreams['test-upstream']?.url).toBe('https://github.com/test/skills')
      expect(upstreams['test-upstream']?.skills).toEqual({
        'skill-one': 'test-skill-one',
        'skill-two': 'test-skill-two',
      })

      expect(upstreams['test-upstream']?.available).toBeDefined()
      const available = upstreams['test-upstream']?.available as Record<string, unknown> | undefined
      expect(available?.['skill-one']).toBeDefined()
      expect(available?.['skill-two']).toBeDefined()

      expect(result.isNew).toBe(true)
      expect(result.upstreamKey).toBe('test-upstream')
      expect(result.discoveredSkills).toHaveLength(2)
      expect(result.discoveredSkills[0]).toHaveProperty('path')
      expect(result.discoveredSkills[0]).toHaveProperty('hash')
    })

    it('should be idempotent: running twice with same URL updates metadata', async () => {
      const upstreamDirectory = path.join(temporaryDirectory, 'upstream', 'idempotent-test')
      await fs.mkdir(upstreamDirectory, { recursive: true })

      const skillDirectory = path.join(upstreamDirectory, 'skill-one')
      await fs.mkdir(skillDirectory)
      await fs.writeFile(path.join(skillDirectory, 'SKILL.md'), '# Skill One\n\nVersion 1')

      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(
        metaJsonPath,
        JSON.stringify({ upstreams: {} }, undefined, 2),
      )

      const input: UpstreamAddInput = {
        root: temporaryDirectory,
        upstreamKey: 'idempotent-test',
        url: 'https://github.com/test/skills',
        selectedSkills: { 'skill-one': 'skill-one' },
      }

      const result1 = await Effect.runPromise(
        upstreamAdd(input).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      const result2 = await Effect.runPromise(
        upstreamAdd(input).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      expect(result1.isNew).toBe(true)
      expect(result2.isNew).toBe(false)

      const finalMeta = JSON.parse(await fs.readFile(metaJsonPath, 'utf8')) as Record<string, unknown>
      const upstreamsIdem = finalMeta.upstreams as Record<string, Record<string, unknown>>
      expect(upstreamsIdem['idempotent-test']).toBeDefined()
      expect(upstreamsIdem['idempotent-test']?.url).toBe('https://github.com/test/skills')
    })

    it('should update selected skills when re-run with different selection', async () => {
      const upstreamDirectory = path.join(temporaryDirectory, 'upstream', 'update-test')
      await fs.mkdir(upstreamDirectory, { recursive: true })

      for (let index = 1; index <= 2; index++) {
        const skillDirectory = path.join(upstreamDirectory, `skill-${index}`)
        await fs.mkdir(skillDirectory)
        await fs.writeFile(path.join(skillDirectory, 'SKILL.md'), `# Skill ${index}`)
      }

      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(metaJsonPath, JSON.stringify({ upstreams: {} }, undefined, 2))

      await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          upstreamKey: 'update-test',
          url: 'https://github.com/test/skills',
          selectedSkills: { 'skill-1': 'skill-1' },
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          upstreamKey: 'update-test',
          url: 'https://github.com/test/skills',
          selectedSkills: { 'skill-1': 'skill-1', 'skill-2': 'skill-2' },
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      const finalMetaUpdate = JSON.parse(await fs.readFile(metaJsonPath, 'utf8')) as Record<string, unknown>
      const upstreamsUpdate = finalMetaUpdate.upstreams as Record<string, unknown>
      const updateTestUp = upstreamsUpdate['update-test'] as Record<string, Record<string, unknown>>
      const skillsRec = updateTestUp?.skills
      expect(Object.keys(skillsRec ?? {})).toHaveLength(2)
      expect(skillsRec?.['skill-2']).toBe('skill-2')
    })

    it('should normalize different GitHub URL formats to https', async () => {
      const upstreamDirectory = path.join(temporaryDirectory, 'upstream', 'ssh-format')
      await fs.mkdir(upstreamDirectory, { recursive: true })

      const skillDirectory = path.join(upstreamDirectory, 'skill-one')
      await fs.mkdir(skillDirectory)
      await fs.writeFile(path.join(skillDirectory, 'SKILL.md'), '# Skill One')

      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(metaJsonPath, JSON.stringify({ upstreams: {} }, undefined, 2))

      const resultSSH = await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          upstreamKey: 'ssh-format',
          url: 'git@github.com:test/skills.git',
          selectedSkills: { 'skill-one': 'skill-one' },
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      const metaAfterSSH = JSON.parse(await fs.readFile(metaJsonPath, 'utf8')) as Record<string, unknown>
      const upstreamsSSH = metaAfterSSH.upstreams as Record<string, Record<string, unknown>>
      expect(upstreamsSSH['ssh-format']?.url).toBe('https://github.com/test/skills')
      expect(resultSSH.isNew).toBe(true)
    })

    it('should compute consistent hashes for skill content', async () => {
      const upstreamDirectory = path.join(temporaryDirectory, 'upstream', 'hash-test')
      await fs.mkdir(upstreamDirectory, { recursive: true })

      const skillDirectory = path.join(upstreamDirectory, 'skill-one')
      await fs.mkdir(skillDirectory)
      const skillContent = '# Skill One\n\nDescription with specific content\n'
      await fs.writeFile(path.join(skillDirectory, 'SKILL.md'), skillContent)

      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(metaJsonPath, JSON.stringify({ upstreams: {} }, undefined, 2))

      const result1 = await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          upstreamKey: 'hash-test',
          url: 'https://github.com/test/skills',
          selectedSkills: { 'skill-one': 'skill-one' },
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      const hash1 = result1.discoveredSkills[0]?.hash

      const result2 = await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          upstreamKey: 'hash-test',
          url: 'https://github.com/test/skills',
          selectedSkills: { 'skill-one': 'skill-one' },
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      const hash2 = result2.discoveredSkills[0]?.hash

      expect(hash1).toBe(hash2)
      expect(hash1).toMatch(/^[a-f0-9]{64}$/) // SHA256 hex
    })

    it('should discover skills in nested directories', async () => {
      const upstreamDirectory = path.join(temporaryDirectory, 'upstream', 'nested-test')
      await fs.mkdir(upstreamDirectory, { recursive: true })

      const skill1Directory = path.join(upstreamDirectory, 'skill-one')
      await fs.mkdir(skill1Directory)
      await fs.writeFile(path.join(skill1Directory, 'SKILL.md'), '# Skill One')

      const nestedDirectory = path.join(upstreamDirectory, 'subdir', 'skill-two')
      await fs.mkdir(nestedDirectory, { recursive: true })
      await fs.writeFile(path.join(nestedDirectory, 'SKILL.md'), '# Skill Two')

      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(metaJsonPath, JSON.stringify({ upstreams: {} }, undefined, 2))

      const result = await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          upstreamKey: 'nested-test',
          url: 'https://github.com/test/skills',
          selectedSkills: { 'skill-one': 'skill-one', 'subdir/skill-two': 'skill-two' },
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      expect(result.discoveredSkills).toHaveLength(2)
      const paths = result.discoveredSkills.map(s => s.path).toSorted((a, b) => a.localeCompare(b))
      expect(paths).toContain('skill-one')
      expect(paths).toContain('subdir/skill-two')

      const meta = JSON.parse(await fs.readFile(metaJsonPath, 'utf8')) as Record<string, unknown>
      const upstreams = meta.upstreams as Record<string, Record<string, unknown>>
      const available = upstreams['nested-test']?.available as Record<string, unknown>
      expect(Object.keys(available)).toHaveLength(2)
    })

    it('should reject adding upstream with same key but different URL', async () => {
      const upstreamDirectory1 = path.join(temporaryDirectory, 'upstream', 'collision')
      await fs.mkdir(upstreamDirectory1, { recursive: true })
      await fs.mkdir(path.join(upstreamDirectory1, 'skill-one'), { recursive: true })
      await fs.writeFile(path.join(upstreamDirectory1, 'skill-one', 'SKILL.md'), '# Skill')

      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(
        metaJsonPath,
        JSON.stringify({
          upstreams: {
            collision: {
              url: 'https://github.com/original/skills',
              skills: {},
              available: {},
            },
          },
        }, undefined, 2),
      )

      const result = await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          upstreamKey: 'collision',
          url: 'https://github.com/different/skills',
          selectedSkills: {},
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
          Effect.catchTag('UpstreamConflict', error => Effect.succeed(error)),
        ),
      )

      expect(result).toBeInstanceOf(UpstreamConflict)
    })

    it('should allow same URL under multiple different upstream keys', async () => {
      const upstream1Directory = path.join(temporaryDirectory, 'upstream', 'antfu-original')
      await fs.mkdir(upstream1Directory, { recursive: true })
      await fs.mkdir(path.join(upstream1Directory, 'skill-a'), { recursive: true })
      await fs.writeFile(path.join(upstream1Directory, 'skill-a', 'SKILL.md'), '# Skill A')

      const upstream2Directory = path.join(temporaryDirectory, 'upstream', 'antfu-alias')
      await fs.mkdir(upstream2Directory, { recursive: true })
      await fs.mkdir(path.join(upstream2Directory, 'skill-a'), { recursive: true })
      await fs.writeFile(path.join(upstream2Directory, 'skill-a', 'SKILL.md'), '# Skill A')

      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(metaJsonPath, JSON.stringify({ upstreams: {} }, undefined, 2))

      const sameUrl = 'https://github.com/antfu/skills'

      await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          upstreamKey: 'antfu-original',
          url: sameUrl,
          selectedSkills: { 'skill-a': 'skill-a' },
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      const result2 = await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          upstreamKey: 'antfu-alias',
          url: sameUrl,
          selectedSkills: { 'skill-a': 'skill-a' },
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      const meta = JSON.parse(await fs.readFile(metaJsonPath, 'utf8')) as Record<string, unknown>
      const upstreams = meta.upstreams as Record<string, Record<string, unknown>>
      expect(Object.keys(upstreams)).toHaveLength(2)
      expect(upstreams['antfu-original']?.url).toBe(sameUrl)
      expect(upstreams['antfu-alias']?.url).toBe(sameUrl)
      expect(result2.isNew).toBe(true)
    })

    it('should support multiple upstreams in same meta.json', async () => {
      const upstream1Directory = path.join(temporaryDirectory, 'upstream', 'upstream-one')
      await fs.mkdir(upstream1Directory, { recursive: true })
      await fs.mkdir(path.join(upstream1Directory, 'skill-a'), { recursive: true })
      await fs.writeFile(path.join(upstream1Directory, 'skill-a', 'SKILL.md'), '# Skill A')

      const upstream2Directory = path.join(temporaryDirectory, 'upstream', 'upstream-two')
      await fs.mkdir(upstream2Directory, { recursive: true })
      await fs.mkdir(path.join(upstream2Directory, 'skill-b'), { recursive: true })
      await fs.writeFile(path.join(upstream2Directory, 'skill-b', 'SKILL.md'), '# Skill B')

      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(metaJsonPath, JSON.stringify({ upstreams: {} }, undefined, 2))

      await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          upstreamKey: 'upstream-one',
          url: 'https://github.com/org/skills-one',
          selectedSkills: { 'skill-a': 'skill-a' },
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          upstreamKey: 'upstream-two',
          url: 'https://github.com/org/skills-two',
          selectedSkills: { 'skill-b': 'skill-b' },
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      const meta = JSON.parse(await fs.readFile(metaJsonPath, 'utf8')) as Record<string, unknown>
      const upstreams = meta.upstreams as Record<string, Record<string, unknown>>
      expect(Object.keys(upstreams)).toHaveLength(2)
      expect(upstreams['upstream-one']).toBeDefined()
      expect(upstreams['upstream-two']).toBeDefined()
      expect(upstreams['upstream-one']?.url).toBe('https://github.com/org/skills-one')
      expect(upstreams['upstream-two']?.url).toBe('https://github.com/org/skills-two')
    })
  })

  describe('e2E: prompting behavior (no upstreamKey provided)', () => {
    it('should prompt with available candidates when upstreamKey is not provided', async () => {
      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(metaJsonPath, JSON.stringify({ upstreams: {} }, undefined, 2))

      const result = await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          url: 'https://github.com/octocat/Hello-World',
          selectedSkills: {},
        }).pipe(
          Effect.provideService(UserPromptService, createMockUserPromptService()),
          Effect.provide(MetaFileService.Default),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      const meta = JSON.parse(await fs.readFile(metaJsonPath, 'utf8')) as Record<string, unknown>
      const upstreams = meta.upstreams as Record<string, Record<string, unknown>>
      expect(upstreams['hello-world']).toBeDefined()
      expect(result.upstreamKey).toBe('hello-world')

      const submodulePath = path.join(temporaryDirectory, 'upstream', 'hello-world')
      const submoduleExists = await fs
        .stat(submodulePath)
        .then(() => true)
        .catch(() => false)
      expect(submoduleExists).toBe(true)
    })

    it('should directly prompt for custom name when all candidates are taken', async () => {
      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(
        metaJsonPath,
        JSON.stringify(
          {
            upstreams: {
              'hello-world': { url: 'https://github.com/other/repo', skills: {} },
              'octocat': { url: 'https://github.com/other/owner', skills: {} },
            },
          },
          undefined,
          2,
        ),
      )

      const result = await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          url: 'https://github.com/octocat/Hello-World',
          selectedSkills: {},
        }).pipe(
          Effect.provideService(
            UserPromptService,
            createMockUserPromptService({
              prompt: (_message: string) => Effect.sync(() => 'custom-hello-world'),
            }),
          ),
          Effect.provide(MetaFileService.Default),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      expect(result.upstreamKey).toBe('custom-hello-world')

      const meta = JSON.parse(await fs.readFile(metaJsonPath, 'utf8')) as Record<string, unknown>
      const upstreams = meta.upstreams as Record<string, Record<string, unknown>>
      expect(upstreams['custom-hello-world']).toBeDefined()

      const submodulePath = path.join(temporaryDirectory, 'upstream', 'custom-hello-world')
      const submoduleExists = await fs
        .stat(submodulePath)
        .then(() => true)
        .catch(() => false)
      expect(submoduleExists).toBe(true)
    })

    it('should use selected candidate from list when user picks one', async () => {
      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(metaJsonPath, JSON.stringify({ upstreams: {} }, undefined, 2))

      const result = await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          url: 'https://github.com/octocat/Hello-World',
          selectedSkills: {},
        }).pipe(
          Effect.provideService(
            UserPromptService,
            createMockUserPromptService({
              selectFromList: (_message: string, options: Array<{ label: string, value: string }>) =>
                Effect.sync(() => options.find(o => o.value === 'hello-world')!.value),
            }),
          ),
          Effect.provide(MetaFileService.Default),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      const meta = JSON.parse(await fs.readFile(metaJsonPath, 'utf8')) as Record<string, unknown>
      const upstreams = meta.upstreams as Record<string, Record<string, unknown>>
      expect(upstreams['hello-world']).toBeDefined()
      expect(result.upstreamKey).toBe('hello-world')
    })

    it('should prompt for custom name when user selects "Other"', async () => {
      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(metaJsonPath, JSON.stringify({ upstreams: {} }, undefined, 2))

      const result = await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          url: 'https://github.com/octocat/Hello-World',
          selectedSkills: {},
        }).pipe(
          Effect.provideService(
            UserPromptService,
            createMockUserPromptService({
              selectFromList: () => Effect.sync(() => '__other__'),
              prompt: () => Effect.sync(() => 'my-custom-upstream-name'),
            }),
          ),
          Effect.provide(MetaFileService.Default),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      const meta = JSON.parse(await fs.readFile(metaJsonPath, 'utf8')) as Record<string, unknown>
      const upstreams = meta.upstreams as Record<string, Record<string, unknown>>
      expect(upstreams['my-custom-upstream-name']).toBeDefined()
      expect(result.upstreamKey).toBe('my-custom-upstream-name')
    })

    it('should warn about taken candidates when prompting', async () => {
      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(
        metaJsonPath,
        JSON.stringify(
          {
            upstreams: {
              'hello-world': { url: 'https://github.com/other/repo', skills: {} },
            },
          },
          undefined,
          2,
        ),
      )

      const infoCalls: string[] = []

      try {
        await Effect.runPromise(
          upstreamAdd({
            root: temporaryDirectory,
            url: 'https://github.com/octocat/Hello-World',
            selectedSkills: {},
          }).pipe(
            Effect.provideService(UserPromptService, createMockUserPromptService()),
            Effect.provide(MetaFileService.Default),
            Effect.provideService(LogService, createMockLogService({
              info: (text: string) =>
                Effect.sync(() => {
                  infoCalls.push(text)
                }),
            })),
            Effect.provide(GitService.Default),
            Effect.provide(SkillDiscoveryService.Default),
            Effect.provide(SkillHashService.Default),
          ),
        )

        expect(infoCalls.some(w => w.includes('Upstream names already in use') && w.includes('hello-world'))).toBe(true)
      }
      catch {}
    })
  })

  describe('branch support', () => {
    it('should store branch in meta.json when specified', async () => {
      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(
        metaJsonPath,
        JSON.stringify({ upstreams: {} }, undefined, 2),
      )

      const input: UpstreamAddInput = {
        root: temporaryDirectory,
        upstreamKey: 'hello-world-branch',
        url: 'https://github.com/octocat/Hello-World',
        branch: 'master',
        selectedSkills: {},
      }

      const result = await Effect.runPromise(
        upstreamAdd(input).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      expect(result.upstreamKey).toBe('hello-world-branch')

      const updatedMeta = JSON.parse(
        await fs.readFile(metaJsonPath, 'utf8'),
      ) as Record<string, unknown>

      const upstreams = updatedMeta.upstreams as Record<string, Record<string, unknown>>
      expect(upstreams['hello-world-branch']).toBeDefined()
      expect(upstreams['hello-world-branch']?.branch).toBe('master')

      const submodulePath = path.join(temporaryDirectory, 'upstream', 'hello-world-branch')
      const submoduleGit = simpleGit(submodulePath)
      const currentBranch = await submoduleGit.revparse(['--abbrev-ref', 'HEAD'])
      expect(currentBranch.trim()).toBe('master')
    })

    it('should checkout non-default branch and switch branches on re-run', async () => {
      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(metaJsonPath, JSON.stringify({ upstreams: {} }, undefined, 2))

      const git = simpleGit()
      const remoteBranches = await git.listRemote(['--heads', 'https://github.com/octocat/Hello-World'])
      const branches = remoteBranches
        .split('\n')
        .filter(line => line.trim())
        .map((line) => {
          const match = /refs\/heads\/(.+)$/.exec(line)
          return match?.[1]
        })
        .filter(Boolean)
        .slice(0, 2)

      if (branches.length < 2) {
        console.warn(`Skipping: octocat/Hello-World has only ${branches.length} branch(es)`)
        return
      }

      const [branch1, branch2] = branches as [string, string]

      // First run with branch1
      const result1 = await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          url: 'https://github.com/octocat/Hello-World',
          upstreamKey: 'branch-switch-test',
          branch: branch1,
          selectedSkills: {},
        }).pipe(
          Effect.provide(GitService.Default),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(MetaFileService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
          Effect.provide(UserPromptService.Default),
        ),
      )

      expect(result1.upstreamKey).toBe('branch-switch-test')
      expect(result1.isNew).toBe(true)

      const submodulePath = path.join(temporaryDirectory, 'upstream', 'branch-switch-test')
      let submoduleGit = simpleGit(submodulePath)
      let currentBranch = await submoduleGit.revparse(['--abbrev-ref', 'HEAD'])
      expect(currentBranch.trim()).toBe(branch1)

      let metaContent = await fs.readFile(metaJsonPath, 'utf8')
      let meta = JSON.parse(metaContent) as Record<string, unknown>
      const upstreams1 = meta.upstreams as Record<string, Record<string, unknown>>
      expect(upstreams1['branch-switch-test']?.branch).toBe(branch1)

      let gitmodulesPath = path.join(temporaryDirectory, '.gitmodules')
      let gitmodulesContent = await fs.readFile(gitmodulesPath, 'utf8')
      expect(gitmodulesContent).toContain(`branch = ${branch1}`)

      // Second run with branch2
      const result2 = await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          url: 'https://github.com/octocat/Hello-World',
          upstreamKey: 'branch-switch-test',
          branch: branch2,
          selectedSkills: {},
        }).pipe(
          Effect.provide(GitService.Default),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(MetaFileService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
          Effect.provide(UserPromptService.Default),
        ),
      )

      expect(result2.upstreamKey).toBe('branch-switch-test')
      expect(result2.isNew).toBe(false)

      submoduleGit = simpleGit(submodulePath)
      currentBranch = await submoduleGit.revparse(['--abbrev-ref', 'HEAD'])
      expect(currentBranch.trim()).toBe(branch2)

      metaContent = await fs.readFile(metaJsonPath, 'utf8')
      meta = JSON.parse(metaContent) as Record<string, unknown>
      const upstreams2 = meta.upstreams as Record<string, Record<string, unknown>>
      expect(upstreams2['branch-switch-test']?.branch).toBe(branch2)

      gitmodulesPath = path.join(temporaryDirectory, '.gitmodules')
      gitmodulesContent = await fs.readFile(gitmodulesPath, 'utf8')
      expect(gitmodulesContent).toContain(`branch = ${branch2}`)

      // Verify that .gitmodules is well-formed (each section must have path and url)
      const sections = gitmodulesContent.split(/\[submodule\s+"[^"]+"\]/).slice(1)
      for (const section of sections) {
        expect(section).toMatch(/path\s*=/)
        expect(section).toMatch(/url\s*=/)
      }
    }, 15_000)

    it('should not create malformed .gitmodules entries when re-running with different branch', async () => {
      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(
        metaJsonPath,
        JSON.stringify({ upstreams: {} }, undefined, 2),
      )

      // Initial run to create the submodule with master branch
      await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          upstreamKey: 'gitmodules-validation-test',
          url: 'https://github.com/octocat/Hello-World',
          branch: 'master',
          selectedSkills: {},
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      const gitmodulesPath = path.join(temporaryDirectory, '.gitmodules')
      let gitmodulesContent = await fs.readFile(gitmodulesPath, 'utf8')

      // Regression test: verify no malformed sections
      expect(gitmodulesContent).not.toMatch(/\[submodule\s+"\\/)

      // Get available branches other than master
      const git = simpleGit()
      const remoteBranches = await git.listRemote(['--heads', 'https://github.com/octocat/Hello-World'])
      const branches = remoteBranches
        .split('\n')
        .filter(line => line.trim())
        .map((line) => {
          const match = /refs\/heads\/(.+)$/.exec(line)
          return match?.[1]
        })
        .filter(b => b !== undefined && b !== 'master')
        .slice(0, 1)

      if (branches.length === 0) {
        console.warn('Skipping: octocat/Hello-World has only master branch')
        return
      }

      const altBranch = branches[0]!

      // Re-run with different branch
      await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          upstreamKey: 'gitmodules-validation-test',
          url: 'https://github.com/octocat/Hello-World',
          branch: altBranch,
          selectedSkills: {},
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      gitmodulesContent = await fs.readFile(gitmodulesPath, 'utf8')

      // Verify no malformed sections like [submodule "\"upstream/gitmodules-test\""]
      expect(gitmodulesContent).not.toMatch(/\[submodule\s+"\\/)

      // Verify the branch was updated in the correct section
      expect(gitmodulesContent).toContain(`branch = ${altBranch}`)

      // Verify the file is well-formed: each section must have path and url
      const sections = gitmodulesContent.split(/\[submodule\s+/).slice(1)
      for (const section of sections) {
        expect(section).toMatch(/path\s*=/)
        expect(section).toMatch(/url\s*=/)
      }

      // Verify there's exactly one submodule section (not a duplicate)
      const submoduleCount = (gitmodulesContent.match(/\[submodule/g) || []).length
      expect(submoduleCount).toBe(1)
    }, 15_000)
  })

  describe('end-to-end: real git operations', () => {
    let endToEndTestDirectory: string

    beforeEach(async () => {
      endToEndTestDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'upstream-end-to-end-'))

      const git = simpleGit(endToEndTestDirectory)
      await git.init()
      await git.raw(['config', 'user.email', 'test@example.com'])
      await git.raw(['config', 'user.name', 'Test User'])
      await fs.writeFile(path.join(endToEndTestDirectory, 'README.md'), '# End-to-End Test\n')
      await git.add('.')
      await git.commit('Initial commit')
    })

    afterEach(async () => {
      try {
        await fs.rm(endToEndTestDirectory, { recursive: true, force: true })
      }
      catch {}
    })

    it('should add a real upstream repository and verify metadata', async () => {
      const metaJsonPath = path.join(endToEndTestDirectory, 'meta.json')
      await fs.writeFile(metaJsonPath, JSON.stringify({ upstreams: {} }, undefined, 2))

      const result = await Effect.runPromise(
        upstreamAdd({
          root: endToEndTestDirectory,
          url: 'https://github.com/octocat/Hello-World',
          upstreamKey: 'hello-world',
          selectedSkills: {},
        }).pipe(
          Effect.provide(GitService.Default),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(MetaFileService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
          Effect.provide(UserPromptService.Default),
        ),
      )

      expect(result.upstreamKey).toBe('hello-world')
      expect(result.isNew).toBe(true)

      const submodulePath = path.join(endToEndTestDirectory, 'upstream', 'hello-world')
      const submoduleExists = await fs
        .stat(submodulePath)
        .then(() => true)
        .catch(() => false)
      expect(submoduleExists).toBe(true)

      const submoduleGit = simpleGit(submodulePath)
      const logs = await submoduleGit.log()
      expect(logs.total).toBeLessThanOrEqual(1)

      const metaContent = await fs.readFile(metaJsonPath, 'utf8')
      const meta = JSON.parse(metaContent) as Record<string, unknown>
      expect(meta.upstreams).toBeDefined()
      const upstreams = meta.upstreams as Record<string, Record<string, unknown>>
      expect(upstreams['hello-world']).toBeDefined()
      expect(upstreams['hello-world']?.url).toBe('https://github.com/octocat/Hello-World')
    })

    it(
      'should checkout non-default branch and switch branches on re-run',
      async () => {
        const metaJsonPath = path.join(endToEndTestDirectory, 'meta.json')
        await fs.writeFile(metaJsonPath, JSON.stringify({ upstreams: {} }, undefined, 2))

        const git = simpleGit()
        const remoteBranches = await git.listRemote(['--heads', 'https://github.com/octocat/Hello-World'])
        const branches = remoteBranches
          .split('\n')
          .filter(line => line.trim())
          .map((line) => {
            const match = /refs\/heads\/(.+)$/.exec(line)
            return match?.[1]
          })
          .filter(Boolean)
          .slice(0, 2)

        if (branches.length < 2) {
          console.warn(`Skipping: octocat/Hello-World has only ${branches.length} branch(es)`)
          return
        }

        const [branch1, branch2] = branches as [string, string]

        const result1 = await Effect.runPromise(
          upstreamAdd({
            root: endToEndTestDirectory,
            url: 'https://github.com/octocat/Hello-World',
            upstreamKey: 'multi-branch-test',
            branch: branch1,
            selectedSkills: {},
          }).pipe(
            Effect.provide(GitService.Default),
            Effect.provideService(LogService, createMockLogService()),
            Effect.provide(MetaFileService.Default),
            Effect.provide(SkillDiscoveryService.Default),
            Effect.provide(SkillHashService.Default),
            Effect.provide(UserPromptService.Default),
          ),
        )

        expect(result1.upstreamKey).toBe('multi-branch-test')
        const submodulePath = path.join(endToEndTestDirectory, 'upstream', 'multi-branch-test')
        let submoduleGit = simpleGit(submodulePath)
        let currentBranch = await submoduleGit.revparse(['--abbrev-ref', 'HEAD'])
        expect(currentBranch.trim()).toBe(branch1)

        let metaContent = await fs.readFile(metaJsonPath, 'utf8')
        let meta = JSON.parse(metaContent) as Record<string, unknown>
        const upstreams1 = meta.upstreams as Record<string, Record<string, unknown>>
        expect(upstreams1['multi-branch-test']?.branch).toBe(branch1)

        let gitmodulesPath = path.join(endToEndTestDirectory, '.gitmodules')
        let gitmodulesContent = await fs.readFile(gitmodulesPath, 'utf8')
        expect(gitmodulesContent).toContain(`branch = ${branch1}`)

        const result2 = await Effect.runPromise(
          upstreamAdd({
            root: endToEndTestDirectory,
            url: 'https://github.com/octocat/Hello-World',
            upstreamKey: 'multi-branch-test',
            branch: branch2,
            selectedSkills: {},
          }).pipe(
            Effect.provide(GitService.Default),
            Effect.provideService(LogService, createMockLogService()),
            Effect.provide(MetaFileService.Default),
            Effect.provide(SkillDiscoveryService.Default),
            Effect.provide(SkillHashService.Default),
            Effect.provide(UserPromptService.Default),
          ),
        )

        expect(result2.upstreamKey).toBe('multi-branch-test')
        expect(result2.isNew).toBe(false)
        submoduleGit = simpleGit(submodulePath)
        currentBranch = await submoduleGit.revparse(['--abbrev-ref', 'HEAD'])
        expect(currentBranch.trim()).toBe(branch2)

        metaContent = await fs.readFile(metaJsonPath, 'utf8')
        meta = JSON.parse(metaContent) as Record<string, unknown>
        const upstreams2 = meta.upstreams as Record<string, Record<string, unknown>>
        expect(upstreams2['multi-branch-test']?.branch).toBe(branch2)

        gitmodulesPath = path.join(endToEndTestDirectory, '.gitmodules')
        gitmodulesContent = await fs.readFile(gitmodulesPath, 'utf8')
        expect(gitmodulesContent).toContain(`branch = ${branch2}`)

        // Verify that .gitmodules is well-formed (each section must have path and url)
        const sections = gitmodulesContent.split(/\[submodule\s+"[^"]+"\]/).slice(1)
        for (const section of sections) {
          expect(section).toMatch(/path\s*=/)
          expect(section).toMatch(/url\s*=/)
        }
      },
      15_000,
    )
  })
})
