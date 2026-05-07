/**
 * Clock — Effect-based time operations.
 *
 * Provides access to current time in various formats.
 * Can be mocked in tests for deterministic behavior.
 *
 * Example:
 * ```typescript
 * // Get current time
 * const date = Effect.runSync(now())
 *
 * // Get ISO 8601 timestamp
 * const iso = Effect.runSync(iso8601())
 * ```
 */

import { Effect } from 'effect'

/**
 * Get the current date and time.
 *
 * @returns Effect that returns current Date object
 *
 * @example
 * ```typescript
 * const currentTime = Effect.runSync(now())
 * // currentTime: Date object
 * ```
 */
export function now(): Effect.Effect<Date, never> {
  return Effect.sync(() => new Date())
}

/**
 * Get the current time as ISO 8601 string.
 *
 * @returns Effect that returns ISO 8601 formatted timestamp
 *
 * @example
 * ```typescript
 * const timestamp = Effect.runSync(iso8601())
 * // timestamp: "2025-05-07T12:34:56.789Z"
 * ```
 */
export function iso8601(): Effect.Effect<string, never> {
  return Effect.sync(() => new Date().toISOString())
}
