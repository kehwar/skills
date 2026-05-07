/**
 * Process — Effect-based process operations.
 *
 * Provides access to process information and control.
 * Can be used to get environment variables, current working directory, and exit the process.
 *
 * Example:
 * ```typescript
 * // Get current working directory
 * const dir = Effect.runSync(cwd())
 *
 * // Get environment variable
 * const nodeEnv = Effect.runSync(env('NODE_ENV'))
 *
 * // Exit process
 * Effect.runSync(exit(0))
 * ```
 */

import process from 'node:process'
import { Effect } from 'effect'

/**
 * Exit the process with a specific code.
 *
 * @param code — Exit code (0 for success, non-zero for error)
 * @returns Effect that exits the process
 *
 * @example
 * ```typescript
 * // Exit with success
 * Effect.runSync(exit(0))
 *
 * // Exit with error
 * Effect.runSync(exit(1))
 * ```
 */
export function exit(code: number): Effect.Effect<void, never> {
  return Effect.sync(() => {
    // eslint-disable-next-line unicorn/no-process-exit -- process.exit is intended for CLI entry points
    process.exit(code)
  })
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
 * const nodeEnv = Effect.runSync(env('NODE_ENV'))
 * // nodeEnv: 'production' | 'development' | undefined
 *
 * const path = Effect.runSync(env('PATH'))
 * // path: '/usr/local/bin:/usr/bin:...'
 * ```
 */
// eslint-disable-next-line unicorn/prevent-abbreviations -- env is the standard name for environment variable access
export function env(key: string): Effect.Effect<string | undefined, never> {
  return Effect.sync(() => process.env[key])
}
