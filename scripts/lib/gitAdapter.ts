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
    exec(`git submodule add --depth 1 ${url} ${path}`, { cwd: root, inherit: true })
  }

  initSubmodule(url: string, path: string, branch?: string): void {
    mkdirSync(path, { recursive: true })
    exec(`git clone --depth 1${branch ? ` -b ${branch}` : ''} ${url} ${path}`, {
      inherit: true,
    })
  }

  fetchSubmodule(path: string, branch?: string): void {
    if (branch) {
      exec(
        `git fetch --depth 1 origin +refs/heads/${branch}:refs/remotes/origin/${branch}`,
        { cwd: path, inherit: true },
      )
    }
    else {
      exec('git fetch --depth 1', { cwd: path, inherit: true })
    }
  }

  checkoutBranch(path: string, branch: string): void {
    exec(`git checkout -B ${branch} FETCH_HEAD`, { cwd: path, inherit: true })
  }

  setSubmoduleBranch(root: string, path: string, branch: string): void {
    exec(`git config -f .gitmodules submodule.${path}.branch ${branch}`, { cwd: root })
  }

  unsetSubmoduleBranch(root: string, path: string): void {
    exec(`git config -f .gitmodules --unset submodule.${path}.branch`, { cwd: root, safe: true })
  }
}
