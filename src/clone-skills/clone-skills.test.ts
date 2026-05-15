import type { OutputName } from '../shared/services/meta-file.js'
import type { SkillPath } from '../shared/services/skill-discovery.js'
import type { SkillHash } from '../shared/services/skill-hash.js'
import type { SelectedSkill } from './clone-skills.js'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'
import { Effect } from 'effect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createMockLogService,
  createMockUserPromptService,
  LogService,
  MetaFileService,
  UserPromptService,
} from '../shared/index.js'
import { SkillCloningService } from '../shared/services/index.js'
import { cloneSkills, InvalidUpstreamName, NoAvailableSkills } from './clone-skills.js'

function sk(entry: Record<string, string>): SelectedSkill[] {
  return Object.entries(entry).map(([sourcePath, outputName]) => ({
    sourcePath: sourcePath as SkillPath,
    outputName: outputName as OutputName,
  }))
}

describe('clone-skills', () => {
  let temporaryDirectory: string

  beforeEach(async () => {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'clone-skills-test-'))
  })

  afterEach(async () => {
    await fs.rm(temporaryDirectory, { recursive: true, force: true })
  })

  describe('basic functionality', () => {
    it('should reject when upstream does not exist', async () => {
      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(metaJsonPath, JSON.stringify({ upstreams: {} }, undefined, 2))

      const result = await Effect.runPromise(
        Effect.either(
          cloneSkills({
            root: temporaryDirectory,
            upstreamName: 'nonexistent',
          }).pipe(
            Effect.provide(MetaFileService.Default),
            Effect.provideService(UserPromptService, createMockUserPromptService()),
            Effect.provideService(LogService, createMockLogService()),
            Effect.provide(SkillCloningService.Default),
          ),
        ),
      )

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(InvalidUpstreamName)
      }
    })

    it('should reject when upstream has no available skills', async () => {
      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(
        metaJsonPath,
        JSON.stringify(
          {
            upstreams: {
              'empty-upstream': {
                url: 'https://github.com/test/skills',
                skills: {},
                available: {},
              },
            },
          },
          undefined,
          2,
        ),
      )

      const result = await Effect.runPromise(
        Effect.either(
          cloneSkills({
            root: temporaryDirectory,
            upstreamName: 'empty-upstream',
          }).pipe(
            Effect.provide(MetaFileService.Default),
            Effect.provideService(UserPromptService, createMockUserPromptService()),
            Effect.provideService(LogService, createMockLogService()),
            Effect.provide(SkillCloningService.Default),
          ),
        ),
      )

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(NoAvailableSkills)
      }
    })

    it('should allow user to select skills from available options', async () => {
      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(
        metaJsonPath,
        JSON.stringify(
          {
            upstreams: {
              'test-upstream': {
                url: 'https://github.com/test/skills',
                skills: {},
                available: {
                  'skills/skill-a': 'abc123' as SkillHash,
                  'skills/skill-b': 'def456' as SkillHash,
                  'skills/skill-c': 'ghi789' as SkillHash,
                },
              },
            },
          },
          undefined,
          2,
        ),
      )

      const result = await Effect.runPromise(
        cloneSkills({
          root: temporaryDirectory,
          upstreamName: 'test-upstream',
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provideService(
            UserPromptService,
            createMockUserPromptService({
              multiSelect: (_message: string, options: Array<{ label: string, value: string, hint?: string }>) =>
                Effect.sync(() => options.slice(0, 2).map(o => o.value)),
            }),
          ),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(SkillCloningService.Default),
        ),
      )

      expect(result.selectedSkills).toEqual(sk({ 'skills/skill-a': 'skill-a', 'skills/skill-b': 'skill-b' }))

      const updatedMeta = JSON.parse(await fs.readFile(metaJsonPath, 'utf8')) as Record<string, unknown>
      const upstreams = updatedMeta.upstreams as Record<string, Record<string, unknown>>
      expect(upstreams['test-upstream']?.skills).toEqual({
        'skills/skill-a': 'skill-a',
        'skills/skill-b': 'skill-b',
      })
    })

    it('should allow user to deselect previously selected skills', async () => {
      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(
        metaJsonPath,
        JSON.stringify(
          {
            upstreams: {
              'test-upstream': {
                url: 'https://github.com/test/skills',
                skills: {
                  'skills/skill-a': 'skill-a' as OutputName,
                  'skills/skill-b': 'skill-b' as OutputName,
                },
                available: {
                  'skills/skill-a': 'abc123' as SkillHash,
                  'skills/skill-b': 'def456' as SkillHash,
                  'skills/skill-c': 'ghi789' as SkillHash,
                },
              },
            },
          },
          undefined,
          2,
        ),
      )

      const result = await Effect.runPromise(
        cloneSkills({
          root: temporaryDirectory,
          upstreamName: 'test-upstream',
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provideService(
            UserPromptService,
            createMockUserPromptService({
              multiSelect: (_message: string, _options: Array<{ label: string, value: string, hint?: string }>, initialValues?: string[]) =>
                Effect.sync(() => initialValues?.filter(v => v === 'skills/skill-a') ?? []),
            }),
          ),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(SkillCloningService.Default),
        ),
      )

      expect(result.selectedSkills).toEqual(sk({ 'skills/skill-a': 'skill-a' }))

      const updatedMeta = JSON.parse(await fs.readFile(metaJsonPath, 'utf8')) as Record<string, unknown>
      const upstreams = updatedMeta.upstreams as Record<string, Record<string, unknown>>
      expect(upstreams['test-upstream']?.skills).toEqual({
        'skills/skill-a': 'skill-a',
      })
    })

    it('should show currently selected skills as checked in multiselect', async () => {
      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(
        metaJsonPath,
        JSON.stringify({
          upstreams: {
            'test-upstream': {
              url: 'https://github.com/test/skills',
              skills: { ['skills/skill-a' as SkillPath]: 'skill-a' as OutputName },
              available: { ['skills/skill-a' as SkillPath]: 'abc123' as SkillHash, ['skills/skill-b' as SkillPath]: 'def456' as SkillHash },
            } satisfies Record<string, unknown>,
          },
        } as any),
      )

      let receivedInitialValues: string[] | undefined
      await Effect.runPromise(
        cloneSkills({
          root: temporaryDirectory,
          upstreamName: 'test-upstream',
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provideService(
            UserPromptService,
            createMockUserPromptService({
              multiSelect: (_message: string, _options: Array<{ label: string, value: string, hint?: string }>, initialValues?: string[]) => {
                receivedInitialValues = initialValues
                return Effect.sync(() => initialValues ?? [])
              },
            }),
          ),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(SkillCloningService.Default),
        ),
      )

      expect(receivedInitialValues).toContain('skills/skill-a')
    })

    it('should handle empty selection gracefully', async () => {
      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(
        metaJsonPath,
        JSON.stringify({
          upstreams: {
            'test-upstream': {
              url: 'https://github.com/test/skills',
              skills: { ['skills/skill-a' as SkillPath]: 'skill-a' as OutputName },
              available: { ['skills/skill-a' as SkillPath]: 'abc123' as SkillHash, ['skills/skill-b' as SkillPath]: 'def456' as SkillHash },
            } satisfies Record<string, unknown>,
          },
        } as any),
      )

      const result = await Effect.runPromise(
        cloneSkills({
          root: temporaryDirectory,
          upstreamName: 'test-upstream',
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provideService(
            UserPromptService,
            createMockUserPromptService({
              multiSelect: () => Effect.sync(() => []),
            }),
          ),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(SkillCloningService.Default),
        ),
      )

      expect(result.selectedSkills).toEqual([])
      expect(result.message).toContain('No skills selected')

      const updatedMeta = JSON.parse(await fs.readFile(metaJsonPath, 'utf8')) as Record<string, unknown>
      const upstreams = updatedMeta.upstreams as Record<string, Record<string, unknown>>
      expect(upstreams['test-upstream']?.skills).toEqual({})
    })

    it('should be re-runnable allowing skills to be added and removed', async () => {
      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(
        metaJsonPath,
        JSON.stringify({
          upstreams: {
            'test-upstream': {
              url: 'https://github.com/test/skills',
              skills: { ['skills/skill-a' as SkillPath]: 'skill-a' as OutputName },
              available: { ['skills/skill-a' as SkillPath]: 'abc123' as SkillHash, ['skills/skill-b' as SkillPath]: 'def456' as SkillHash, ['skills/skill-c' as SkillPath]: 'ghi789' as SkillHash },
            } satisfies Record<string, unknown>,
          },
        } as any),
      )

      const result1 = await Effect.runPromise(
        cloneSkills({
          root: temporaryDirectory,
          upstreamName: 'test-upstream',
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provideService(
            UserPromptService,
            createMockUserPromptService({
              multiSelect: () => Effect.sync(() => ['skills/skill-a', 'skills/skill-c']),
            }),
          ),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(SkillCloningService.Default),
        ),
      )

      expect(result1.selectedSkills).toEqual(sk({ 'skills/skill-a': 'skill-a', 'skills/skill-c': 'skill-c' }))

      const result2 = await Effect.runPromise(
        cloneSkills({
          root: temporaryDirectory,
          upstreamName: 'test-upstream',
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provideService(
            UserPromptService,
            createMockUserPromptService({
              multiSelect: () => Effect.sync(() => ['skills/skill-a', 'skills/skill-b', 'skills/skill-c']),
            }),
          ),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(SkillCloningService.Default),
        ),
      )

      expect(result2.selectedSkills).toEqual(sk({ 'skills/skill-a': 'skill-a', 'skills/skill-b': 'skill-b', 'skills/skill-c': 'skill-c' }))

      const result3 = await Effect.runPromise(
        cloneSkills({
          root: temporaryDirectory,
          upstreamName: 'test-upstream',
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provideService(
            UserPromptService,
            createMockUserPromptService({
              multiSelect: () => Effect.sync(() => ['skills/skill-a', 'skills/skill-c']),
            }),
          ),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(SkillCloningService.Default),
        ),
      )

      expect(result3.selectedSkills).toEqual(sk({ 'skills/skill-a': 'skill-a', 'skills/skill-c': 'skill-c' }))

      const finalMeta = JSON.parse(await fs.readFile(metaJsonPath, 'utf8')) as Record<string, unknown>
      const upstreams = finalMeta.upstreams as Record<string, Record<string, unknown>>
      expect(upstreams['test-upstream']?.skills).toEqual({
        'skills/skill-a': 'skill-a',
        'skills/skill-c': 'skill-c',
      })
    })

    it('should handle nested skill paths correctly', async () => {
      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(
        metaJsonPath,
        JSON.stringify({
          upstreams: {
            'test-upstream': {
              url: 'https://github.com/test/skills',
              skills: {},
              available: {
                'skills/productivity/caveman': 'abc123' as SkillHash,
                'skills/engineering/grill-me': 'def456' as SkillHash,
                'utils/helpers': 'ghi789' as SkillHash,
              },
            } satisfies Record<string, unknown>,
          },
        } as any),
      )

      const result = await Effect.runPromise(
        cloneSkills({
          root: temporaryDirectory,
          upstreamName: 'test-upstream',
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provideService(
            UserPromptService,
            createMockUserPromptService({
              multiSelect: (_message: string, options: Array<{ label: string, value: string, hint?: string }>) =>
                Effect.sync(() => options.map(o => o.value)),
            }),
          ),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(SkillCloningService.Default),
        ),
      )

      expect(result.selectedSkills).toEqual(sk({
        'skills/productivity/caveman': 'caveman',
        'skills/engineering/grill-me': 'grill-me',
        'utils/helpers': 'helpers',
      }))
    })

    it('should provide message indicating cloned and removed counts', async () => {
      const metaJsonPath = path.join(temporaryDirectory, 'meta.json')
      await fs.writeFile(
        metaJsonPath,
        JSON.stringify({
          upstreams: {
            'test-upstream': {
              url: 'https://github.com/test/skills',
              skills: {},
              available: { 'skills/skill-a': 'abc123' as SkillHash },
            } satisfies Record<string, unknown>,
          },
        } as any),
      )

      const result = await Effect.runPromise(
        cloneSkills({
          root: temporaryDirectory,
          upstreamName: 'test-upstream',
        }).pipe(
          Effect.provide(MetaFileService.Default),
          Effect.provideService(
            UserPromptService,
            createMockUserPromptService({
              multiSelect: (_message: string, options: Array<{ label: string, value: string, hint?: string }>) =>
                Effect.sync(() => options.map(o => o.value)),
            }),
          ),
          Effect.provideService(LogService, createMockLogService()),
          Effect.provide(SkillCloningService.Default),
        ),
      )

      expect(result.message).toContain('Selected 1 skill(s)')
    })
  })
})
