import type { Dirent } from 'node:fs'
import type { Result } from '../types.ts'
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

export interface Skill {
  path: string
}

/**
 * Recursively discover directories containing SKILL.md files.
 * - Skips node_modules and hidden directories
 * - Does not recurse into matched directories
 * - Returns "." if root itself contains SKILL.md
 * Returns Result<Skill[]> to capture any file system errors.
 */
export function discoverSkills(dir: string): Result<Skill[]> {
  const results: Skill[] = []

  try {
    function walk(current: string): void {
      let entries: Dirent[]
      try {
        entries = readdirSync(current, { withFileTypes: true })
      }
      catch {
        return
      }

      // Check if current dir is a skill
      if (entries.some(e => e.isFile() && e.name === 'SKILL.md')) {
        results.push({ path: relative(dir, current) || '.' })
        return // Stop recursion for this branch
      }

      // Recurse into subdirectories
      for (const entry of entries) {
        if (
          entry.isDirectory()
          && entry.name !== 'node_modules'
          && !entry.name.startsWith('.')
        ) {
          walk(join(current, entry.name))
        }
      }
    }

    walk(dir)
    return { ok: true, data: results }
  }
  catch (err) {
    return {
      ok: false,
      error: `Failed to discover skills: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
