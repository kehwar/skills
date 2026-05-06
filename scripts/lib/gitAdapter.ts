/**
 * GitAdapter abstracts git operations.
 * Enables testing without real git repos.
 * All operations return Result<void> for consistent error handling.
 */

import type { Result } from '../types.ts'
import { mkdirSync } from 'node:fs'
import { submoduleExists as checkSubmoduleExists, exec } from './gitOps.ts'

export interface GitAdapter {
  /**
   * Check if a submodule is registered in .gitmodules.
   */
  submoduleExists: (root: string, path: string) => boolean

  /**
   * Add a new submodule. Returns error if operation fails.
   */
  addSubmodule: (root: string, url: string, path: string) => Result<void>

  /**
   * Initialize a submodule directory (for when .git is missing).
   */
  initSubmodule: (url: string, path: string, branch?: string) => Result<void>

  /**
   * Fetch latest from origin for a submodule.
   */
  fetchSubmodule: (path: string, branch?: string) => Result<void>

  /**
   * Checkout a specific branch in a submodule.
   */
  checkoutBranch: (path: string, branch: string) => Result<void>

  /**
   * Set branch tracking in .gitmodules.
   */
  setSubmoduleBranch: (root: string, path: string, branch: string) => Result<void>

  /**
   * Unset branch tracking in .gitmodules (use default branch).
   */
  unsetSubmoduleBranch: (root: string, path: string) => Result<void>
}

export class MockGitAdapter implements GitAdapter {
  private registered: Set<string> = new Set()
  private calls: Array<{ method: string, args: unknown[] }> = []
  private shouldFail: Map<string, string> = new Map()

  submoduleExists(root: string, path: string): boolean {
    this.calls.push({ method: 'submoduleExists', args: [root, path] })
    return this.registered.has(path)
  }

  addSubmodule(root: string, url: string, path: string): Result<void> {
    this.calls.push({ method: 'addSubmodule', args: [root, url, path] })
    if (this.shouldFail.has('addSubmodule'))
      return { ok: false, error: this.shouldFail.get('addSubmodule')! }
    this.registered.add(path)
    return { ok: true, data: undefined }
  }

  initSubmodule(url: string, path: string, branch?: string): Result<void> {
    this.calls.push({ method: 'initSubmodule', args: [url, path, branch] })
    if (this.shouldFail.has('initSubmodule'))
      return { ok: false, error: this.shouldFail.get('initSubmodule')! }
    return { ok: true, data: undefined }
  }

  fetchSubmodule(path: string, branch?: string): Result<void> {
    this.calls.push({ method: 'fetchSubmodule', args: [path, branch] })
    if (this.shouldFail.has('fetchSubmodule'))
      return { ok: false, error: this.shouldFail.get('fetchSubmodule')! }
    return { ok: true, data: undefined }
  }

  checkoutBranch(path: string, branch: string): Result<void> {
    this.calls.push({ method: 'checkoutBranch', args: [path, branch] })
    if (this.shouldFail.has('checkoutBranch'))
      return { ok: false, error: this.shouldFail.get('checkoutBranch')! }
    return { ok: true, data: undefined }
  }

  setSubmoduleBranch(root: string, path: string, branch: string): Result<void> {
    this.calls.push({ method: 'setSubmoduleBranch', args: [root, path, branch] })
    if (this.shouldFail.has('setSubmoduleBranch'))
      return { ok: false, error: this.shouldFail.get('setSubmoduleBranch')! }
    return { ok: true, data: undefined }
  }

  unsetSubmoduleBranch(root: string, path: string): Result<void> {
    this.calls.push({ method: 'unsetSubmoduleBranch', args: [root, path] })
    if (this.shouldFail.has('unsetSubmoduleBranch'))
      return { ok: false, error: this.shouldFail.get('unsetSubmoduleBranch')! }
    return { ok: true, data: undefined }
  }

  /**
   * Get recorded method calls for assertions.
   */
  getCallSequence(): Array<{ method: string, args: unknown[] }> {
    return this.calls
  }

  /**
   * Clear call history (but keep registered state).
   */
  resetCalls(): void {
    this.calls = []
  }

  /**
   * Clear call history and registered state.
   */
  reset(): void {
    this.calls = []
    this.registered.clear()
    this.shouldFail.clear()
  }

