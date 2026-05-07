/**
 * Skill Hashing — Effect-based deterministic content hashing.
 *
 * ## Implementation
 *
 * Computes SHA256 hash of skill directory content.
 * Returns first 12 characters for brevity while maintaining uniqueness.
 */

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { Effect } from 'effect'

/**
 * HashingError — Failed to hash skill directory.
 */
export class HashingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HashingError'
  }
}

/**
 * Compute deterministic SHA256 hash of skill directory contents.
 *
 * - Traverses all files in directory (excluding node_modules, .git, hidden files)
 * - Returns first 12 characters of SHA256 hex digest
 * - Same content always produces same hash
 *
 * @param skillPath — Path to skill directory
 * @returns Effect that succeeds with hash string, fails with HashingError
 */
export function hashSkillDirectory(skillPath: string): Effect.Effect<string, HashingError> {
  return Effect.sync(() => {
    const hash = createHash('sha256')

    function hashDirectory(directory: string): void {
      let entries
      try {
        entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
      }
      catch {
        throw new HashingError(`Failed to read directory: ${directory}`)
      }

      for (const entry of entries) {
        // Skip node_modules, .git, hidden files
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.')) {
          continue
        }

        const fullPath = path.join(directory, entry.name)

        if (entry.isDirectory()) {
          hashDirectory(fullPath)
        }
        else if (entry.isFile()) {
          try {
            const content = readFileSync(fullPath)
            hash.update(fullPath) // Include path for uniqueness
            hash.update(content)
          }
          catch {
            throw new HashingError(`Failed to read file: ${fullPath}`)
          }
        }
      }
    }

    try {
      hashDirectory(skillPath)
      return hash.digest('hex').slice(0, 12)
    }
    catch (error) {
      if (error instanceof HashingError) {
        throw error
      }
      throw new HashingError(`Failed to hash skill directory: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
}
