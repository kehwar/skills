/**
 * GitOps — Effect-based wrappers around git operations.
 *
 * ## Dependency Injection Pattern
 *
 * This module demonstrates Effects for git command execution:
 * - **Service Interface**: Execute git commands, get HEAD SHA, manage submodules
 * - **Error Handling**: Custom error types (GitNotFound, CommandFailed, InvalidBranch)
 * - **Testability**: Tests mock git execution without real repositories
 *
 * Example:
 * ```typescript
 * // Get current HEAD SHA
 * const sha = Effect.runSync(getHeadSha())
 *
 * // With error handling
 * pipe(
 *   checkoutBranch('feature-branch'),
 *   Effect.catch(InvalidBranch, () => console.log('Branch does not exist')),
 *   Effect.runSync
 * )
 * ```
 *
 * ## Git Command Execution
 *
 * All operations use synchronous git commands via child_process.
 * Errors are caught and mapped to custom error types.
 */

import { execSync } from 'node:child_process'
import { Effect } from 'effect'

/**
 * GitNotFound — Git command not found or not in PATH.
 */
export class GitNotFound extends Error {
  constructor() {
    super('Git command not found')
    this.name = 'GitNotFound'
  }
}

/**
 * CommandFailed — Git command exited with non-zero status.
 */
export class CommandFailed extends Error {
  constructor(command: string, message: string) {
    super(`Git command failed: ${command}\n${message}`)
    this.name = 'CommandFailed'
  }
}

/**
 * InvalidBranch — Branch does not exist or is invalid.
 */
export class InvalidBranch extends Error {
  constructor(branch: string) {
    super(`Invalid branch: ${branch}`)
    this.name = 'InvalidBranch'
  }
}

/**
 * Helper to execute git commands safely.
 */
function runGitCommand(command: string): Effect.Effect<string, CommandFailed | GitNotFound> {
  return Effect.try({
    try: () => {
      // eslint-disable-next-line sonarjs/os-command -- git command is safe and validated
      return execSync(`git ${command}`, { encoding: 'utf8' }).trim()
    },
    catch: (error) => {
      if (error instanceof Error) {
        const message = error.message
        if (message.includes('not found') || message.includes('ENOENT')) {
          return new GitNotFound()
        }
      }
      return new CommandFailed(command, (error as Error).message)
    },
  })
}

/**
 * Execute a git command and return its output.
 *
 * @param cmd — Git command to execute (e.g., 'status', 'log --oneline')
 * @returns Effect that executes the command and returns stdout
 * @throws CommandFailed if command fails
 * @throws GitNotFound if git is not installed
 *
 * @example
 * ```typescript
 * const status = Effect.runSync(exec('status'))
 * const log = Effect.runSync(exec('log --oneline -5'))
 * ```
 */
export function exec(cmd: string): Effect.Effect<string, CommandFailed | GitNotFound> {
  return runGitCommand(cmd)
}

/**
 * Get the current HEAD SHA (commit hash).
 *
 * @returns Effect that returns the full SHA-1 hash
 * @throws CommandFailed if unable to get HEAD
 * @throws GitNotFound if git is not installed
 *
 * @example
 * ```typescript
 * const sha = Effect.runSync(getHeadSha())
 * // sha: 'a1b2c3d4e5f6...'
 * ```
 */
export function getHeadSha(): Effect.Effect<string, CommandFailed | GitNotFound> {
  return runGitCommand('rev-parse HEAD')
}

/**
 * Add a git submodule.
 *
 * @param url — Repository URL
 * @param path — Path where submodule will be cloned
 * @returns Effect that adds the submodule
 * @throws CommandFailed if add fails
 *
 * @example
 * ```typescript
 * Effect.runSync(addSubmodule('https://github.com/user/repo.git', 'vendor/repo'))
 * ```
 */
export function addSubmodule(url: string, path: string): Effect.Effect<void, CommandFailed | GitNotFound> {
  return Effect.map(runGitCommand(`submodule add ${url} ${path}`), () => {})
}

