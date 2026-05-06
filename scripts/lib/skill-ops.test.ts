import type { SkillMeta, UpstreamMeta } from '../types.ts'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { copySkillsFromUpstream } from './skill-ops.ts'

describe('copySkillsFromUpstream', () => {
  let temporary: string
  let upstreamDirectory: string
  let root: string

  beforeEach(() => {
    temporary = mkdtempSync(path.join(tmpdir(), 'skills-test-'))
    upstreamDirectory = path.join(temporary, 'upstream', 'my-upstream')
    root = path.join(temporary, 'root')
    mkdirSync(path.join(upstreamDirectory, 'my-skill'), { recursive: true })
    mkdirSync(path.join(root, 'skills'), { recursive: true })
    writeFileSync(path.join(upstreamDirectory, 'my-skill', 'SKILL.md'), '# My Skill')
  })

  afterEach(() => {
    rmSync(temporary, { recursive: true })
  })

  it('copies skill files to skills/<outputName>', () => {
    const config: UpstreamMeta = {
      url: 'https://example.com/my-upstream',
      skills: { 'my-skill': 'my-skill' },
    }
    const result = copySkillsFromUpstream('my-upstream', upstreamDirectory, config, root)
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data.synced).toHaveLength(1)
    expect(existsSync(path.join(root, 'skills', 'my-skill', 'SKILL.md'))).toBe(true)
  })

  it('writes meta.json with a real contentHash (not "pending")', () => {
    const config: UpstreamMeta = {
      url: 'https://example.com/my-upstream',
      skills: { 'my-skill': 'my-skill' },
    }
    const result = copySkillsFromUpstream('my-upstream', upstreamDirectory, config, root)
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data.synced).toHaveLength(1)
    const meta = JSON.parse(readFileSync(path.join(root, 'skills', 'my-skill', 'meta.json'), 'utf8')) as SkillMeta
    expect(meta.type).toBe('synced')
    if (meta.type === 'synced') {
      expect(meta.contentHash).not.toBe('pending')
      expect(meta.contentHash).toMatch(/^[\da-f]{12}$/)
    }
  })

  it('copies LICENSE to LICENSE.md', () => {
    writeFileSync(path.join(upstreamDirectory, 'LICENSE'), 'MIT License')
    const config: UpstreamMeta = {
      url: 'https://example.com/my-upstream',
      skills: { 'my-skill': 'my-skill' },
    }
    const result = copySkillsFromUpstream('my-upstream', upstreamDirectory, config, root)
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(existsSync(path.join(root, 'skills', 'my-skill', 'LICENSE.md'))).toBe(true)
  })

  it('copies LICENSE.txt to LICENSE.md', () => {
    writeFileSync(path.join(upstreamDirectory, 'LICENSE.txt'), 'MIT License')
    const config: UpstreamMeta = {
      url: 'https://example.com/my-upstream',
      skills: { 'my-skill': 'my-skill' },
    }
    const result = copySkillsFromUpstream('my-upstream', upstreamDirectory, config, root)
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(existsSync(path.join(root, 'skills', 'my-skill', 'LICENSE.md'))).toBe(true)
  })

  it('resets the output directory removing stale files', () => {
    const outputPath = path.join(root, 'skills', 'my-skill')
    mkdirSync(outputPath, { recursive: true })
    writeFileSync(path.join(outputPath, 'stale.txt'), 'stale')
    const config: UpstreamMeta = {
      url: 'https://example.com/my-upstream',
      skills: { 'my-skill': 'my-skill' },
    }
    const result = copySkillsFromUpstream('my-upstream', upstreamDirectory, config, root)
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(existsSync(path.join(outputPath, 'stale.txt'))).toBe(false)
  })

  it('does not create output directory when source path is missing', () => {
    const config: UpstreamMeta = {
      url: 'https://example.com/my-upstream',
      skills: { 'nonexistent-skill': 'nonexistent-skill' },
    }
    const result = copySkillsFromUpstream('my-upstream', upstreamDirectory, config, root)
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data.skipped).toHaveLength(1)
    expect(existsSync(path.join(root, 'skills', 'nonexistent-skill'))).toBe(false)
  })

  it('writes correct synced meta.json fields', () => {
    const config: UpstreamMeta = {
      url: 'https://github.com/org/my-upstream',
      branch: 'main',
      skills: { 'my-skill': 'out-skill' },
    }
    const result = copySkillsFromUpstream('my-upstream', upstreamDirectory, config, root)
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data.synced).toHaveLength(1)
    const meta = JSON.parse(readFileSync(path.join(root, 'skills', 'out-skill', 'meta.json'), 'utf8')) as SkillMeta
    expect(meta.type).toBe('synced')
    if (meta.type === 'synced') {
      expect(meta.upstream).toBe('my-upstream')
      expect(meta.sourceUrl).toBe('https://github.com/org/my-upstream')
      expect(meta.branch).toBe('main')
      expect(meta.skillPath).toBe('my-skill')
    }
  })
})
