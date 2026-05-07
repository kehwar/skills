/**
 * Skill Discovery — Effect-based recursive skill discovery.
 *
 * ## Dependency Injection Pattern
 *
 * This module demonstrates filesystem operations using Layer 1 primitives (readDirectory, exists).
 * It builds domain logic on top of the fs Layer 1 service by composing multiple primitives.
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

import path from 'node:path'
import { Effect, pipe } from 'effect'
import { readDirectory } from './fs.js'

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
 * Uses Layer 1 primitives readDirectory and exists to compose discovery logic.
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
  return Effect.catchAll(
    walkDirectory(directory, directory),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      return Effect.fail(new DiscoveryError(`Failed to discover skills: ${message}`))
    },
  )
}

/**
 * Recursively walk directory using Layer 1 primitives.
 * @param currentDirectory — Current directory being walked
 * @param rootDirectory — Root directory for relative path calculation
 * @returns Effect with array of discovered skills, converting errors to DiscoveryError
 */
function walkDirectory(currentDirectory: string, rootDirectory: string): Effect.Effect<Skill[], DiscoveryError> {
  return pipe(
    readDirectory(currentDirectory),
    Effect.flatMap((entries) => {
      // Check if current directory contains SKILL.md
      const isSkill = entries.includes('SKILL.md')

      if (isSkill) {
        const relativePath = path.relative(rootDirectory, currentDirectory) || '.'
        return Effect.succeed([{ path: relativePath }])
      }

      // Process subdirectories for recursion
      const skipEntries = new Set(['node_modules'])
      const subdirs = entries.filter(
        entry =>
          !entry.startsWith('.')
          && !skipEntries.has(entry),
      )

      // Check each entry to see if it's a directory
      const checkDirectoryEffects = subdirs.map((entry) => {
        const entryPath = path.join(currentDirectory, entry)
        return pipe(
          readDirectory(entryPath),
          Effect.map(() => true), // If readDirectory succeeds, it's a directory
          Effect.catchAll(() => Effect.succeed(false)), // If it fails, it's not a directory
        )
      })

      return pipe(
        Effect.all(checkDirectoryEffects),
        Effect.flatMap((isDirectoryFlags) => {
          const directoriesPath = subdirs.filter((_, index) => isDirectoryFlags[index])

          // Recursively walk each subdirectory
          const walkEffects = directoriesPath.map(entry =>
            walkDirectory(path.join(currentDirectory, entry), rootDirectory),
          )

          return pipe(
            Effect.all(walkEffects),
            Effect.map((results) => {
              // Flatten array of arrays
              const flattened: Skill[] = []
              for (const result of results) {
                flattened.push(...result)
              }
              return flattened
            }),
          )
        }),
      )
    }),
    Effect.catchAll((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      return Effect.fail(new DiscoveryError(`Failed to walk directory: ${message}`))
    }),
  )
}