  /**
   * Configure a method to return a failure result.
   */
  setFail(method: string, error: string): void {
    this.shouldFail.set(method, error)
  }

  /**
   * Clear the fail configuration for a method.
   */
  clearFail(method: string): void {
    this.shouldFail.delete(method)
  }
}

/**
 * Real git adapter using execSync.
 * Performs actual git operations, returning Results instead of throwing.
 */
export class RealGitAdapter implements GitAdapter {
  submoduleExists(root: string, path: string): boolean {
    return checkSubmoduleExists(root, path)
  }

  addSubmodule(root: string, url: string, path: string): Result<void> {
    const result = exec(`git submodule add --depth 1 ${url} ${path}`, { cwd: root, inherit: true })
    if (!result.ok)
      return { ok: false, error: `Failed to add submodule: ${result.error}` }
    return { ok: true, data: undefined }
  }

  initSubmodule(url: string, path: string, branch?: string): Result<void> {
    mkdirSync(path, { recursive: true })
    const branchArg = branch ? ` -b ${branch}` : ''
    const cloneCmd = `git clone --depth 1${branchArg} ${url} ${path}`
    const result = exec(cloneCmd, {
      inherit: true,
    })
    if (!result.ok)
      return { ok: false, error: `Failed to initialize submodule: ${result.error}` }
    return { ok: true, data: undefined }
  }

  fetchSubmodule(path: string, branch?: string): Result<void> {
    if (branch) {
      const result = exec(
        `git fetch --depth 1 origin +refs/heads/${branch}:refs/remotes/origin/${branch}`,
        { cwd: path, inherit: true },
      )
      if (!result.ok)
        return { ok: false, error: `Failed to fetch submodule branch: ${result.error}` }
    }
    else {
      // Fetch HEAD to a local ref to avoid ambiguous FETCH_HEAD warnings
      const result = exec('git fetch --depth 1 origin HEAD:refs/remotes/origin/HEAD', { cwd: path, inherit: true })
      if (!result.ok)
        return { ok: false, error: `Failed to fetch submodule: ${result.error}` }
    }
    return { ok: true, data: undefined }
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity
  checkoutBranch(path: string, branch: string): Result<void> {
    if (branch === 'FETCH_HEAD') {
      // Resolve the default remote branch and check it out
      const symRefResult = exec(`git symbolic-ref refs/remotes/origin/HEAD`, { cwd: path })

      if (symRefResult.ok) {
        // Extract branch name from symref like "refs/remotes/origin/main"
        const branches = symRefResult.data.trim().split('/')
        const defaultBranch = branches[branches.length - 1]

        if (defaultBranch && defaultBranch !== 'HEAD') {
          // Check out the default branch as a tracking branch
          const result = exec(`git checkout -B ${defaultBranch} refs/remotes/origin/${defaultBranch}`, { cwd: path, inherit: true })
          if (!result.ok)
            return { ok: false, error: `Failed to checkout branch: ${result.error}` }
          return { ok: true, data: undefined }
        }
      }

      // Fallback: detached HEAD at the remote HEAD
      const result = exec(`git checkout --detach refs/remotes/origin/HEAD`, { cwd: path, inherit: true })
      if (!result.ok)
        return { ok: false, error: `Failed to checkout detached HEAD: ${result.error}` }
      return { ok: true, data: undefined }
    }
    else {
      const result = exec(`git checkout -B ${branch} refs/remotes/origin/${branch}`, { cwd: path, inherit: true })
      if (!result.ok)
        return { ok: false, error: `Failed to checkout branch: ${result.error}` }
      return { ok: true, data: undefined }
    }
  }

  setSubmoduleBranch(root: string, path: string, branch: string): Result<void> {
    const result = exec(`git config -f .gitmodules submodule.${path}.branch ${branch}`, { cwd: root })
    if (!result.ok)
      return { ok: false, error: `Failed to set submodule branch: ${result.error}` }
    return { ok: true, data: undefined }
  }

  unsetSubmoduleBranch(root: string, path: string): Result<void> {
    exec(`git config -f .gitmodules --unset submodule.${path}.branch`, { cwd: root })
    // Ignore errors on unset (it's ok if the key doesn't exist)
    return { ok: true, data: undefined }
  }
}