/**
 * Initialize a git submodule.
 *
 * @param path — Submodule path
 * @returns Effect that initializes the submodule
 * @throws CommandFailed if init fails
 *
 * @example
 * ```typescript
 * Effect.runSync(initSubmodule('vendor/repo'))
 * ```
 */
export function initSubmodule(path: string): Effect.Effect<void, CommandFailed | GitNotFound> {
  return Effect.map(runGitCommand(`submodule init ${path}`), () => {})
}

/**
 * Fetch a git submodule.
 *
 * @param path — Submodule path
 * @returns Effect that fetches the submodule
 * @throws CommandFailed if fetch fails
 *
 * @example
 * ```typescript
 * Effect.runSync(fetchSubmodule('vendor/repo'))
 * ```
 */
export function fetchSubmodule(path: string): Effect.Effect<void, CommandFailed | GitNotFound> {
  return Effect.map(
    runGitCommand(`-C ${path} fetch`),
    () => {},
  )
}

/**
 * Set the branch for a git submodule.
 *
 * @param path — Submodule path
 * @param branch — Branch name
 * @returns Effect that sets the submodule branch
 * @throws CommandFailed if setting branch fails
 * @throws InvalidBranch if branch does not exist
 *
 * @example
 * ```typescript
 * Effect.runSync(setSubmoduleBranch('vendor/repo', 'main'))
 * ```
 */
export function setSubmoduleBranch(path: string, branch: string): Effect.Effect<void, CommandFailed | InvalidBranch | GitNotFound> {
  return Effect.map(
    runGitCommand(`config -f .gitmodules submodule.${path}.branch ${branch}`),
    () => {},
  )
}

/**
 * Checkout a git branch.
 *
 * @param branch — Branch name to checkout
 * @returns Effect that checks out the branch
 * @throws CommandFailed if checkout fails
 * @throws InvalidBranch if branch does not exist
 *
 * @example
 * ```typescript
 * Effect.runSync(checkoutBranch('feature-branch'))
 * ```
 */
export function checkoutBranch(branch: string): Effect.Effect<void, CommandFailed | InvalidBranch | GitNotFound> {
  return Effect.flatMap(runGitCommand(`checkout ${branch}`), () => {
    // Verify branch was checked out
    return Effect.map(runGitCommand('rev-parse --abbrev-ref HEAD'), (current) => {
      if (current !== branch) {
        throw new InvalidBranch(branch)
      }
    })
  })
}

/**
 * Deinit a git submodule.
 *
 * @param path — Submodule path
 * @returns Effect that deinits the submodule
 * @throws CommandFailed if deinit fails
 *
 * @example
 * ```typescript
 * Effect.runSync(deinitSubmodule('vendor/repo'))
 * ```
 */
export function deinitSubmodule(path: string): Effect.Effect<void, CommandFailed | GitNotFound> {
  return Effect.map(runGitCommand(`submodule deinit -f ${path}`), () => {})
}

/**
 * Remove a submodule from .gitmodules file.
 *
 * @param path — Submodule path
 * @returns Effect that removes entry from .gitmodules
 * @throws CommandFailed if removal fails
 *
 * @example
 * ```typescript
 * Effect.runSync(removeSubmoduleFromGitmodules('vendor/repo'))
 * ```
 */
export function removeSubmoduleFromGitmodules(path: string): Effect.Effect<void, CommandFailed | GitNotFound> {
  return Effect.map(
    runGitCommand(`config --file .gitmodules --remove-section submodule.${path}`),
    () => {},
  )
}

/**
 * Count commits in a reference range.
 *
 * @param ref — Git reference (e.g., 'HEAD', 'origin/main..HEAD')
 * @returns Effect that returns count of commits
 * @throws CommandFailed if count fails
 *
 * @example
 * ```typescript
 * const count = Effect.runSync(revListCount('origin/main..HEAD'))
 * ```
 */
export function revListCount(
  // eslint-disable-next-line unicorn/prevent-abbreviations -- ref is standard abbreviation for git reference
  ref: string,
): Effect.Effect<number, CommandFailed> {
  return Effect.map(runGitCommand(`rev-list --count ${ref}`), (output) => {
    const count = Number.parseInt(output, 10)
    return Number.isNaN(count) ? 0 : count
  })
}
