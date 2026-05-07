/**
 * Process — Effect-based process operations.
 *
 * Provides access to process information and control.
 * Can be used to get environment variables, current working directory.
 *
 * Example:
 * ```typescript
 * // Get current working directory
 * const dir = Effect.runSync(cwd())
 *
 * // Get environment variable
 * const nodeEnv = Effect.runSync(environment('NODE_ENV'))
 * ```
 */

import process from 'node:process'
import { Effect } from 'effect'

/**
 * Exit code — Signals the application to exit with a specific code.
 * The actual process exit should be handled by CLI layer.
 */
export class ExitCode extends Error {
  constructor(readonly code: number) {
    super(`Exit with code: ${code}`)
    this.name = 'ExitCode'
  }
}

/**
 * Request process exit with a specific code.
 * Should be caught by CLI layer and handled with process.exit().
 *
 * @param code — Exit code (0 for success, non-zero for error)
 * @returns Effect that signals exit
 *
 * @example
 * ```typescript
 * // Request exit with success
 * Effect.runSync(requestExit(0))
 *
 * // Request exit with error
 * Effect.runSync(requestExit(1))
 * ```
 */
export function requestExit(code: number): Effect.Effect<never, ExitCode> {
  return Effect.fail(new ExitCode(code))
}

/**
 * Get the current working directory.
 *
 * @returns Effect that returns the absolute path of current directory
 *
 * @example
 * ```typescript
 * const currentDir = Effect.runSync(cwd())
 * // currentDir: '/home/user/project'
 * ```
 */
export function cwd(): Effect.Effect<string, never> {
  return Effect.sync(() => process.cwd())
}

/**
 * Get an environment variable.
 *
 * @param key — Environment variable name
 * @returns Effect that returns the value or undefined if not set
 *
 * @example
 * ```typescript
 * const nodeEnv = Effect.runSync(environment('NODE_ENV'))
 * // nodeEnv: 'production' | 'development' | undefined
 *
 * const path = Effect.runSync(environment('PATH'))
 * // path: '/usr/local/bin:/usr/bin:...'
 * ```
 */
export function environment(key: string): Effect.Effect<string | undefined, never> {
  return Effect.sync(() => process.env[key])
}
