import { describe, expect, it } from 'vitest'
import { MockGitAdapter } from './gitAdapter.ts'

/**
 * This test models how ensureSubmodule() should work with GitAdapter.
 * Currently RED because ensureSubmodule() hasn't been refactored yet.
 */
describe('ensureSubmodule with GitAdapter', () => {
  it('adds new submodule with branch', () => {
    const adapter = new MockGitAdapter()
    const root = '/root'
    const path = 'upstream/antfu'
    const url = 'https://github.com/antfu/skills'
    const branch = 'main'

    // Workflow: new submodule with branch
    if (!adapter.submoduleExists(root, path)) {
      adapter.addSubmodule(root, url, path)
      if (branch) {
        adapter.setSubmoduleBranch(root, path, branch)
        adapter.fetchSubmodule(path, branch)
        adapter.checkoutBranch(path, branch)
      }
    }

    const calls = adapter.getCallSequence().map((c: { method: string, args: unknown[] }) => c.method)
    expect(calls).toEqual(['submoduleExists', 'addSubmodule', 'setSubmoduleBranch', 'fetchSubmodule', 'checkoutBranch'])
  })

  it('initializes missing submodule directory', () => {
    const adapter = new MockGitAdapter()
    const root = '/root'
    const path = 'upstream/frappe'
    const url = 'https://github.com/frappe/frappe'
    const branch = 'develop'

    // Pre-register (simulating already in .gitmodules)
    adapter.addSubmodule(root, url, path)
    adapter.reset()

    // Workflow: directory missing, need to init
    if (!adapter.submoduleExists(root, path)) {
      adapter.initSubmodule(url, path, branch)
      if (branch) {
        adapter.checkoutBranch(path, branch)
      }
    }

    const calls = adapter.getCallSequence().map((c: { method: string, args: unknown[] }) => c.method)
    expect(calls).toEqual(['submoduleExists', 'initSubmodule', 'checkoutBranch'])
  })

  it('updates existing submodule with new branch', () => {
    const adapter = new MockGitAdapter()
    const root = '/root'
    const path = 'upstream/erpnext'
    const url = 'https://github.com/frappe/erpnext'
    const newBranch = 'develop'

    // Pre-register
    adapter.addSubmodule(root, url, path)
    adapter.resetCalls()

    // Workflow: exists with old branch, update to new branch
    if (adapter.submoduleExists(root, path)) {
      if (newBranch) {
        adapter.setSubmoduleBranch(root, path, newBranch)
        adapter.fetchSubmodule(path, newBranch)
        adapter.checkoutBranch(path, newBranch)
      }
    }

    const calls = adapter.getCallSequence().map((c: { method: string, args: unknown[] }) => c.method)
    expect(calls).toEqual(['submoduleExists', 'setSubmoduleBranch', 'fetchSubmodule', 'checkoutBranch'])
  })

  it('updates existing submodule without branch (uses default)', () => {
    const adapter = new MockGitAdapter()
    const root = '/root'
    const path = 'upstream/press'
    const url = 'https://github.com/frappe/press'

    // Pre-register
    adapter.addSubmodule(root, url, path)
    adapter.setSubmoduleBranch(root, path, 'main')
    adapter.resetCalls()

    // Workflow: exists, switch to default branch (no branch arg)
    if (adapter.submoduleExists(root, path)) {
      // No branch specified, use default
      adapter.unsetSubmoduleBranch(root, path)
      adapter.fetchSubmodule(path)
      adapter.checkoutBranch(path, 'FETCH_HEAD')
    }

    const calls = adapter.getCallSequence().map((c: { method: string, args: unknown[] }) => c.method)
    expect(calls).toEqual(['submoduleExists', 'unsetSubmoduleBranch', 'fetchSubmodule', 'checkoutBranch'])
  })
})
