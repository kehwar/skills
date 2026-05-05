import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { exec, getGitSha, submoduleExists } from './gitOps.ts'

// ── exec ─────────────────────────────────────────────────────────────────────

describe('exec', () => {
  it('returns trimmed stdout in result object', () => {
    const result = exec('echo hello')
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data).toBe('hello')
  })

  it('returns error result on failure', () => {
    const result = exec('false')
    expect(result.ok).toBe(false)
    if (result.ok)
      throw new Error('Expected failure')
    expect(result.error).toBeDefined()
  })

  it('returns success result for inherit variant', () => {
    const result = exec('echo hi', { inherit: true })
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data).toBe('')
  })

  it('respects cwd option', () => {
    const result = exec('pwd', { cwd: '/tmp' })
    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.data).toContain('tmp')
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
