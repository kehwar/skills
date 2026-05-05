import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { exec, submoduleExists } from './gitOps.ts'

/**
 * Add or update a git submodule at `submodulePath` inside `root`.
 *
 * Three scenarios:
 * 1. Not registered: adds via `git submodule add`, then checks out the branch if given.
 * 2. Registered but directory missing: clones directly.
 * 3. Already exists: updates `.gitmodules` branch config, then fetches and checks out the branch.
 */
export function ensureSubmodule(
  root: string,
  submodulePath: string,
  url: string,
  branch?: string,
): void {
  const subDir = join(root, submodulePath)

  if (!submoduleExists(root, submodulePath)) {
    // Case 1: New submodule
    exec(
      `git submodule add --depth 1 ${url} ${submodulePath}`,
      { cwd: root, inherit: true },
    )
    if (branch) {
      exec(
        `git config -f .gitmodules submodule.${submodulePath}.branch ${branch}`,
        { cwd: root },
      )
      exec(
        `git fetch --depth 1 origin +refs/heads/${branch}:refs/remotes/origin/${branch}`,
        { cwd: subDir, inherit: true },
      )
      exec(`git checkout -B ${branch} FETCH_HEAD`, { cwd: subDir, inherit: true })
    }
  }
  else if (!existsSync(subDir)) {
    // Case 2: Registered but missing
    mkdirSync(subDir, { recursive: true })
    exec(
      `git clone --depth 1${branch ? ` -b ${branch}` : ''} ${url} ${subDir}`,
      { inherit: true },
    )
  }
  else {
    // Case 3: Exists, update branch if specified
    if (branch) {
      exec(
        `git config -f .gitmodules submodule.${submodulePath}.branch ${branch}`,
        { cwd: root },
      )
      exec(
        `git fetch --depth 1 origin +refs/heads/${branch}:refs/remotes/origin/${branch}`,
        { cwd: subDir, inherit: true },
      )
      exec(`git checkout -B ${branch} FETCH_HEAD`, { cwd: subDir, inherit: true })
    }
    else {
      exec(
        `git config -f .gitmodules --unset submodule.${submodulePath}.branch`,
        { cwd: root, safe: true },
      )
      exec('git fetch --depth 1', { cwd: subDir, inherit: true })
      exec('git reset --hard FETCH_HEAD', { cwd: subDir, inherit: true })
    }
  }
}
