import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'
import { Effect } from 'effect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { build } from './build.js'

async function createSkill(directory: string, domain: string, skillName: string): Promise<void> {
  const skillDirectory = path.join(directory, 'authored', domain, skillName)
  await fs.mkdir(skillDirectory, { recursive: true })
  await fs.writeFile(path.join(skillDirectory, 'SKILL.md'), `# ${skillName}\n`)
  await fs.writeFile(
    path.join(skillDirectory, 'meta.json'),
    JSON.stringify({ type: 'authored', domain }),
  )
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
    it('should generate marketplace.json from authored/ directory', async () => {
      await createSkill(temporaryDirectory, 'engineering', 'skill-a')

      const result = await Effect.runPromise(
        build({ root: temporaryDirectory }),
      )

      const manifestPath = path.join(temporaryDirectory, '.claude-plugin', 'marketplace.json')
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as Record<string, unknown>

      expect(manifest).toEqual({
        plugins: [
          {
            source: './authored/engineering',
            name: 'engineering',
            skills: ['./skill-a'],
          },
        ],
      })
      expect(result.exitCode).toBe(0)
    })

    it('should create .claude-plugin directory if missing', async () => {
      await createSkill(temporaryDirectory, 'frappe', 'my-skill')

      const claudePluginDirectory = path.join(temporaryDirectory, '.claude-plugin')
      await expect(fs.stat(claudePluginDirectory)).rejects.toThrow()

      await Effect.runPromise(build({ root: temporaryDirectory }))

      const stat = await fs.stat(claudePluginDirectory)
      expect(stat.isDirectory()).toBe(true)
    })

    it('should produce identical output on subsequent runs (deterministic)', async () => {
      await createSkill(temporaryDirectory, 'engineering', 'skill-a')
      await createSkill(temporaryDirectory, 'engineering', 'skill-b')
      await createSkill(temporaryDirectory, 'frappe', 'skill-c')

      await Effect.runPromise(build({ root: temporaryDirectory }))
      const firstOutput = await fs.readFile(
        path.join(temporaryDirectory, '.claude-plugin', 'marketplace.json'),
        'utf8',
      )

      await Effect.runPromise(build({ root: temporaryDirectory }))
      const secondOutput = await fs.readFile(
        path.join(temporaryDirectory, '.claude-plugin', 'marketplace.json'),
        'utf8',
      )

      expect(secondOutput).toBe(firstOutput)
    })

    it('should generate empty plugins array when authored/ is empty', async () => {
      await fs.mkdir(path.join(temporaryDirectory, 'authored'), { recursive: true })

      await Effect.runPromise(build({ root: temporaryDirectory }))

      const manifest = JSON.parse(
        await fs.readFile(
          path.join(temporaryDirectory, '.claude-plugin', 'marketplace.json'),
          'utf8',
        ),
      ) as Record<string, unknown>

      expect(manifest).toEqual({ plugins: [] })
    })

    it('should generate empty plugins array when authored/ has no skill directories', async () => {
      await fs.mkdir(path.join(temporaryDirectory, 'authored', 'empty-domain'), { recursive: true })

      await Effect.runPromise(build({ root: temporaryDirectory }))

      const manifest = JSON.parse(
        await fs.readFile(
          path.join(temporaryDirectory, '.claude-plugin', 'marketplace.json'),
          'utf8',
        ),
      ) as Record<string, unknown>

      expect(manifest).toEqual({ plugins: [] })
    })
  })
})
