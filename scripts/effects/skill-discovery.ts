/**
 * Skill Discovery — Effect-based recursive skill discovery.
 *
 * ## Dependency Injection Pattern
 *
 * This module demonstrates filesystem operations using Layer 1 primitives (readDir).
 * It builds domain logic on top of the fs Layer 1 service.
 *
 * Example:
 * ```typescript
 * // Discover all skills
 * const skills = Effect.runSync(discoverSkills('/path/to/skills'))
 *
 * // With error handling
 * const effect = Effect.match(discoverSkills(dir), {
 *   onSuccess: skills => console.log(`Found ${skills.length} skills`),
 *   onFailure: error => console.error(error.message)
 * })
 * ```
 */

import type { Dirent } from 'node:fs'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { Effect } from 'effect'

/**
 * DiscoveryError — Failed to discover skills in directory.
 */
export class DiscoveryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiscoveryError'
  }
}

/**
 * Skill entry found during discovery.
 */
export interface Skill {
  /** Path relative to root, or "." if root itself is a skill */
  path: string
}

/**
 * Recursively discover directories containing SKILL.md files.
 *
 * Behavior:
 * - Walks directory tree looking for SKILL.md files
 * - Returns "." if root directory itself contains SKILL.md
 * - Skips node_modules and hidden directories (starting with .)
 * - Does not recurse into matched skill directories
 * - Returns relative paths from root
 *
 * @param directory — Root directory to search
 * @returns Effect that succeeds with array of Skill paths, fails with DiscoveryError
 *
 * @example
 * ```typescript
 * const skills = Effect.runSync(discoverSkills('/path/to/skills'))
 * // skills[0] might be { path: 'vue' } or { path: 'frappe/frappe-app-include-js' }
 * ```
 */
export function discoverSkills(directory: string): Effect.Effect<Skill[], DiscoveryError> {
  return Effect.sync(() => {
    const results: Skill[] = []

    function walk(current: string): void {
      let entries: Dirent[]
      try {
        entries = readdirSync(current, { withFileTypes: true })
      }
      catch {
        // Permission denied or other errors - skip this directory
        return
      }

      // Check if current directory is a skill
      if (entries.some(entry => entry.isFile() && entry.name === 'SKILL.md')) {
        const relativePath = path.relative(directory, current) || '.'
        results.push({ path: relativePath })
        return // Stop recursion for this branch
      }

      // Recurse into subdirectories
      for (const entry of entries) {
        if (
          entry.isDirectory()
          && entry.name !== 'node_modules'
          && !entry.name.startsWith('.')
        ) {
          walk(path.join(current, entry.name))
        }
      }
    }

    try {
      walk(directory)
      return results
    }
    catch (error) {
      throw new DiscoveryError(
        `Failed to discover skills: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  })
}
