import type { GitAdapter } from './gitAdapter.ts'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { RealGitAdapter } from './gitAdapter.ts'

/**
 * Add or update a git submodule at `submodulePath` inside `root`.
 *
 * Simplified logic using GitAdapter:
 * 1. If not registered: add submodule, then set branch and fetch/checkout if branch given
 * 2. If registered but directory missing: clone directly with branch if given
 * 3. If exists: update branch config and fetch/checkout the new branch, or unset/fetch/checkout for default
 */
export function ensureSubmodule(
  root: string,
  submodulePath: string,
  url: string,
  branch?: string,
  adapter: GitAdapter = new RealGitAdapter(),
): void {
  const subDir = join(root, submodulePath)

  if (!adapter.submoduleExists(root, submodulePath)) {
    // Case 1: Not registered - add it
    adapter.addSubmodule(root, url, submodulePath)
    if (branch) {
      adapter.setSubmoduleBranch(root, submodulePath, branch)
      adapter.fetchSubmodule(subDir, branch)
      adapter.checkoutBranch(subDir, branch)
    }
  }
  else if (!existsSync(subDir)) {
    // Case 2: Registered but directory missing - clone it
    adapter.initSubmodule(url, subDir, branch)
    if (branch) {
      adapter.checkoutBranch(subDir, branch)
    }
  }
  else {
    // Case 3: Exists - update branch if specified
    if (branch) {
      adapter.setSubmoduleBranch(root, submodulePath, branch)
      adapter.fetchSubmodule(subDir, branch)
      adapter.checkoutBranch(subDir, branch)
    }
    else {
      adapter.unsetSubmoduleBranch(root, submodulePath)
      adapter.fetchSubmodule(subDir)
      adapter.checkoutBranch(subDir, 'FETCH_HEAD')
    }
  }
}
