import type { Result } from '../types.ts'
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
 *
 * Returns Result<void> — { ok: true, data: undefined } on success,
 * or { ok: false, error: string } if any step fails.
 */
export function ensureSubmodule(
  root: string,
  submodulePath: string,
  url: string,
  branch?: string,
  adapter: GitAdapter = new RealGitAdapter(),
): Result<void> {
  const subDir = join(root, submodulePath)

  if (!adapter.submoduleExists(root, submodulePath)) {
    // Case 1: Not registered - add it
    const addResult = adapter.addSubmodule(root, url, submodulePath)
    if (!addResult.ok)
      return addResult
    if (branch) {
      const setBranchResult = adapter.setSubmoduleBranch(root, submodulePath, branch)
      if (!setBranchResult.ok)
        return setBranchResult
      const fetchResult = adapter.fetchSubmodule(subDir, branch)
      if (!fetchResult.ok)
        return fetchResult
      const checkoutResult = adapter.checkoutBranch(subDir, branch)
      if (!checkoutResult.ok)
        return checkoutResult
    }
  }
  else if (!existsSync(subDir)) {
    // Case 2: Registered but directory missing - clone it
    const initResult = adapter.initSubmodule(url, subDir, branch)
    if (!initResult.ok)
      return initResult
    if (branch) {
      const checkoutResult = adapter.checkoutBranch(subDir, branch)
      if (!checkoutResult.ok)
        return checkoutResult
    }
  }
  else {
    // Case 3: Exists - update branch if specified
    if (branch) {
      const setBranchResult = adapter.setSubmoduleBranch(root, submodulePath, branch)
      if (!setBranchResult.ok)
        return setBranchResult
      const fetchResult = adapter.fetchSubmodule(subDir, branch)
      if (!fetchResult.ok)
        return fetchResult
      const checkoutResult = adapter.checkoutBranch(subDir, branch)
      if (!checkoutResult.ok)
        return checkoutResult
    }
    else {
      const unsetResult = adapter.unsetSubmoduleBranch(root, submodulePath)
      if (!unsetResult.ok)
        return unsetResult
      const fetchResult = adapter.fetchSubmodule(subDir)
      if (!fetchResult.ok)
        return fetchResult
      const checkoutResult = adapter.checkoutBranch(subDir, 'FETCH_HEAD')
      if (!checkoutResult.ok)
        return checkoutResult
    }
  }

  return { ok: true, data: undefined }
}
