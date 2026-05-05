import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { exec, getGitSha, submoduleExists } from './gitOps.ts'

// ── exec ─────────────────────────────────────────────────────────────────────

describe('exec', () => {
  it('returns trimmed stdout in result object', () => {
    const result = exec('echo hello')
    if (result.ok) {
      expect(result.output).toBe('hello')
    }
    else {
      throw new Error('Expected success')
    }
  })

  it('returns error result on failure', () => {
    const result = exec('false')
    if (!result.ok) {
      expect(result.error).toBeDefined()
      expect(result.code).toBeDefined()
    }
    else {
      throw new Error('Expected failure')
    }
  })

  it('returns success result for inherit variant', () => {
    const result = exec('echo hi', { inherit: true })
    if (result.ok) {
      expect(result.output).toBe('')
    }
    else {
      throw new Error('Expected success')
    }
  })

  it('respects cwd option', () => {
    const result = exec('pwd', { cwd: '/tmp' })
    if (result.ok) {
      expect(result.output).toContain('tmp')
    }
    else {
      throw new Error('Expected success')
    }
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
