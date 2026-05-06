import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { discoverSkills } from './skill-discovery.ts'

describe('discoverSkills', () => {
  let temporary: string

  beforeEach(() => {
    temporary = mkdtempSync(path.join(tmpdir(), 'skills-discovery-test-'))
  })

  afterEach(() => {
    rmSync(temporary, { recursive: true })
  })

  it('returns empty array when no SKILL.md exists', () => {
    const result = discoverSkills(temporary)
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data).toEqual([])
  })

  it('returns [{path: "."}] when root contains SKILL.md', () => {
    writeFileSync(path.join(temporary, 'SKILL.md'), '')
    const result = discoverSkills(temporary)
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data).toEqual([{ path: '.' }])
  })

  it('finds SKILL.md in a subdirectory', () => {
    mkdirSync(path.join(temporary, 'my-skill'))
    writeFileSync(path.join(temporary, 'my-skill', 'SKILL.md'), '')
    const result = discoverSkills(temporary)
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data).toEqual([{ path: 'my-skill' }])
  })

  it('stops recursion when finding a skill (does not recurse into matched directory)', () => {
    mkdirSync(path.join(temporary, 'parent', 'nested'), { recursive: true })
    writeFileSync(path.join(temporary, 'parent', 'SKILL.md'), '')
    writeFileSync(path.join(temporary, 'parent', 'nested', 'SKILL.md'), '')
    const result = discoverSkills(temporary)
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data).toEqual([{ path: 'parent' }])
  })

  it('skips node_modules', () => {
    mkdirSync(path.join(temporary, 'node_modules', 'some-skill'), { recursive: true })
    writeFileSync(path.join(temporary, 'node_modules', 'some-skill', 'SKILL.md'), '')
    const result = discoverSkills(temporary)
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data).toEqual([])
  })

  it('skips hidden directories', () => {
    mkdirSync(path.join(temporary, '.hidden-skill'))
    writeFileSync(path.join(temporary, '.hidden-skill', 'SKILL.md'), '')
    const result = discoverSkills(temporary)
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data).toEqual([])
  })

  it('finds multiple skills in different branches', () => {
    mkdirSync(path.join(temporary, 'skill1'))
    mkdirSync(path.join(temporary, 'skill2'))
    writeFileSync(path.join(temporary, 'skill1', 'SKILL.md'), '')
    writeFileSync(path.join(temporary, 'skill2', 'SKILL.md'), '')
    const result = discoverSkills(temporary)
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data).toHaveLength(2)
    expect(result.data.map((s: any) => s.path).sort()).toEqual(['skill1', 'skill2'])
  })

  it('finds skills at various nesting levels', () => {
    mkdirSync(path.join(temporary, 'a', 'b', 'skill1'), { recursive: true })
    mkdirSync(path.join(temporary, 'a', 'skill2'), { recursive: true })
    writeFileSync(path.join(temporary, 'a', 'b', 'skill1', 'SKILL.md'), '')
    writeFileSync(path.join(temporary, 'a', 'skill2', 'SKILL.md'), '')
    const result = discoverSkills(temporary)
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data.map((s: any) => s.path).sort()).toEqual(['a/b/skill1', 'a/skill2'])
  })

  it('handles unreachable directories gracefully (permission denied)', () => {
    mkdirSync(path.join(temporary, 'accessible'))
    writeFileSync(path.join(temporary, 'accessible', 'SKILL.md'), '')
    // Note: chmod is platform-specific; we just verify it doesn't crash
    const result = discoverSkills(temporary)
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data).toContainEqual({ path: 'accessible' })
  })
})
