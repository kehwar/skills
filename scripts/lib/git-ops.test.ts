import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { exec, getGitSha, submoduleExists } from './git-ops.ts'

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
    const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'exec-cwd-test-'))
    try {
      const result = exec('pwd', { cwd: temporaryDirectory })
      expect(result.ok).toBe(true)
      if (!result.ok) {
        throw new Error(result.error)
      }
      expect(result.data).toContain('exec-cwd-test-')
    }
    finally {
      rmSync(temporaryDirectory, { recursive: true })
    }
  })
})

// ── submoduleExists ───────────────────────────────────────────────────────────

describe('submoduleExists', () => {
  let temporary: string
  beforeEach(() => {
    temporary = mkdtempSync(path.join(tmpdir(), 'skills-test-'))
  })
  afterEach(() => {
    rmSync(temporary, { recursive: true })
  })

  it('returns false when .gitmodules does not exist', () => {
    expect(submoduleExists(temporary, 'upstream/foo')).toBe(false)
  })

  it('returns false when .gitmodules does not contain the path', () => {
    writeFileSync(path.join(temporary, '.gitmodules'), '[submodule "upstream/bar"]\n\tpath = upstream/bar\n')
    expect(submoduleExists(temporary, 'upstream/foo')).toBe(false)
  })

  it('returns true when .gitmodules contains the path', () => {
    writeFileSync(path.join(temporary, '.gitmodules'), '[submodule "upstream/foo"]\n\tpath = upstream/foo\n')
    expect(submoduleExists(temporary, 'upstream/foo')).toBe(true)
  })
})

// ── getGitSha ─────────────────────────────────────────────────────────────────

describe('getGitSha', () => {
  let temporary: string
  beforeEach(() => {
    temporary = mkdtempSync(path.join(tmpdir(), 'skills-test-'))
  })
  afterEach(() => {
    rmSync(temporary, { recursive: true })
  })

  it('returns null for a non-git directory', () => {
    expect(getGitSha(temporary)).toBeUndefined()
  })

  it('returns a sha string for a git repo', () => {
    exec('git init', { cwd: temporary })
    exec('git config user.email "test@test.com"', { cwd: temporary })
    exec('git config user.name "Test"', { cwd: temporary })
    writeFileSync(path.join(temporary, 'file.txt'), 'hello')
    exec('git add .', { cwd: temporary })
    exec('git commit -m "init"', { cwd: temporary })
    const sha = getGitSha(temporary)
    expect(sha).toMatch(/^[\da-f]{40}$/)
  })
})
