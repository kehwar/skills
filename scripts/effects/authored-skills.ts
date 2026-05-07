/**
 * Authored Skills Management — Effect-based symlink management for authored skills.
 *
 * ## Implementation
 *
 * Manages symlinks in authored/{domain}/ directories.
 * Scans authored/ to collect skills with optional domain organization.
 */

import { lstatSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import path from 'node:path'
import { Effect } from 'effect'

/**
 * AuthoredSkillsError — Failed to manage authored skills.
 */
export class AuthoredSkillsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthoredSkillsError'
  }
}

/**
 * Authored skill entry.
 */
export interface AuthoredSkillEntry {
  /** Skill folder name */
  name: string
  /** Domain folder name, if organized by domain */
  domain?: string
  /** Absolute path to skill folder */
  path: string
}

/**
 * Collect all authored skills, optionally organized by domain.
 *
 * Scans authored/ directory for:
 * - Flat skills: authored/{skill-name}/
 * - Domain-organized skills: authored/{domain}/{skill-name}/
 *
 * @param authoredRoot — Path to authored/ directory
 * @returns Effect with array of AuthoredSkillEntry
 */
export function collectAuthoredSkills(authoredRoot: string): Effect.Effect<AuthoredSkillEntry[], AuthoredSkillsError> {
  return Effect.sync(() => {
    const results: AuthoredSkillEntry[] = []

    try {
      const topLevel = readdirSync(authoredRoot, { withFileTypes: true })

      for (const entry of topLevel) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) {
          continue
        }

        const topPath = path.join(authoredRoot, entry.name)
        const flatSkills = collectFlatSkills(topPath, entry.name)
        results.push(...flatSkills)

        const domainSkills = collectDomainSkills(topPath, entry.name)
        results.push(...domainSkills)
      }

      return results
    }
    catch (error) {
      throw new AuthoredSkillsError(`Failed to collect authored skills: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
}

/**
 * Collect flat skills from a directory.
 */
function collectFlatSkills(topPath: string, entryName: string): AuthoredSkillEntry[] {
  const results: AuthoredSkillEntry[] = []

  try {
    const content = readdirSync(topPath)
    if (content.includes('SKILL.md') || content.includes('meta.json')) {
      results.push({
        name: entryName,
        path: topPath,
      })
    }
  }
  catch {
    // Permission denied - skip
  }

  return results
}

/**
 * Collect domain-organized skills from a directory.
 */
function collectDomainSkills(topPath: string, domainName: string): AuthoredSkillEntry[] {
  const results: AuthoredSkillEntry[] = []

  try {
    const domainContent = readdirSync(topPath, { withFileTypes: true })
    for (const skillEntry of domainContent) {
      if (!skillEntry.isDirectory() || skillEntry.name.startsWith('.')) {
        continue
      }

      const skillPath = path.join(topPath, skillEntry.name)
      try {
        const skillContent = readdirSync(skillPath)
        if (skillContent.includes('SKILL.md') || skillContent.includes('meta.json')) {
          results.push({
            name: skillEntry.name,
            domain: domainName,
            path: skillPath,
          })
        }
      }
      catch {
        // Skip on permission denied
      }
    }
  }
  catch {
    // Permission denied - skip
  }

  return results
}

/**
 * Create symlink from skill to authored/{domain}/ organization.
 *
 * @param skillPath — Absolute path to skill
 * @param domain — Domain folder name
 * @param authoredRoot — Path to authored/ directory
 * @returns Effect with void
 */
export function linkSkillToAuthoredDirectory(skillPath: string, domain: string, authoredRoot: string): Effect.Effect<void, AuthoredSkillsError> {
  return Effect.sync(() => {
    try {
      const skillName = path.basename(skillPath)
      const domainDirectory = path.join(authoredRoot, domain)
      const linkPath = path.join(domainDirectory, skillName)

      // Create domain dir if needed
      try {
        readdirSync(domainDirectory)
      }
      catch {
        throw new Error('Domain directory does not exist')
      }

      symlinkSync(skillPath, linkPath, 'dir')
    }
    catch (error) {
      throw new AuthoredSkillsError(`Failed to link skill: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
}

/**
 * Remove symlink from authored organization.
 *
 * @param linkPath — Path to symlink to remove
 * @returns Effect with void
 */
export function unlinkSkillFromAuthoredDirectory(linkPath: string): Effect.Effect<void, AuthoredSkillsError> {
  return Effect.sync(() => {
    try {
      rmSync(linkPath, { recursive: true, force: true })
    }
    catch (error) {
      throw new AuthoredSkillsError(`Failed to unlink skill: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
}

/**
 * Prune stale symlinks from authored directories.
 *
 * Removes symlinks that point to non-existent skills.
 *
 * @param authoredRoot — Path to authored/ directory
 * @returns Effect with count of removed links
 */
export function pruneStaleLinks(authoredRoot: string): Effect.Effect<number, AuthoredSkillsError> {
  return Effect.sync(() => {
    let removed = 0

    try {
      const topLevel = readdirSync(authoredRoot, { withFileTypes: true })

      for (const entry of topLevel) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) {
          continue
        }

        const domainDirectory = path.join(authoredRoot, entry.name)

        try {
          const links = readdirSync(domainDirectory, { withFileTypes: true })
          for (const link of links) {
            if (removeIfBrokenSymlink(path.join(domainDirectory, link.name))) {
              removed++
            }
          }
        }
        catch {
          // Permission denied - skip
        }
      }

      return removed
    }
    catch (error) {
      throw new AuthoredSkillsError(`Failed to prune stale links: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
}

/**
 * Check if a path is a broken symlink and remove it.
 * Returns true if removed, false otherwise.
 */
function removeIfBrokenSymlink(linkPath: string): boolean {
  try {
    const stats = lstatSync(linkPath)
    if (stats.isSymbolicLink()) {
      // Try to access the target
      readdirSync(linkPath)
      // Target exists - keep the symlink
      return false
    }
  }
  catch {
    // Symlink is broken or inaccessible - remove it
    try {
      rmSync(linkPath, { recursive: true, force: true })
      return true
    }
    catch {
      // Ignore removal errors
      return false
    }
  }

  return false
}
