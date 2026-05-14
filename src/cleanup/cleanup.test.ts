import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'
import { Effect } from 'effect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('cleanup', () => {
  let temporaryDirectory: string

  beforeEach(async () => {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'cleanup-'))
  })

  afterEach(async () => {
    await fs.rm(temporaryDirectory, { recursive: true, force: true })
  })

  async function writeMeta(upstreams: Record<string, { skills: Record<string, string> }>): Promise<void> {
    await fs.writeFile(
      path.join(temporaryDirectory, 'meta.json'),
      JSON.stringify({ upstreams }),
    )
  }

  async function createSkillsDirectory(name: string): Promise<void> {
    const directory = path.join(temporaryDirectory, 'skills', name)
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(path.join(directory, 'SKILL.md'), `# ${name}`)
  }

  it('removes a single orphaned skill folder from skills/', async () => {
    await writeMeta({ testupstream: { skills: {} } })
    await createSkillsDirectory('orphan-skill')

    const { cleanup } = await import('./cleanup.js')
    const result = await Effect.runPromise(cleanup({ root: temporaryDirectory }))

    expect(result.removed).toEqual(['orphan-skill'])
    expect(result.exitCode).toBe(0)

    const orphanExists = await fs.stat(
      path.join(temporaryDirectory, 'skills', 'orphan-skill'),
    ).then(() => true).catch(() => false)
    expect(orphanExists).toBe(false)
  })

  it('removes multiple orphaned skill folders', async () => {
    await writeMeta({ testupstream: { skills: {} } })
    await createSkillsDirectory('orphan-a')
    await createSkillsDirectory('orphan-b')

    const { cleanup } = await import('./cleanup.js')
    const result = await Effect.runPromise(cleanup({ root: temporaryDirectory }))

    expect(result.removed).toEqual(expect.arrayContaining(['orphan-a', 'orphan-b']))
    expect(result.removed).toHaveLength(2)
    expect(result.exitCode).toBe(0)

    const aExists = await fs.stat(path.join(temporaryDirectory, 'skills', 'orphan-a')).then(() => true).catch(() => false)
    const bExists = await fs.stat(path.join(temporaryDirectory, 'skills', 'orphan-b')).then(() => true).catch(() => false)
    expect(aExists).toBe(false)
    expect(bExists).toBe(false)
  })

  it('does not remove declared skills', async () => {
    await writeMeta({ testupstream: { skills: { 'some/path': 'declared-skill' } } })
    await createSkillsDirectory('declared-skill')
    await createSkillsDirectory('orphan-skill')

    const { cleanup } = await import('./cleanup.js')
    const result = await Effect.runPromise(cleanup({ root: temporaryDirectory }))

    expect(result.removed).toEqual(['orphan-skill'])

    const declaredExists = await fs.stat(
      path.join(temporaryDirectory, 'skills', 'declared-skill'),
    ).then(() => true).catch(() => false)
    expect(declaredExists).toBe(true)
  })

  it('never touches authored/ directory', async () => {
    await writeMeta({ testupstream: { skills: {} } })

    const authoredDirectory = path.join(temporaryDirectory, 'authored', 'engineering', 'my-skill')
    await fs.mkdir(authoredDirectory, { recursive: true })
    await fs.writeFile(path.join(authoredDirectory, 'SKILL.md'), '# My Skill')

    const { cleanup } = await import('./cleanup.js')
    const result = await Effect.runPromise(cleanup({ root: temporaryDirectory }))

    expect(result.exitCode).toBe(0)

    const authoredExists = await fs.stat(authoredDirectory).then(() => true).catch(() => false)
    expect(authoredExists).toBe(true)
  })

  it('handles missing skills/ directory gracefully', async () => {
    await writeMeta({ testupstream: { skills: {} } })

    const { cleanup } = await import('./cleanup.js')
    const result = await Effect.runPromise(cleanup({ root: temporaryDirectory }))

    expect(result.exitCode).toBe(0)
    expect(result.removed).toEqual([])
  })

  it('handles missing meta.json gracefully', async () => {
    const { cleanup } = await import('./cleanup.js')
    const result = await Effect.runPromise(cleanup({ root: temporaryDirectory }))

    expect(result.exitCode).toBe(0)
    expect(result.removed).toEqual([])
  })

  it('removes orphans from multiple upstreams when upstream is removed entirely', async () => {
    await writeMeta({
      upstreamA: { skills: { 'skills/a': 'skill-a' } },
      upstreamB: { skills: { 'skills/b': 'skill-b' } },
    })
    await createSkillsDirectory('skill-a')
    await createSkillsDirectory('skill-b')
    await createSkillsDirectory('skill-c')

    const { cleanup } = await import('./cleanup.js')
    const result = await Effect.runPromise(cleanup({ root: temporaryDirectory }))

    expect(result.removed).toEqual(['skill-c'])

    const aExists = await fs.stat(path.join(temporaryDirectory, 'skills', 'skill-a')).then(() => true).catch(() => false)
    const bExists = await fs.stat(path.join(temporaryDirectory, 'skills', 'skill-b')).then(() => true).catch(() => false)
    expect(aExists).toBe(true)
    expect(bExists).toBe(true)
  })

  it('exit code is 1 when cleanup encounters an error', async () => {
    await fs.writeFile(path.join(temporaryDirectory, 'meta.json'), 'not valid json')

    const { cleanup } = await import('./cleanup.js')
    const result = await Effect.runPromise(cleanup({ root: temporaryDirectory }))

    expect(result.exitCode).toBe(1)
  })
})
