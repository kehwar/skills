import type { UpstreamAddInput } from './upstream.js'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'
import { Effect } from 'effect'
import { simpleGit } from 'simple-git'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  GitService,
  MetaFileService,
  SkillDiscoveryService,
  SkillHashService,
  UserPromptService,
} from './services/index.js'
import { parseGitHubUrl, resolveUpstreamKey, upstreamAdd, UpstreamConflict } from './upstream.js'

/**
 * Mock factory for UserPromptService using Effect's recommended pattern
 * Creates a mock service instance that can be provided using Effect.provideService
 */
function createMockUserPromptService(overrides?: {
  selectFromList?: (message: string, options: Array<{ label: string, value: string }>) => string
  confirm?: (message: string) => boolean
  prompt?: (message: string) => string
}) {
  return new UserPromptService({
    selectFromList: (message: string, options: Array<{ label: string, value: string }>) =>
      Effect.sync(() => overrides?.selectFromList?.(message, options) ?? options[0].value),
    confirm: (message: string) =>
      Effect.sync(() => overrides?.confirm?.(message) ?? true),
    prompt: (message: string) =>
      Effect.sync(() => overrides?.prompt?.(message) ?? 'custom-name'),
  })
}

/**
 * Mock factory for GitService using Effect's recommended pattern
 * Creates a mock service instance that can be provided using Effect.provideService
 */
