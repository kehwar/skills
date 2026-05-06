import type { Result } from '../types.ts'
import type { GitAdapter } from './git-adapter.ts'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { RealGitAdapter } from './git-adapter.ts'

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
  const subDirectory = path.join(root, submodulePath)

  if (!adapter.submoduleExists(root, submodulePath)) {
    return handleNotRegistered(root, submodulePath, url, subDirectory, branch, adapter)
  }

  if (!existsSync(subDirectory)) {
    return handleMissingDirectory(url, subDirectory, branch, adapter)
  }

  return handleExistingSubmodule(root, submodulePath, subDirectory, branch, adapter)
}

function handleNotRegistered(
  root: string,
  submodulePath: string,
  url: string,
  subDirectory: string,
  branch: string | undefined,
  adapter: GitAdapter,
): Result<void> {
  // Case 1: Not registered - add it
  const addResult = adapter.addSubmodule(root, url, submodulePath)
  if (!addResult.ok)
    return addResult

  if (branch) {
    return setupBranch(root, submodulePath, subDirectory, branch, adapter)
  }
  return { ok: true, data: undefined }
}

function handleMissingDirectory(
  url: string,
  subDirectory: string,
  branch: string | undefined,
  adapter: GitAdapter,
): Result<void> {
  // Case 2: Registered but directory missing - clone it
  const initResult = adapter.initSubmodule(url, subDirectory, branch)
  if (!initResult.ok)
    return initResult

  if (branch) {
    const checkoutResult = adapter.checkoutBranch(subDirectory, branch)
    if (!checkoutResult.ok)
      return checkoutResult
  }
  return { ok: true, data: undefined }
}

function handleExistingSubmodule(
  root: string,
  submodulePath: string,
  subDirectory: string,
  branch: string | undefined,
  adapter: GitAdapter,
): Result<void> {
  // Case 3: Exists - update branch if specified
  return branch ? setupBranch(root, submodulePath, subDirectory, branch, adapter) : checkoutDefaultBranch(root, submodulePath, subDirectory, adapter)
}

function setupBranch(
  root: string,
  submodulePath: string,
  subDirectory: string,
  branch: string,
  adapter: GitAdapter,
): Result<void> {
  const setBranchResult = adapter.setSubmoduleBranch(root, submodulePath, branch)
  if (!setBranchResult.ok)
    return setBranchResult

  const fetchResult = adapter.fetchSubmodule(subDirectory, branch)
  if (!fetchResult.ok)
    return fetchResult

  const checkoutResult = adapter.checkoutBranch(subDirectory, branch)
  if (!checkoutResult.ok)
    return checkoutResult

  return { ok: true, data: undefined }
}

function checkoutDefaultBranch(
  root: string,
  submodulePath: string,
  subDirectory: string,
  adapter: GitAdapter,
): Result<void> {
  const unsetResult = adapter.unsetSubmoduleBranch(root, submodulePath)
  if (!unsetResult.ok)
    return unsetResult

  const fetchResult = adapter.fetchSubmodule(subDirectory)
  if (!fetchResult.ok)
    return fetchResult

  const checkoutResult = adapter.checkoutBranch(subDirectory, 'FETCH_HEAD')
  if (!checkoutResult.ok)
    return checkoutResult

  return { ok: true, data: undefined }
}
