import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'
import { Effect } from 'effect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { build } from './build.js'

async function createAuthoredSkill(directory: string, domain: string, skillName: string): Promise<void> {
  const skillDirectory = path.join(directory, 'authored', domain, skillName)
  await fs.mkdir(skillDirectory, { recursive: true })
  await fs.writeFile(path.join(skillDirectory, 'SKILL.md'), `# ${skillName}\n`)
  await fs.writeFile(
    path.join(skillDirectory, 'meta.json'),
    JSON.stringify({ type: 'authored', domain }),
  )
}

async function createSyncedSkill(directory: string, skillName: string): Promise<void> {
  const skillDirectory = path.join(directory, 'synced', skillName)
  await fs.mkdir(skillDirectory, { recursive: true })
  await fs.writeFile(path.join(skillDirectory, 'SKILL.md'), `# ${skillName}\n`)
}

describe('build', () => {
  let temporaryDirectory: string

  beforeEach(async () => {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'build-test-'))
  })

  afterEach(async () => {
    await fs.rm(temporaryDirectory, { recursive: true, force: true })
  })

  describe('manifest generation', () => {
    it('should generate plugin.json from authored/ directory', async () => {
      await createAuthoredSkill(temporaryDirectory, 'engineering', 'skill-a')

      const result = await Effect.runPromise(
        build({ root: temporaryDirectory }),
      )

      const manifestPath = path.join(temporaryDirectory, '.claude-plugin', 'plugin.json')
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as Record<string, unknown>

      expect(manifest).toEqual({
        name: 'kehwar-skills',
        skills: ['./authored/engineering/skill-a'],
      })
      expect(result.exitCode).toBe(0)
    })

    it('should create .claude-plugin directory if missing', async () => {
      await createAuthoredSkill(temporaryDirectory, 'frappe', 'my-skill')

      const claudePluginDirectory = path.join(temporaryDirectory, '.claude-plugin')
      await expect(fs.stat(claudePluginDirectory)).rejects.toThrow()

      await Effect.runPromise(build({ root: temporaryDirectory }))

      const stat = await fs.stat(claudePluginDirectory)
      expect(stat.isDirectory()).toBe(true)
    })

    it('should produce identical output on subsequent runs (deterministic)', async () => {
      await createAuthoredSkill(temporaryDirectory, 'engineering', 'skill-a')
      await createAuthoredSkill(temporaryDirectory, 'engineering', 'skill-b')
      await createAuthoredSkill(temporaryDirectory, 'frappe', 'skill-c')

      await Effect.runPromise(build({ root: temporaryDirectory }))
      const firstOutput = await fs.readFile(
        path.join(temporaryDirectory, '.claude-plugin', 'plugin.json'),
        'utf8',
      )

      await Effect.runPromise(build({ root: temporaryDirectory }))
      const secondOutput = await fs.readFile(
        path.join(temporaryDirectory, '.claude-plugin', 'plugin.json'),
        'utf8',
      )

      expect(secondOutput).toBe(firstOutput)
    })

    it('should generate empty skills array when authored/ and synced/ are empty', async () => {
      await fs.mkdir(path.join(temporaryDirectory, 'authored'), { recursive: true })

      await Effect.runPromise(build({ root: temporaryDirectory }))

      const manifest = JSON.parse(
        await fs.readFile(
          path.join(temporaryDirectory, '.claude-plugin', 'plugin.json'),
          'utf8',
        ),
      ) as Record<string, unknown>

      expect(manifest).toEqual({ name: 'kehwar-skills', skills: [] })
    })

    it('should include synced skills alongside authored skills', async () => {
      await createAuthoredSkill(temporaryDirectory, 'engineering', 'skill-a')
      await createSyncedSkill(temporaryDirectory, 'antfu')

      await Effect.runPromise(build({ root: temporaryDirectory }))

      const manifest = JSON.parse(
        await fs.readFile(
          path.join(temporaryDirectory, '.claude-plugin', 'plugin.json'),
          'utf8',
        ),
      ) as Record<string, unknown>

      expect(manifest).toEqual({
        name: 'kehwar-skills',
        skills: ['./synced/antfu', './authored/engineering/skill-a'],
      })
    })

    it('should warn on name collision between authored and synced skills and deduplicate', async () => {
      await createAuthoredSkill(temporaryDirectory, 'engineering', 'debug')
      await createSyncedSkill(temporaryDirectory, 'debug')

      const result = await Effect.runPromise(build({ root: temporaryDirectory }))

      const manifest = JSON.parse(
        await fs.readFile(
          path.join(temporaryDirectory, '.claude-plugin', 'plugin.json'),
          'utf8',
        ),
      ) as Record<string, unknown>

      expect(manifest).toEqual({
        name: 'kehwar-skills',
        skills: ['./authored/engineering/debug'],
      })
      expect(result.exitCode).toBe(0)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain('debug')
      expect(result.warnings[0]).toContain('./authored/engineering/debug')
    })

    it('should sort skills alphabetically by name', async () => {
      await createAuthoredSkill(temporaryDirectory, 'frappe', 'doctype-schema')
      await createAuthoredSkill(temporaryDirectory, 'engineering', 'break-issue')
      await createSyncedSkill(temporaryDirectory, 'antfu')

      await Effect.runPromise(build({ root: temporaryDirectory }))

      const manifest = JSON.parse(
        await fs.readFile(
          path.join(temporaryDirectory, '.claude-plugin', 'plugin.json'),
          'utf8',
        ),
      ) as Record<string, unknown>

      expect(manifest).toEqual({
        name: 'kehwar-skills',
        skills: [
          './synced/antfu',
          './authored/engineering/break-issue',
          './authored/frappe/doctype-schema',
        ],
      })
    })
  })
})
