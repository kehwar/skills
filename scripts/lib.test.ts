import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { exec, findSkillDirs, getGitSha, submoduleExists } from './lib.ts'

// ── exec ─────────────────────────────────────────────────────────────────────

describe('exec', () => {
  it('returns trimmed stdout', () => {
    expect(exec('echo hello')).toBe('hello')
  })

  it('returns null on failure when safe: true', () => {
    expect(exec('false', { safe: true })).toBeNull()
  })

  it('throws on failure by default', () => {
    expect(() => exec('false')).toThrow()
  })

  it('returns undefined (void) for inherit variant', () => {
    const result = exec('echo hi', { inherit: true })
    expect(result).toBeUndefined()
  })

  it('respects cwd option', () => {
    const result = exec('pwd', { cwd: '/tmp' })
    expect(result).toContain('tmp')
  })
})

// ── submoduleExists ───────────────────────────────────────────────────────────

describe('submoduleExists', () => {
  let tmp: string
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'skills-test-')) })
  afterEach(() => { rmSync(tmp, { recursive: true }) })

  it('returns false when .gitmodules does not exist', () => {
    expect(submoduleExists(tmp, 'upstream/foo')).toBe(false)
  })

  it('returns false when .gitmodules does not contain the path', () => {
    writeFileSync(join(tmp, '.gitmodules'), '[submodule "upstream/bar"]\n\tpath = upstream/bar\n')
    expect(submoduleExists(tmp, 'upstream/foo')).toBe(false)
  })

  it('returns true when .gitmodules contains the path', () => {
    writeFileSync(join(tmp, '.gitmodules'), '[submodule "upstream/foo"]\n\tpath = upstream/foo\n')
    expect(submoduleExists(tmp, 'upstream/foo')).toBe(true)
  })
})

// ── findSkillDirs ─────────────────────────────────────────────────────────────

describe('findSkillDirs', () => {
  let tmp: string
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'skills-test-')) })
  afterEach(() => { rmSync(tmp, { recursive: true }) })

  it('returns empty array when no SKILL.md exists', () => {
    expect(findSkillDirs(tmp)).toEqual([])
  })

  it('finds SKILL.md in a subdirectory', () => {
    mkdirSync(join(tmp, 'my-skill'))
    writeFileSync(join(tmp, 'my-skill', 'SKILL.md'), '')
    expect(findSkillDirs(tmp)).toEqual(['my-skill'])
  })

  it('returns "." when root itself contains SKILL.md', () => {
    writeFileSync(join(tmp, 'SKILL.md'), '')
    expect(findSkillDirs(tmp)).toEqual(['.'])
  })

  it('skips node_modules', () => {
    mkdirSync(join(tmp, 'node_modules', 'some-skill'), { recursive: true })
    writeFileSync(join(tmp, 'node_modules', 'some-skill', 'SKILL.md'), '')
    expect(findSkillDirs(tmp)).toEqual([])
  })

  it('does not recurse into a matched directory', () => {
    mkdirSync(join(tmp, 'parent', 'nested'), { recursive: true })
    writeFileSync(join(tmp, 'parent', 'SKILL.md'), '')
    writeFileSync(join(tmp, 'parent', 'nested', 'SKILL.md'), '')
    expect(findSkillDirs(tmp)).toEqual(['parent'])
  })
})

// ── getGitSha ─────────────────────────────────────────────────────────────────

describe('getGitSha', () => {
  let tmp: string
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'skills-test-')) })
  afterEach(() => { rmSync(tmp, { recursive: true }) })

  it('returns null for a non-git directory', () => {
    expect(getGitSha(tmp)).toBeNull()
  })

  it('returns a sha string for a git repo', () => {
    exec('git init', { cwd: tmp })
    exec('git config user.email "test@test.com"', { cwd: tmp })
    exec('git config user.name "Test"', { cwd: tmp })
    writeFileSync(join(tmp, 'file.txt'), 'hello')
    exec('git add .', { cwd: tmp })
    exec('git commit -m "init"', { cwd: tmp })
    const sha = getGitSha(tmp)
    expect(sha).toMatch(/^[0-9a-f]{40}$/)
  })
})