function createMockGitService() {
  return new GitService({
    addSubmodule: (_root: string, _key: string, _url: string) =>
      Effect.sync(() => {}),
  })
}

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
    // eslint-disable-next-line unicorn/no-useless-undefined
    const result = resolveUpstreamKey(undefined)
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
      // Setup: Create a mock upstream directory with SKILL.md files
      const upstreamDirectory = path.join(temporaryDirectory, 'upstream', 'test-upstream')
      await fs.mkdir(upstreamDirectory, { recursive: true })

      // Create mock SKILL.md files (simulating what would be in the real upstream)
      const skillDirectory1 = path.join(upstreamDirectory, 'skill-one')
      await fs.mkdir(skillDirectory1)
      await fs.writeFile(path.join(skillDirectory1, 'SKILL.md'), '# Skill One\n\nDescription of skill one')

      const skillDirectory2 = path.join(upstreamDirectory, 'skill-two')
      await fs.mkdir(skillDirectory2)
      await fs.writeFile(path.join(skillDirectory2, 'SKILL.md'), '# Skill Two\n\nDescription of skill two')

      // Setup: Create initial meta.json
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

      // Act: Call upstream-add orchestrator
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
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      // Assert: meta.json was updated
      const updatedMeta = JSON.parse(
        await fs.readFile(metaJsonPath, 'utf8'),
      ) as Record<string, unknown>

      expect(updatedMeta.upstreams).toBeDefined()
      const upstreams = updatedMeta.upstreams as Record<string, Record<string, unknown>>
      expect(upstreams['test-upstream']).toBeDefined()
      expect(upstreams['test-upstream'].url).toBe('https://github.com/test/skills')
      expect(upstreams['test-upstream'].skills).toEqual({
        'skill-one': 'test-skill-one',
        'skill-two': 'test-skill-two',
      })

      // Assert: Skills were discovered with hashes
      expect(upstreams['test-upstream'].available).toBeDefined()
      const available = upstreams['test-upstream'].available as Record<string, unknown>
      expect(available['skill-one']).toBeDefined()
      expect(available['skill-two']).toBeDefined()

      // Assert: Result contains discovery info
      expect(result.isNew).toBe(true)
      expect(result.upstreamKey).toBe('test-upstream')
      expect(result.discoveredSkills).toHaveLength(2)
      expect(result.discoveredSkills[0]).toHaveProperty('path')
      expect(result.discoveredSkills[0]).toHaveProperty('hash')
    })

    it('should be idempotent: running twice with same URL updates metadata', async () => {
      // Setup: Create upstream directory
      const upstreamDirectory = path.join(temporaryDirectory, 'upstream', 'idempotent-test')
      await fs.mkdir(upstreamDirectory, { recursive: true })

      const skillDirectory = path.join(upstreamDirectory, 'skill-one')
      await fs.mkdir(skillDirectory)
      await fs.writeFile(path.join(skillDirectory, 'SKILL.md'), '# Skill One\n\nVersion 1')

      // Setup: Create initial meta.json
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

      // Act 1: First run
      const result1 = await Effect.runPromise(
        upstreamAdd(input).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      // Act 2: Second run (same URL, same skills)
      const result2 = await Effect.runPromise(
        upstreamAdd(input).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      // Assert: Both should show as successful
      expect(result1.isNew).toBe(true)
      expect(result2.isNew).toBe(false)

      // Assert: meta.json has the upstream
      const finalMeta = JSON.parse(await fs.readFile(metaJsonPath, 'utf8')) as Record<string, unknown>
      const upstreamsIdem = finalMeta.upstreams as Record<string, Record<string, unknown>>
      expect(upstreamsIdem['idempotent-test']).toBeDefined()
      expect(upstreamsIdem['idempotent-test'].url).toBe('https://github.com/test/skills')
    })

    it('should update selected skills when re-run with different selection', async () => {
      // Setup: Create upstream with two skills
      const upstreamDirectory = path.join(temporaryDirectory, 'upstream', 'update-test')
      await fs.mkdir(upstreamDirectory, { recursive: true })

      for (let index = 1; index <= 2; index++) {
        const skillDirectory = path.join(upstreamDirectory, `skill-${index}`)
        await fs.mkdir(skillDirectory)
        await fs.writeFile(path.join(skillDirectory, 'SKILL.md'), `# Skill ${index}`)
      }

      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(metaJsonPath, JSON.stringify({ upstreams: {} }, undefined, 2))

      // Act 1: Select only skill-1
      await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          upstreamKey: 'update-test',
          url: 'https://github.com/test/skills',
          selectedSkills: { 'skill-1': 'skill-1' },
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      // Act 2: Update selection to include skill-2
      await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          upstreamKey: 'update-test',
          url: 'https://github.com/test/skills',
          selectedSkills: { 'skill-1': 'skill-1', 'skill-2': 'skill-2' },
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      // Assert: meta.json has updated skills
      const finalMetaUpdate = JSON.parse(await fs.readFile(metaJsonPath, 'utf8')) as Record<string, unknown>
      const upstreamsUpdate = finalMetaUpdate.upstreams as Record<string, unknown>
      const updateTestUp = upstreamsUpdate['update-test'] as Record<string, Record<string, unknown>>
      const skillsRec = updateTestUp.skills
      expect(Object.keys(skillsRec)).toHaveLength(2)
      expect(skillsRec['skill-2']).toBe('skill-2')
    })

    it('should normalize different GitHub URL formats to https', async () => {
      // Setup: Create upstream directory (pre-created, simulating successful git submodule)
      const upstreamDirectory = path.join(temporaryDirectory, 'upstream', 'ssh-format')
      await fs.mkdir(upstreamDirectory, { recursive: true })

      const skillDirectory = path.join(upstreamDirectory, 'skill-one')
      await fs.mkdir(skillDirectory)
      await fs.writeFile(path.join(skillDirectory, 'SKILL.md'), '# Skill One')

      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(metaJsonPath, JSON.stringify({ upstreams: {} }, undefined, 2))

      // Act: Add upstream with SSH format URL
      const resultSSH = await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          upstreamKey: 'ssh-format',
          url: 'git@github.com:test/skills.git',
          selectedSkills: { 'skill-one': 'skill-one' },
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      // Assert: URL is normalized to https in meta.json
      const metaAfterSSH = JSON.parse(await fs.readFile(metaJsonPath, 'utf8')) as Record<string, unknown>
      const upstreamsSSH = metaAfterSSH.upstreams as Record<string, Record<string, unknown>>
      expect(upstreamsSSH['ssh-format'].url).toBe('https://github.com/test/skills')
      expect(resultSSH.isNew).toBe(true)
    })

    it('should compute consistent hashes for skill content', async () => {
      // Setup: Create upstream with specific skill content
      const upstreamDirectory = path.join(temporaryDirectory, 'upstream', 'hash-test')
      await fs.mkdir(upstreamDirectory, { recursive: true })

      const skillDirectory = path.join(upstreamDirectory, 'skill-one')
      await fs.mkdir(skillDirectory)
      const skillContent = '# Skill One\n\nDescription with specific content\n'
      await fs.writeFile(path.join(skillDirectory, 'SKILL.md'), skillContent)

      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(metaJsonPath, JSON.stringify({ upstreams: {} }, undefined, 2))

      // Act 1: Add upstream
      const result1 = await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          upstreamKey: 'hash-test',
          url: 'https://github.com/test/skills',
          selectedSkills: { 'skill-one': 'skill-one' },
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      const hash1 = result1.discoveredSkills[0].hash

      // Act 2: Add again without changing content (idempotent)
      const result2 = await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          upstreamKey: 'hash-test',
          url: 'https://github.com/test/skills',
          selectedSkills: { 'skill-one': 'skill-one' },
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      const hash2 = result2.discoveredSkills[0].hash

      // Assert: Hashes are deterministic
      expect(hash1).toBe(hash2)
      expect(hash1).toMatch(/^[a-f0-9]{64}$/) // SHA256 hex
    })

    it('should discover skills in nested directories', async () => {
      // Setup: Create nested skill structure
      const upstreamDirectory = path.join(temporaryDirectory, 'upstream', 'nested-test')
      await fs.mkdir(upstreamDirectory, { recursive: true })

      // Top-level skill
      const skill1Directory = path.join(upstreamDirectory, 'skill-one')
      await fs.mkdir(skill1Directory)
      await fs.writeFile(path.join(skill1Directory, 'SKILL.md'), '# Skill One')

      // Nested skill
      const nestedDirectory = path.join(upstreamDirectory, 'subdir', 'skill-two')
      await fs.mkdir(nestedDirectory, { recursive: true })
      await fs.writeFile(path.join(nestedDirectory, 'SKILL.md'), '# Skill Two')

      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(metaJsonPath, JSON.stringify({ upstreams: {} }, undefined, 2))

      // Act
      const result = await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          upstreamKey: 'nested-test',
          url: 'https://github.com/test/skills',
          selectedSkills: { 'skill-one': 'skill-one', 'subdir/skill-two': 'skill-two' },
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      // Assert: Both skills discovered
      expect(result.discoveredSkills).toHaveLength(2)
      const paths = result.discoveredSkills.map(s => s.path).toSorted((a, b) => a.localeCompare(b))
      expect(paths).toContain('skill-one')
      expect(paths).toContain('subdir/skill-two')

      // Assert: meta.json has both
      const meta = JSON.parse(await fs.readFile(metaJsonPath, 'utf8')) as Record<string, unknown>
      const upstreams = meta.upstreams as Record<string, Record<string, unknown>>
      const available = upstreams['nested-test'].available as Record<string, unknown>
      expect(Object.keys(available)).toHaveLength(2)
    })

    it('should reject adding upstream with same key but different URL', async () => {
      // Setup: Create two upstreams with initial meta.json
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

      // Act: Try to add with same key but different URL
      const result = await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          upstreamKey: 'collision',
          url: 'https://github.com/different/skills',
          selectedSkills: {},
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
          Effect.catchTag('UpstreamConflict', error => Effect.succeed(error)),
        ),
      )

      // Assert: Collision error returned
      expect(result).toBeInstanceOf(UpstreamConflict)
    })

    it('should allow same URL under multiple different upstream keys', async () => {
      // Setup: Create two directories (both pointing to same logical upstream)
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

      // Act 1: Add upstream under key "antfu-original"
      await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          upstreamKey: 'antfu-original',
          url: sameUrl,
          selectedSkills: { 'skill-a': 'skill-a' },
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      // Act 2: Add SAME URL under different key "antfu-alias" (should succeed)
      const result2 = await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          upstreamKey: 'antfu-alias',
          url: sameUrl,
          selectedSkills: { 'skill-a': 'skill-a' },
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      // Assert: Both upstreams exist with same URL
      const meta = JSON.parse(await fs.readFile(metaJsonPath, 'utf8')) as Record<string, unknown>
      const upstreams = meta.upstreams as Record<string, Record<string, unknown>>
      expect(Object.keys(upstreams)).toHaveLength(2)
      expect(upstreams['antfu-original'].url).toBe(sameUrl)
      expect(upstreams['antfu-alias'].url).toBe(sameUrl)
      expect(result2.isNew).toBe(true)
    })

    it('should support multiple upstreams in same meta.json', async () => {
      // Setup: Create two separate upstreams
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

      // Act 1: Add first upstream
      await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          upstreamKey: 'upstream-one',
          url: 'https://github.com/org/skills-one',
          selectedSkills: { 'skill-a': 'skill-a' },
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      // Act 2: Add second upstream
      await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          upstreamKey: 'upstream-two',
          url: 'https://github.com/org/skills-two',
          selectedSkills: { 'skill-b': 'skill-b' },
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provide(UserPromptService.Default),
          Effect.provide(GitService.Default),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      // Assert: Both upstreams are in meta.json
      const meta = JSON.parse(await fs.readFile(metaJsonPath, 'utf8')) as Record<string, unknown>
      const upstreams = meta.upstreams as Record<string, Record<string, unknown>>
      expect(Object.keys(upstreams)).toHaveLength(2)
      expect(upstreams['upstream-one']).toBeDefined()
      expect(upstreams['upstream-two']).toBeDefined()
      expect(upstreams['upstream-one'].url).toBe('https://github.com/org/skills-one')
      expect(upstreams['upstream-two'].url).toBe('https://github.com/org/skills-two')
    })
  })

  describe('e2E: prompting behavior (no upstreamKey provided)', () => {
    it('should prompt with available candidates when upstreamKey is not provided', async () => {
      // Setup: Create upstream directory
      const upstreamDirectory = path.join(temporaryDirectory, 'upstream', 'antfu')
      await fs.mkdir(upstreamDirectory, { recursive: true })

      const skillDirectory = path.join(upstreamDirectory, 'test-skill')
      await fs.mkdir(skillDirectory)
      await fs.writeFile(path.join(skillDirectory, 'SKILL.md'), '# Test Skill')

      // Setup: Create initial meta.json (empty upstreams)
      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(metaJsonPath, JSON.stringify({ upstreams: {} }, undefined, 2))

      // Act: Call upstream-add WITHOUT upstreamKey using mock services
      const result = await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          url: 'https://github.com/antfu/auto',
          selectedSkills: { 'test-skill': 'test-skill' },
        }).pipe(
          Effect.provideService(UserPromptService, createMockUserPromptService()),
          Effect.provide(MetaFileService.Default),
          Effect.provideService(GitService, createMockGitService()),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      // Assert: Used the selected candidate from list
      const meta = JSON.parse(await fs.readFile(metaJsonPath, 'utf8')) as Record<string, unknown>
      const upstreams = meta.upstreams as Record<string, Record<string, unknown>>
      expect(upstreams.auto).toBeDefined()
      expect(result.upstreamKey).toBe('auto')
    })

    it('should directly prompt for custom name when all candidates are taken', async () => {
      // Setup: Create upstream directory
      const upstreamDirectory = path.join(temporaryDirectory, 'upstream', 'effect')
      await fs.mkdir(upstreamDirectory, { recursive: true })

      const skillDirectory = path.join(upstreamDirectory, 'test-skill')
      await fs.mkdir(skillDirectory)
      await fs.writeFile(path.join(skillDirectory, 'SKILL.md'), '# Test Skill')

      // Setup: Create meta.json with BOTH candidates already taken
      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(
        metaJsonPath,
        JSON.stringify(
          {
            upstreams: {
              effect: { url: 'https://github.com/effect/other-repo', skills: {} },
              // Note: for effect/effect, alternatives would be just ["effect"], but we need to simulate
              // a case where the single option is taken. We'll add another entry to force custom prompting.
            },
          },
          undefined,
          2,
        ),
      )

      // Act: Call upstream-add WITHOUT upstreamKey for effect/effect (only 1 candidate, already taken)
      await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          url: 'https://github.com/effect/effect',
          selectedSkills: { 'test-skill': 'test-skill' },
        }).pipe(
          Effect.provideService(
            UserPromptService,
            createMockUserPromptService({
              prompt: () => 'custom-effect',
            }),
          ),
          Effect.provide(MetaFileService.Default),
          Effect.provideService(GitService, createMockGitService()),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      // Assert: Used the custom name
      const meta = JSON.parse(await fs.readFile(metaJsonPath, 'utf8')) as Record<string, unknown>
      const upstreams = meta.upstreams as Record<string, Record<string, unknown>>
      expect(upstreams['custom-effect']).toBeDefined()
    })

    it('should use selected candidate from list when user picks one', async () => {
      // Setup: Create upstream directory
      const upstreamDirectory = path.join(temporaryDirectory, 'upstream', 'vueuse')
      await fs.mkdir(upstreamDirectory, { recursive: true })

      const skillDirectory = path.join(upstreamDirectory, 'test-skill')
      await fs.mkdir(skillDirectory)
      await fs.writeFile(path.join(skillDirectory, 'SKILL.md'), '# Test Skill')

      // Setup: Create initial meta.json (empty upstreams)
      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(metaJsonPath, JSON.stringify({ upstreams: {} }, undefined, 2))

      // Act: Call upstream-add WITHOUT upstreamKey
      const result = await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          url: 'https://github.com/vueuse/vueuse',
          selectedSkills: { 'test-skill': 'test-skill' },
        }).pipe(
          Effect.provideService(
            UserPromptService,
            createMockUserPromptService({
              selectFromList: (_message: string, options: Array<{ label: string, value: string }>) =>
                options.find(o => o.value === 'vueuse')!.value,
            }),
          ),
          Effect.provide(MetaFileService.Default),
          Effect.provideService(GitService, createMockGitService()),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      // Assert: Used the selected candidate (vueuse, not the default repo name)
      const meta = JSON.parse(await fs.readFile(metaJsonPath, 'utf8')) as Record<string, unknown>
      const upstreams = meta.upstreams as Record<string, Record<string, unknown>>
      expect(upstreams.vueuse).toBeDefined()
      expect(result.upstreamKey).toBe('vueuse')
    })

    it('should prompt for custom name when user selects "Other"', async () => {
      // Setup: Create upstream directory
      const upstreamDirectory = path.join(temporaryDirectory, 'upstream', 'custom-author')
      await fs.mkdir(upstreamDirectory, { recursive: true })

      const skillDirectory = path.join(upstreamDirectory, 'test-skill')
      await fs.mkdir(skillDirectory)
      await fs.writeFile(path.join(skillDirectory, 'SKILL.md'), '# Test Skill')

      // Setup: Create initial meta.json (empty upstreams)
      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(metaJsonPath, JSON.stringify({ upstreams: {} }, undefined, 2))

      // Act: Call upstream-add WITHOUT upstreamKey
      const result = await Effect.runPromise(
        upstreamAdd({
          root: temporaryDirectory,
          url: 'https://github.com/custom-author/custom-repo',
          selectedSkills: { 'test-skill': 'test-skill' },
        }).pipe(
          Effect.provideService(
            UserPromptService,
            createMockUserPromptService({
              selectFromList: () => '__other__',
              prompt: () => 'my-custom-upstream-name',
            }),
          ),
          Effect.provide(MetaFileService.Default),
          Effect.provideService(GitService, createMockGitService()),
          Effect.provide(SkillDiscoveryService.Default),
          Effect.provide(SkillHashService.Default),
        ),
      )

      // Assert: Used the custom name
      const meta = JSON.parse(await fs.readFile(metaJsonPath, 'utf8')) as Record<string, unknown>
      const upstreams = meta.upstreams as Record<string, Record<string, unknown>>
      expect(upstreams['my-custom-upstream-name']).toBeDefined()
      expect(result.upstreamKey).toBe('my-custom-upstream-name')
    })

    it('should warn about taken candidates when prompting', async () => {
      // Setup: Create upstream directory
      const upstreamDirectory = path.join(temporaryDirectory, 'upstream', 'test-taken')
      await fs.mkdir(upstreamDirectory, { recursive: true })

      const skillDirectory = path.join(upstreamDirectory, 'test-skill')
      await fs.mkdir(skillDirectory)
      await fs.writeFile(path.join(skillDirectory, 'SKILL.md'), '# Test Skill')

      // Setup: Create meta.json with 'test-author' already taken
      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(
        metaJsonPath,
        JSON.stringify(
          {
            upstreams: {
              'test-author': { url: 'https://github.com/test-author/other-repo', skills: {} },
            },
          },
          undefined,
          2,
        ),
      )

      // Mock console.warn to capture warning
      const warnings: string[] = []
      const originalWarn = console.warn
      console.warn = (...arguments_: any[]) => {
        warnings.push(String(arguments_[0]))
      }

      try {
        // Act: Call upstream-add WITHOUT upstreamKey
        await Effect.runPromise(
          upstreamAdd({
            root: temporaryDirectory,
            url: 'https://github.com/test-author/test-repo',
            selectedSkills: { 'test-skill': 'test-skill' },
          }).pipe(
            Effect.provideService(UserPromptService, createMockUserPromptService()),
            Effect.provide(MetaFileService.Default),
            Effect.provideService(GitService, createMockGitService()),
            Effect.provide(SkillDiscoveryService.Default),
            Effect.provide(SkillHashService.Default),
          ),
        )

        // Assert: warning was logged about taken candidate
        expect(warnings.some(w => w.includes('[upstream-add]') && w.includes('test-author'))).toBe(true)
      }
      finally {
        console.warn = originalWarn
      }
    })
  })
})
