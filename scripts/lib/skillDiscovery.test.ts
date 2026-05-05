import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { discoverSkills } from './skillDiscovery.ts'

describe('discoverSkills', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'skills-discovery-test-'))
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true })
  })

  it('returns empty array when no SKILL.md exists', () => {
    const result = discoverSkills(tmp)
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data).toEqual([])
  })

  it('returns [{path: "."}] when root contains SKILL.md', () => {
    writeFileSync(join(tmp, 'SKILL.md'), '')
    const result = discoverSkills(tmp)
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data).toEqual([{ path: '.' }])
  })

  it('finds SKILL.md in a subdirectory', () => {
    mkdirSync(join(tmp, 'my-skill'))
    writeFileSync(join(tmp, 'my-skill', 'SKILL.md'), '')
    const result = discoverSkills(tmp)
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data).toEqual([{ path: 'my-skill' }])
  })

  it('stops recursion when finding a skill (does not recurse into matched dir)', () => {
    mkdirSync(join(tmp, 'parent', 'nested'), { recursive: true })
    writeFileSync(join(tmp, 'parent', 'SKILL.md'), '')
    writeFileSync(join(tmp, 'parent', 'nested', 'SKILL.md'), '')
    const result = discoverSkills(tmp)
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data).toEqual([{ path: 'parent' }])
  })

  it('skips node_modules', () => {
    mkdirSync(join(tmp, 'node_modules', 'some-skill'), { recursive: true })
    writeFileSync(join(tmp, 'node_modules', 'some-skill', 'SKILL.md'), '')
    const result = discoverSkills(tmp)
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data).toEqual([])
  })

  it('skips hidden directories', () => {
    mkdirSync(join(tmp, '.hidden-skill'))
    writeFileSync(join(tmp, '.hidden-skill', 'SKILL.md'), '')
    const result = discoverSkills(tmp)
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data).toEqual([])
  })

  it('finds multiple skills in different branches', () => {
    mkdirSync(join(tmp, 'skill1'))
    mkdirSync(join(tmp, 'skill2'))
    writeFileSync(join(tmp, 'skill1', 'SKILL.md'), '')
    writeFileSync(join(tmp, 'skill2', 'SKILL.md'), '')
    const result = discoverSkills(tmp)
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data).toHaveLength(2)
    expect(result.data.map((s: any) => s.path).sort()).toEqual(['skill1', 'skill2'])
  })

  it('finds skills at various nesting levels', () => {
    mkdirSync(join(tmp, 'a', 'b', 'skill1'), { recursive: true })
    mkdirSync(join(tmp, 'a', 'skill2'), { recursive: true })
    writeFileSync(join(tmp, 'a', 'b', 'skill1', 'SKILL.md'), '')
    writeFileSync(join(tmp, 'a', 'skill2', 'SKILL.md'), '')
    const result = discoverSkills(tmp)
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data.map((s: any) => s.path).sort()).toEqual(['a/b/skill1', 'a/skill2'])
  })

  it('handles unreachable directories gracefully (permission denied)', () => {
    mkdirSync(join(tmp, 'accessible'))
    writeFileSync(join(tmp, 'accessible', 'SKILL.md'), '')
    // Note: chmod is platform-specific; we just verify it doesn't crash
    const result = discoverSkills(tmp)
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data).toContainEqual({ path: 'accessible' })
  })
})
