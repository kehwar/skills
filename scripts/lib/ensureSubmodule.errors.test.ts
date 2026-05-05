import type { Result } from '../types.ts'
import { describe, expect, it } from 'vitest'
import { MockGitAdapter } from './gitAdapter.ts'
import { ensureSubmodule } from './submoduleOps.ts'

/**
 * FailingGitAdapter returns errors at specified points for testing error handling.
 */
class FailingGitAdapter extends MockGitAdapter {
  private failAt: string | null = null

  setFailurePoint(method: string): void {
    this.failAt = method
  }

  addSubmodule(root: string, url: string, path: string): Result<void> {
    if (this.failAt === 'addSubmodule') {
      return { ok: false, error: 'Mock: failed to add submodule' }
    }
    return super.addSubmodule(root, url, path)
  }

  initSubmodule(url: string, path: string, branch?: string): Result<void> {
    if (this.failAt === 'initSubmodule') {
      return { ok: false, error: 'Mock: failed to init submodule' }
    }
    return super.initSubmodule(url, path, branch)
  }

  fetchSubmodule(path: string, branch?: string): Result<void> {
    if (this.failAt === 'fetchSubmodule') {
      return { ok: false, error: 'Mock: failed to fetch' }
    }
    return super.fetchSubmodule(path, branch)
  }

  checkoutBranch(path: string, branch: string): Result<void> {
    if (this.failAt === 'checkoutBranch') {
      return { ok: false, error: 'Mock: failed to checkout' }
    }
    return super.checkoutBranch(path, branch)
  }
}

describe('ensureSubmodule error handling', () => {
  it('fails if add submodule fails', () => {
    const adapter = new FailingGitAdapter()
    adapter.setFailurePoint('addSubmodule')

    const result = ensureSubmodule('/root', 'upstream/foo', 'https://github.com/foo/bar', undefined, adapter)
    expect(result.ok).toBe(false)
    if (result.ok)
      throw new Error('Expected failure')
    expect(result.error).toContain('failed to add submodule')
  })

  it('propagates errors from fetch in new submodule with branch', () => {
    const adapter = new FailingGitAdapter()
    adapter.setFailurePoint('fetchSubmodule')

    const result = ensureSubmodule('/root', 'upstream/foo', 'https://github.com/foo/bar', 'main', adapter)
    expect(result.ok).toBe(false)
    if (result.ok)
      throw new Error('Expected failure')
    expect(result.error).toContain('failed to fetch')
  })

  it('propagates errors from checkout', () => {
    const adapter = new FailingGitAdapter()
    adapter.setFailurePoint('checkoutBranch')

    const result = ensureSubmodule('/root', 'upstream/foo', 'https://github.com/foo/bar', 'main', adapter)
    expect(result.ok).toBe(false)
    if (result.ok)
      throw new Error('Expected failure')
    expect(result.error).toContain('failed to checkout')
  })
})
