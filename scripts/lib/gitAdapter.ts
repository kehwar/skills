/**
 * GitAdapter abstracts git operations.
 * Enables testing without real git repos.
 */

import { mkdirSync } from 'node:fs'
import { submoduleExists as checkSubmoduleExists, exec } from './gitOps.ts'

export interface GitAdapter {
  /**
   * Check if a submodule is registered in .gitmodules.
   */
  submoduleExists: (root: string, path: string) => boolean

  /**
   * Add a new submodule.
   */
  addSubmodule: (root: string, url: string, path: string) => void

  /**
   * Initialize a submodule directory (for when .git is missing).
   */
  initSubmodule: (url: string, path: string, branch?: string) => void

  /**
   * Fetch latest from origin for a submodule.
   */
  fetchSubmodule: (path: string, branch?: string) => void

  /**
   * Checkout a specific branch in a submodule.
   */
  checkoutBranch: (path: string, branch: string) => void

  /**
   * Set branch tracking in .gitmodules.
   */
  setSubmoduleBranch: (root: string, path: string, branch: string) => void

  /**
   * Unset branch tracking in .gitmodules (use default branch).
   */
  unsetSubmoduleBranch: (root: string, path: string) => void
}

export class MockGitAdapter implements GitAdapter {
  private registered: Set<string> = new Set()
  private calls: Array<{ method: string, args: unknown[] }> = []

  submoduleExists(root: string, path: string): boolean {
    this.calls.push({ method: 'submoduleExists', args: [root, path] })
    return this.registered.has(path)
  }

  addSubmodule(root: string, url: string, path: string): void {
    this.calls.push({ method: 'addSubmodule', args: [root, url, path] })
    this.registered.add(path)
  }

  initSubmodule(url: string, path: string, branch?: string): void {
    this.calls.push({ method: 'initSubmodule', args: [url, path, branch] })
  }

  fetchSubmodule(path: string, branch?: string): void {
    this.calls.push({ method: 'fetchSubmodule', args: [path, branch] })
  }

  checkoutBranch(path: string, branch: string): void {
    this.calls.push({ method: 'checkoutBranch', args: [path, branch] })
  }

  setSubmoduleBranch(root: string, path: string, branch: string): void {
    this.calls.push({ method: 'setSubmoduleBranch', args: [root, path, branch] })
  }

  unsetSubmoduleBranch(root: string, path: string): void {
    this.calls.push({ method: 'unsetSubmoduleBranch', args: [root, path] })
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
  }
}

/**
 * Real git adapter using execSync.
 * Performs actual git operations.
 */
export class RealGitAdapter implements GitAdapter {
  submoduleExists(root: string, path: string): boolean {
    return checkSubmoduleExists(root, path)
  }

  addSubmodule(root: string, url: string, path: string): void {
    const result = exec(`git submodule add --depth 1 ${url} ${path}`, { cwd: root, inherit: true })
    if (!result.ok)
      throw new Error(`Failed to add submodule: ${result.error}`)
  }

  initSubmodule(url: string, path: string, branch?: string): void {
    mkdirSync(path, { recursive: true })
    const result = exec(`git clone --depth 1${branch ? ` -b ${branch}` : ''} ${url} ${path}`, {
      inherit: true,
    })
    if (!result.ok)
      throw new Error(`Failed to initialize submodule: ${result.error}`)
  }

  fetchSubmodule(path: string, branch?: string): void {
    if (branch) {
      const result = exec(
        `git fetch --depth 1 origin +refs/heads/${branch}:refs/remotes/origin/${branch}`,
        { cwd: path, inherit: true },
      )
      if (!result.ok)
        throw new Error(`Failed to fetch submodule branch: ${result.error}`)
    }
    else {
      // Fetch HEAD to a local ref to avoid ambiguous FETCH_HEAD warnings
      const result = exec('git fetch --depth 1 origin HEAD:refs/remotes/origin/HEAD', { cwd: path, inherit: true })
      if (!result.ok)
        throw new Error(`Failed to fetch submodule: ${result.error}`)
    }
  }

  checkoutBranch(path: string, branch: string): void {
    if (branch === 'FETCH_HEAD') {
      // Resolve the default remote branch and check it out
      const symRefResult = exec(`git symbolic-ref refs/remotes/origin/HEAD`, { cwd: path })

      if (symRefResult.ok) {
        // Extract branch name from symref like "refs/remotes/origin/main"
        const branches = symRefResult.output.trim().split('/')
        const defaultBranch = branches[branches.length - 1]

        if (defaultBranch && defaultBranch !== 'HEAD') {
          // Check out the default branch as a tracking branch
          const result = exec(`git checkout -B ${defaultBranch} refs/remotes/origin/${defaultBranch}`, { cwd: path, inherit: true })
          if (!result.ok)
            throw new Error(`Failed to checkout branch: ${result.error}`)
          return
        }
      }

      // Fallback: detached HEAD at the remote HEAD
      const result = exec(`git checkout --detach refs/remotes/origin/HEAD`, { cwd: path, inherit: true })
      if (!result.ok)
        throw new Error(`Failed to checkout detached HEAD: ${result.error}`)
    }
    else {
      const result = exec(`git checkout -B ${branch} refs/remotes/origin/${branch}`, { cwd: path, inherit: true })
      if (!result.ok)
        throw new Error(`Failed to checkout branch: ${result.error}`)
    }
  }

  setSubmoduleBranch(root: string, path: string, branch: string): void {
    const result = exec(`git config -f .gitmodules submodule.${path}.branch ${branch}`, { cwd: root })
    if (!result.ok)
      throw new Error(`Failed to set submodule branch: ${result.error}`)
  }

  unsetSubmoduleBranch(root: string, path: string): void {
    const _result = exec(`git config -f .gitmodules --unset submodule.${path}.branch`, { cwd: root })
    // Ignore errors on unset (it's ok if the key doesn't exist)
  }
}
