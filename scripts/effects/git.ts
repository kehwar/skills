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
 * const sha = await Effect.runPromise(getHeadSha())
 *
 * // With error handling
 * pipe(
 *   checkoutBranch('feature-branch'),
 *   Effect.catch(InvalidBranch, () => console.log('Branch does not exist')),
 *   Effect.runPromise
 * )
 * ```
 *
 * ## Git Command Execution
 *
 * All operations use @npmcli/git for safe command execution.
 * Errors are caught and mapped to custom error types.
 */

import process from 'node:process'
import { spawn } from '@npmcli/git'
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
 * Helper to execute git commands using @npmcli/git.
 * Returns an Effect that resolves to the command output.
 */
function runGitCommand(
  subcommand: string,
  ...commandArguments: string[]
): Effect.Effect<string, CommandFailed | GitNotFound> {
  return Effect.tryPromise({
    try: async () => {
      // spawn from @npmcli/git - types don't match runtime
      const result = (await spawn([subcommand, ...commandArguments], {
        cwd: process.cwd(),
      })) as any
      // spawn returns { cmd, args, code, signal, stdout, stderr }
      if (result.code !== 0) {
        throw new Error(`Git command failed with code ${result.code}: ${result.stderr}`)
      }
      return (result.stdout || '').toString().trim()
    },
    catch: (error) => {
      if (error instanceof GitNotFound) {
        return error
      }
      if (error instanceof Error) {
        const message = error.message
        if (message.includes('not found') || message.includes('ENOENT') || message.includes('git not found')) {
          return new GitNotFound()
        }
      }
      const command = [subcommand, ...commandArguments].join(' ')
      return new CommandFailed(command, (error as Error).message)
    },
  })
}

/**
 * Execute a known git command and return its output.
 * For safety, use specific functions like getHeadSha(), checkoutBranch(), etc.
 * This function is for commands not covered by specific wrappers.
 *
 * @param subcommand — First git subcommand (e.g., 'status', 'log')
 * @param commandArguments — Arguments for the subcommand
 * @returns Effect that executes the command and returns stdout
 * @throws CommandFailed if command fails
 * @throws GitNotFound if git is not installed
 *
 * @example
 * ```typescript
 * const status = await Effect.runPromise(exec('status'))
 * const log = await Effect.runPromise(exec('log', '--oneline', '-5'))
 * ```
 */
export function exec(subcommand: string, ...commandArguments: string[]): Effect.Effect<string, CommandFailed | GitNotFound> {
  return runGitCommand(subcommand, ...commandArguments)
}

/**
 * Execute a known git command and return its output.
 * Alias for exec() for explicit naming.
 *
 * @param subcommand — First git subcommand (e.g., 'status', 'log')
 * @param commandArguments — Arguments for the subcommand
 * @returns Effect that executes the command and returns stdout
 * @throws CommandFailed if command fails
 * @throws GitNotFound if git is not installed
 */
export function runGitOperation(subcommand: string, ...commandArguments: string[]): Effect.Effect<string, CommandFailed | GitNotFound> {
  return runGitCommand(subcommand, ...commandArguments)
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
 * const sha = await Effect.runPromise(getHeadSha())
 * // sha: 'a1b2c3d4e5f6...'
 * ```
 */
export function getHeadSha(): Effect.Effect<string, CommandFailed | GitNotFound> {
  return runGitCommand('rev-parse', 'HEAD')
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
 * await Effect.runPromise(addSubmodule('https://github.com/user/repo.git', 'vendor/repo'))
 * ```
 */
export function addSubmodule(url: string, path: string): Effect.Effect<void, CommandFailed | GitNotFound> {
  return Effect.map(runGitCommand('submodule', 'add', url, path), () => {})
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
 * await Effect.runPromise(initSubmodule('vendor/repo'))
 * ```
 */
export function initSubmodule(path: string): Effect.Effect<void, CommandFailed | GitNotFound> {
  return Effect.map(runGitCommand('submodule', 'init', path), () => {})
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
 * await Effect.runPromise(fetchSubmodule('vendor/repo'))
 * ```
 */
export function fetchSubmodule(path: string): Effect.Effect<void, CommandFailed | GitNotFound> {
  return Effect.map(
    runGitCommand('-C', path, 'fetch'),
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
 * await Effect.runPromise(setSubmoduleBranch('vendor/repo', 'main'))
 * ```
 */
export function setSubmoduleBranch(path: string, branch: string): Effect.Effect<void, CommandFailed | InvalidBranch | GitNotFound> {
  return Effect.map(
    runGitCommand('config', '-f', '.gitmodules', `submodule.${path}.branch`, branch),
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
 * await Effect.runPromise(checkoutBranch('feature-branch'))
 * ```
 */
export function checkoutBranch(branch: string): Effect.Effect<void, CommandFailed | InvalidBranch | GitNotFound> {
  return Effect.flatMap(runGitCommand('checkout', branch), () => {
    // Verify branch was checked out
    return Effect.map(runGitCommand('rev-parse', '--abbrev-ref', 'HEAD'), (current) => {
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
 * await Effect.runPromise(deinitSubmodule('vendor/repo'))
 * ```
 */
export function deinitSubmodule(path: string): Effect.Effect<void, CommandFailed | GitNotFound> {
  return Effect.map(runGitCommand('submodule', 'deinit', '-f', path), () => {})
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
 * await Effect.runPromise(removeSubmoduleFromGitmodules('vendor/repo'))
 * ```
 */
export function removeSubmoduleFromGitmodules(path: string): Effect.Effect<void, CommandFailed | GitNotFound> {
  return Effect.map(
    runGitCommand('config', '--file', '.gitmodules', '--remove-section', `submodule.${path}`),
    () => {},
  )
}

/**
 * Count commits in a reference range.
 *
 * @param gitReference — Git reference (e.g., 'HEAD', 'origin/main..HEAD')
 * @returns Effect that returns count of commits
 * @throws CommandFailed if count fails
 *
 * @example
 * ```typescript
 * const count = await Effect.runPromise(revListCount('origin/main..HEAD'))
 * ```
 */
export function revListCount(
  gitReference: string,
): Effect.Effect<number, CommandFailed> {
  return Effect.map(runGitCommand('rev-list', '--count', gitReference), (output) => {
    const count = Number.parseInt(output, 10)
    return Number.isNaN(count) ? 0 : count
  })
}
