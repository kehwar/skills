/**
 * Logger — Effect-based logging operations.
 *
 * Provides structured logging with indentation levels.
 * Can be extended to support different log backends (console, files, telemetry).
 *
 * Example:
 * ```typescript
 * // Log info message
 * Effect.runSync(log('info', 'Sync started'))
 *
 * // Log with indentation
 * Effect.runSync(indent('Processing file.txt', 1))
 * ```
 */

import { Effect } from 'effect'

/**
 * Log a message at a specific level.
 *
 * @param level — Log level: 'info' | 'warn' | 'error' | 'debug'
 * @param message — Message to log
 * @returns Effect that performs the logging
 *
 * @example
 * ```typescript
 * Effect.runSync(log('info', 'Operation started'))
 * Effect.runSync(log('error', 'Failed to read file'))
 * ```
 */
export function log(level: 'info' | 'warn' | 'error' | 'debug', message: string): Effect.Effect<void, never> {
  return Effect.sync(() => {
    const timestamp = new Date().toISOString()
    const formatted = `[${timestamp}] [${level.toUpperCase()}] ${message}`

    if (level === 'error') {
      console.error(formatted)
    }
    else if (level === 'warn') {
      console.warn(formatted)
    }
    else {
      console.log(formatted)
    }
  })
}

/**
 * Log an indented message for hierarchical output.
 *
 * @param message — Message to log
 * @param level — Indentation level (0-n, each level = 2 spaces)
 * @returns Effect that performs the indented logging
 *
 * @example
 * ```typescript
 * Effect.runSync(indent('Processing...', 0))
 * Effect.runSync(indent('File A', 1))
 * Effect.runSync(indent('Status: ok', 2))
 * ```
 */
export function indent(message: string, level = 0): Effect.Effect<void, never> {
  return Effect.sync(() => {
    const indentation = '  '.repeat(Math.max(0, level))
    console.log(`${indentation}${message}`)
  })
}
