/**
 * Meta I/O — Effect-based metadata loading and saving.
 *
 * ## Dependency Injection Pattern
 *
 * This module demonstrates validation and serialization logic using Effect:
 * - **Validation**: Parse JSON and validate Meta structure
 * - **Error Handling**: Custom error type (InvalidMetaFormat) propagates via Effect's error channel
 * - **Deterministic Serialization**: Upstreams sorted alphabetically for stable output
 *
 * Example:
 * ```typescript
 * // Load and validate
 * const meta = Effect.runSync(loadMeta(jsonString))
 *
 * // Save with consistent formatting
 * const json = Effect.runSync(saveMeta(meta))
 * ```
 */

import type { Meta } from '../types.js'
import { Effect } from 'effect'

/**
 * InvalidMetaFormat — meta.json structure does not match expected schema.
 */
export class InvalidMetaFormat extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidMetaFormat'
  }
}

/**
 * Load and validate meta.json content from JSON string.
 *
 * Validates:
 * - JSON is valid
 * - Structure has 'upstreams' field
 * - 'upstreams' is an object (not array or primitive)
 * - Each upstream has 'url' field
 *
 * @param json — JSON string content of meta.json
 * @returns Effect that succeeds with validated Meta, fails with InvalidMetaFormat
 *
 * @example
 * ```typescript
 * // Success
 * const meta = Effect.runSync(loadMeta('{"upstreams":{"key":{"url":"..."}}}'))
 *
 * // Error
 * const effect = Effect.match(loadMeta('invalid'), {
 *   onSuccess: () => 'ok',
 *   onFailure: error => error.message
 * })
 * ```
 */
export function loadMeta(json: string): Effect.Effect<Meta, InvalidMetaFormat> {
  let parsed: unknown

  try {
    parsed = JSON.parse(json)
  }
  catch (error) {
    return Effect.fail(new InvalidMetaFormat(`Failed to parse meta.json: ${error instanceof Error ? error.message : String(error)}`))
  }

  // Validate structure
  if (!parsed || typeof parsed !== 'object') {
    return Effect.fail(new InvalidMetaFormat('Invalid meta.json: must be an object'))
  }

  if (!('upstreams' in parsed)) {
    return Effect.fail(new InvalidMetaFormat('Invalid meta.json: upstreams field is required'))
  }

  const upstreams = (parsed as Record<string, unknown>).upstreams
  if (typeof upstreams !== 'object' || Array.isArray(upstreams) || upstreams === null) {
    return Effect.fail(new InvalidMetaFormat('Invalid meta.json: upstreams must be an object'))
  }

  // Validate each upstream has url
  for (const [key, upstream] of Object.entries(upstreams)) {
    if (typeof upstream !== 'object' || upstream === null) {
      return Effect.fail(new InvalidMetaFormat(`Invalid meta.json: upstream "${key}" must be an object`))
    }
    if (!('url' in upstream)) {
      return Effect.fail(new InvalidMetaFormat(`Invalid meta.json: upstream "${key}" must have a url field`))
    }
  }

  return Effect.succeed(parsed as Meta)
}

/**
 * Serialize Meta to JSON string with deterministic formatting.
 *
 * - Upstreams are sorted alphabetically by key
 * - JSON is indented with 2 spaces
 * - Output ends with newline
 *
 * @param meta — Meta object to serialize
 * @returns Effect that succeeds with formatted JSON string
 *
 * @example
 * ```typescript
 * const json = Effect.runSync(saveMeta(meta))
 * // json === '{\n  "upstreams": {...}\n}\n'
 * ```
 */
export function saveMeta(meta: Meta): Effect.Effect<string, never> {
  // Sort upstreams alphabetically
  const sorted = Object.fromEntries(
    Object.entries(meta.upstreams).sort(([a], [b]) => a.localeCompare(b)),
  )

  const toWrite = { upstreams: sorted }

  // Format with 2-space indentation and trailing newline
  return Effect.succeed(`${JSON.stringify(toWrite, undefined, 2)}\n`)
}
