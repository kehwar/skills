import { describe, expect, it, vi } from 'vitest'
import { MockGitAdapter } from './gitAdapter.ts'
import { ensureSubmodule } from './submoduleOps.ts'

/**
 * FailingGitAdapter throws at specified points for testing error handling.
 */
class FailingGitAdapter extends MockGitAdapter {
  private failAt: string | null = null

  setFailurePoint(method: string): void {
    this.failAt = method
  }

  submoduleExists(root: string, path: string): boolean {
    if (this.failAt === 'submoduleExists') {
      throw new Error('Mock: failed to check submodule')
    }
    return super.submoduleExists(root, path)
  }

  addSubmodule(root: string, url: string, path: string): void {
    if (this.failAt === 'addSubmodule') {
      throw new Error('Mock: failed to add submodule')
    }
    super.addSubmodule(root, url, path)
  }

  initSubmodule(url: string, path: string, branch?: string): void {
    if (this.failAt === 'initSubmodule') {
      throw new Error('Mock: failed to init submodule')
    }
    super.initSubmodule(url, path, branch)
  }

  fetchSubmodule(path: string, branch?: string): void {
    if (this.failAt === 'fetchSubmodule') {
      throw new Error('Mock: failed to fetch')
    }
    super.fetchSubmodule(path, branch)
  }

  checkoutBranch(path: string, branch: string): void {
    if (this.failAt === 'checkoutBranch') {
      throw new Error('Mock: failed to checkout')
    }
    super.checkoutBranch(path, branch)
  }
}

describe('ensureSubmodule error handling', () => {
  it('fails if submodule check fails', () => {
    const adapter = new FailingGitAdapter()
    adapter.setFailurePoint('submoduleExists')

    expect(() => {
      ensureSubmodule('/root', 'upstream/foo', 'https://github.com/foo/bar', undefined, adapter)
    }).toThrow('Mock: failed to check submodule')
  })

  it('fails if add submodule fails', () => {
    const adapter = new FailingGitAdapter()
    adapter.setFailurePoint('addSubmodule')

    expect(() => {
      ensureSubmodule('/root', 'upstream/foo', 'https://github.com/foo/bar', undefined, adapter)
    }).toThrow('Mock: failed to add submodule')
  })

  it('propagates errors from fetch in new submodule with branch', () => {
    const adapter = new FailingGitAdapter()
    // Start failing only after add succeeds
    let callCount = 0
    const origFetch = adapter.fetchSubmodule.bind(adapter)
    vi.spyOn(adapter, 'fetchSubmodule').mockImplementation((path, branch) => {
      callCount++
      if (callCount > 0) {
        throw new Error('Mock: failed to fetch')
      }
      origFetch(path, branch)
    })

    expect(() => {
      ensureSubmodule('/root', 'upstream/foo', 'https://github.com/foo/bar', 'main', adapter)
    }).toThrow('Mock: failed to fetch')
  })

  it('propagates errors from checkout', () => {
    const adapter = new FailingGitAdapter()
    // Start failing only after fetch succeeds
    let callCount = 0
    vi.spyOn(adapter, 'checkoutBranch').mockImplementation(() => {
      callCount++
      if (callCount > 0) {
        throw new Error('Mock: failed to checkout')
      }
    })

    expect(() => {
      ensureSubmodule('/root', 'upstream/foo', 'https://github.com/foo/bar', 'main', adapter)
    }).toThrow('Mock: failed to checkout')
  })
})
