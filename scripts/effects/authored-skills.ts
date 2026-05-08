/**
 * Authored Skills Management — Effect-based symlink management for authored skills.
 *
 * ## Implementation
 *
 * Manages symlinks in authored/{domain}/ directories using Layer 1 primitives.
 * Scans authored/ to collect skills with optional domain organization.
 */

import type { SkillMeta } from '../types.js'
import path from 'node:path'
import { Effect, pipe } from 'effect'
import { exists, mkdir, readDirectory, readFile, remove, symlink } from './fs.js'

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
 * Uses Layer 1 primitives to compose directory scanning logic.
 *
 * @param authoredRoot — Path to authored/ directory
 * @returns Effect with array of AuthoredSkillEntry
 */
export function collectAuthoredSkills(authoredRoot: string): Effect.Effect<AuthoredSkillEntry[], AuthoredSkillsError> {
  return pipe(
    readDirectory(authoredRoot),
    Effect.flatMap((topLevelEntries) => {
      // Filter to only process directories (those without dots at start)
      const potentialDomains = topLevelEntries.filter(
        entry => !entry.startsWith('.'),
      )

      // For each potential domain/skill, check if it's a directory and collect skills
      const collectEffects = potentialDomains.map(entry =>
        collectSkillsInPath(path.join(authoredRoot, entry), entry),
      )

      return pipe(
        Effect.all(collectEffects),
        Effect.map((results) => {
          // Flatten array of arrays
          const flattened: AuthoredSkillEntry[] = []
          for (const result of results) {
            flattened.push(...result)
          }
          return flattened
        }),
      )
    }),
    Effect.catchAll((error: unknown) =>
      Effect.fail(
        new AuthoredSkillsError(
          `Failed to collect authored skills: ${error instanceof Error ? error.message : String(error)}`,
        ),
      ),
    ),
  )
}

/**
 * Collect skills in a given path, handling both flat and domain-organized structures.
 * @param topPath — Path to check for skills
 * @param entryName — Name of the entry (skill or domain)
 * @returns Effect with array of discovered skills
 */
function collectSkillsInPath(topPath: string, entryName: string): Effect.Effect<AuthoredSkillEntry[]> {
  return pipe(
    readDirectory(topPath),
    Effect.flatMap((entries) => {
      // Check if this is a flat skill (has SKILL.md or meta.json)
      if (entries.includes('SKILL.md') || entries.includes('meta.json')) {
        return Effect.succeed([
          {
            name: entryName,
            path: topPath,
          },
        ])
      }

      // Otherwise, try to collect domain-organized skills
      return collectDomainSkills(topPath, entryName)
    }),
    Effect.catchAll(() => Effect.succeed([])), // On error, return empty array (permission denied, etc.)
  )
}

/**
 * Collect domain-organized skills from a directory.
 * @param topPath — Path to domain directory
 * @param domainName — Domain name
 * @returns Effect with array of skills in domain
 */
function collectDomainSkills(topPath: string, domainName: string): Effect.Effect<AuthoredSkillEntry[]> {
  return pipe(
    readDirectory(topPath),
    Effect.flatMap((entries) => {
      // Filter potential skill entries
      const potentialSkills = entries.filter(
        entry => !entry.startsWith('.'),
      )

      // Check each potential skill
      const checkEffects = potentialSkills.map((skillName) => {
        const skillPath = path.join(topPath, skillName)
        return pipe(
          readDirectory(skillPath),
          Effect.flatMap((skillEntries) => {
            // If it has SKILL.md or meta.json, it's a skill
            if (skillEntries.includes('SKILL.md') || skillEntries.includes('meta.json')) {
              return Effect.succeed({
                name: skillName,
                domain: domainName,
                path: skillPath,
              } as AuthoredSkillEntry | undefined)
            }
            return Effect.void
          }),
          Effect.catchAll(() => Effect.void), // Return undefined if not a skill
        )
      })

      return pipe(
        Effect.all(checkEffects),
        Effect.map((results) => {
          // Filter out undefined values
          return results.filter(r => r !== undefined) as AuthoredSkillEntry[]
        }),
      )
    }),
    Effect.catchAll(() => Effect.succeed([])), // On error, return empty array
  )
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
  const skillName = path.basename(skillPath)
  const domainDirectory = path.join(authoredRoot, domain)
  const linkPath = path.join(domainDirectory, skillName)

  return pipe(
    // Ensure domain directory exists
    mkdir(domainDirectory, true),
    Effect.flatMap(() =>
      // Create symlink
      symlink(skillPath, linkPath),
    ),
    Effect.catchAll((error: unknown) =>
      Effect.fail(
        new AuthoredSkillsError(
          `Failed to link skill: ${error instanceof Error ? error.message : String(error)}`,
        ),
      ),
    ),
  )
}

/**
 * Remove symlink from authored organization.
 *
 * @param linkPath — Path to symlink to remove
 * @returns Effect with void
 */
export function unlinkSkillFromAuthoredDirectory(linkPath: string): Effect.Effect<void, AuthoredSkillsError> {
  return pipe(
    remove(linkPath, true),
    Effect.catchAll((error: unknown) =>
      Effect.fail(
        new AuthoredSkillsError(
          `Failed to unlink skill: ${error instanceof Error ? error.message : String(error)}`,
        ),
      ),
    ),
  )
}

/**
 * Prune stale symlinks from authored directories.
 *
 * Removes symlinks that point to non-existent skills using Layer 1 primitives.
 *
 * @param authoredRoot — Path to authored/ directory
 * @returns Effect with count of removed links
 */
export function pruneStaleLinks(authoredRoot: string): Effect.Effect<number, AuthoredSkillsError> {
  return pipe(
    readDirectory(authoredRoot),
    Effect.flatMap((entries) => {
      // Filter to domains (directories not starting with .)
      const domains = entries.filter(entry => !entry.startsWith('.'))

      // For each domain, check and remove broken symlinks
      const pruneEffects = domains.map((domainName) => {
        const domainDirectory = path.join(authoredRoot, domainName)
        return pruneDomainLinks(domainDirectory)
      })

      return pipe(
        Effect.all(pruneEffects),
        Effect.map((removedCounts) => {
          // Sum up all removed counts
          return removedCounts.reduce((total, count) => total + count, 0)
        }),
      )
    }),
    Effect.catchAll((error: unknown) =>
      Effect.fail(
        new AuthoredSkillsError(
          `Failed to prune stale links: ${error instanceof Error ? error.message : String(error)}`,
        ),
      ),
    ),
  )
}

/**
 * Prune broken symlinks in a single domain directory.
 * @param domainDirectory — Path to domain directory
 * @returns Effect with count of removed links
 */
function pruneDomainLinks(domainDirectory: string): Effect.Effect<number> {
  return pipe(
    readDirectory(domainDirectory),
    Effect.flatMap((entries) => {
      // Check each entry to see if it's a broken symlink
      const checkEffects = entries.map((entry) => {
        const linkPath = path.join(domainDirectory, entry)
        return checkAndRemoveBrokenLink(linkPath)
      })

      return pipe(
        Effect.all(checkEffects),
        Effect.map((results) => {
          // Count how many were removed
          return results.filter(r => r === true).length
        }),
      )
    }),
    Effect.catchAll(() => Effect.succeed(0)), // On error, return 0 removed
  )
}

/**
 * Check if a symlink is broken and remove it if so.
 * Returns true if removed, false otherwise.
 */
function checkAndRemoveBrokenLink(linkPath: string): Effect.Effect<boolean> {
  return pipe(
    // Try to check if path exists (will fail if broken symlink)
    exists(linkPath),
    Effect.flatMap((pathExists) => {
      if (!pathExists) {
        // Path doesn't exist - try to remove it (it might be a broken symlink)
        return pipe(
          remove(linkPath, true),
          Effect.map(() => true), // Removed successfully
          Effect.catchAll(() => Effect.succeed(false)), // Failed to remove
        )
      }
      // Path exists and is good - don't remove
      return Effect.succeed(false)
    }),
  )
}

/**
 * Collect all authored skills from the skills/ directory.
 *
 * Scans the skills directory for folders with meta.json files where type='authored',
 * and returns metadata about each skill (name, domain if present, metadata).
 *
 * @param skillsDirectory — Path to skills/ directory
 * @returns Effect with array of { name, meta, path } for each authored skill
 */
export function collectAuthoredSkillsWithMetadata(
  skillsDirectory: string,
): Effect.Effect<Array<{ name: string, meta: SkillMeta, path: string }>, AuthoredSkillsError> {
  return pipe(
    readDirectory(skillsDirectory),
    Effect.flatMap((entries) => {
      const collectEffects = entries
        .filter(entry => !entry.startsWith('.'))
        .map(entry =>
          collectSkillMetadata(path.join(skillsDirectory, entry), entry),
        )

      return pipe(
        Effect.all(collectEffects),
        Effect.map((results) => {
          return results.filter(r => r !== undefined) as Array<{ name: string, meta: SkillMeta, path: string }>
        }),
      )
    }),
    Effect.catchAll((error: unknown) =>
      Effect.fail(
        new AuthoredSkillsError(
          `Failed to collect authored skills: ${error instanceof Error ? error.message : String(error)}`,
        ),
      ),
    ),
  )
}

/**
 * Helper to collect metadata from a skill directory.
 */
function collectSkillMetadata(
  skillPath: string,
  skillName: string,
): Effect.Effect<{ name: string, meta: SkillMeta, path: string } | undefined> {
  return pipe(
    readFile(path.join(skillPath, 'meta.json')),
    Effect.flatMap((content) => {
      return Effect.try({
        try: () => {
          const meta = JSON.parse(content) as SkillMeta
          if (meta.type === 'authored') {
            return { name: skillName, meta, path: skillPath } as const
          }
          return undefined
        },
        catch: () => undefined,
      })
    }),
    Effect.catchAll(() => Effect.succeed(undefined)),
  )
}

/**
 * Link collected authored skills to the authored/ directory.
 *
 * Creates symlinks respecting domain organization:
 * - If meta.domain is set: authored/{domain}/{skillName} → skills/{skillName}
 * - Otherwise: authored/{skillName} → skills/{skillName}
 *
 * @param collected — Array of { name, meta, path } from collectAuthoredSkillsWithMetadata
 * @param skillsDirectory — Path to skills/ directory
 * @param authoredDirectory — Path to authored/ directory
 * @returns Effect producing array of action messages
 */
export function linkAuthoredSkillsToDirectory(
  collected: Array<{ name: string, meta: SkillMeta, path: string }>,
  skillsDirectory: string,
  authoredDirectory: string,
): Effect.Effect<string[], AuthoredSkillsError> {
  return Effect.gen(function* () {
    // Ensure authored directory exists
    yield* mkdir(authoredDirectory, true)

    const messages: string[] = []

    // Remove all stale links first
    for (const { name } of collected) {
      yield* removeAllStaleLinksForSkill(name, authoredDirectory)
    }

    // Create new links
    for (const { name, meta, path: skillPath } of collected) {
      if (meta.type !== 'authored')
        continue

      const authored = meta as Extract<SkillMeta, { type: 'authored' }>
      if (authored.domain) {
        const domainDirectory = path.join(authoredDirectory, authored.domain)
        yield* mkdir(domainDirectory, true)
        const linkPath = path.join(domainDirectory, name)
        const linkTarget = path.relative(domainDirectory, skillPath)
        // Try to remove if it exists before creating
        yield* pipe(
          remove(linkPath, true),
          Effect.catchAll(() => Effect.void),
        )
        yield* symlink(linkTarget, linkPath)
        messages.push(`linked  authored: ${name} (domain: ${authored.domain})`)
      }
      else {
        const linkPath = path.join(authoredDirectory, name)
        const linkTarget = path.relative(authoredDirectory, skillPath)
        // Try to remove if it exists before creating
        yield* pipe(
          remove(linkPath, true),
          Effect.catchAll(() => Effect.void),
        )
        yield* symlink(linkTarget, linkPath)
        messages.push(`linked  authored: ${name}`)
      }
    }

    return messages
  })
}

/**
 * Remove all stale links for a skill across all locations in authored/.
 */
function removeAllStaleLinksForSkill(
  skillName: string,
  authoredDirectory: string,
): Effect.Effect<void, never> {
  return Effect.gen(function* () {
    // Try to remove from flat location
    yield* pipe(
      remove(path.join(authoredDirectory, skillName), true),
      Effect.catchAll(() => Effect.void),
    )

    // Try to remove from each domain subdirectory
    yield* removeSkillfromDomains(authoredDirectory, skillName)
  })
}

/**
 * Remove skill from all domain subdirectories.
 */
function removeSkillfromDomains(
  authoredDirectory: string,
  skillName: string,
): Effect.Effect<void, never> {
  return pipe(
    readDirectory(authoredDirectory),
    Effect.flatMap((domains) => {
      const removeEffects = domains
        .filter(d => !d.startsWith('.'))
        .map(domainName => removeSkillFromDomain(authoredDirectory, domainName, skillName))

      return Effect.all(removeEffects)
    }),
    Effect.map(() => undefined),
    Effect.catchAll(() => Effect.void),
  )
}

/**
 * Remove skill from a specific domain.
 */
function removeSkillFromDomain(
  authoredDirectory: string,
  domainName: string,
  skillName: string,
): Effect.Effect<void, never> {
  return pipe(
    remove(path.join(authoredDirectory, domainName, skillName), true),
    Effect.catchAll(() => Effect.void),
  )
}

/**
 * Prune stale symlinks from the authored/ directory.
 *
 * Removes symlinks that:
 * - Point to a skill that no longer has type='authored' in its meta.json
 * - Point to a skill that doesn't exist
 *
 * @param authoredDirectory — Path to authored/ directory
 * @param skillsDirectory — Path to skills/ directory
 * @returns Effect producing array of action messages
 */
export function pruneStaleLinksinAuthoredDirectory(
  authoredDirectory: string,
  skillsDirectory: string,
): Effect.Effect<string[], AuthoredSkillsError> {
  return Effect.gen(function* () {
    const messages: string[] = []

    // Recursively check and prune
    const pruneMessages = yield* pruneDirectoryRecursive(authoredDirectory, skillsDirectory)
    messages.push(...pruneMessages)

    return messages
  })
}

/**
 * Recursively prune directory, removing stale links and empty dirs.
 */
function pruneDirectoryRecursive(
  directory: string,
  skillsDirectory: string,
): Effect.Effect<string[], never> {
  return pipe(
    readDirectory(directory),
    Effect.flatMap((entries) => {
      const checkEffects = entries.map((entry) => {
        const fullPath = path.join(directory, entry)
        return checkAndPruneEntry(fullPath, entry, skillsDirectory)
      })

      return Effect.all(checkEffects)
    }),
    Effect.map((results) => {
      // Flatten all messages
      return results.flat()
    }),
    Effect.catchAll(() => Effect.succeed([])),
  )
}

/**
 * Check and prune a single entry (symlink or directory).
 */
function checkAndPruneEntry(
  fullPath: string,
  entryName: string,
  skillsDirectory: string,
): Effect.Effect<string[]> {
  return pipe(
    // Check if it's a symlink by trying to read its target (will fail for broken symlinks)
    exists(fullPath),
    Effect.flatMap((pathExists) => {
      if (!pathExists && !entryName.startsWith('.')) {
        // Likely a broken symlink - try to remove it
        return removeBrokenLink(fullPath, entryName)
      }

      // Check if the target is still an authored skill
      if (pathExists && !entryName.startsWith('.')) {
        return checkIfAuthoredAndRemove(fullPath, entryName, skillsDirectory)
      }

      return Effect.succeed([])
    }),
  )
}

/**
 * Remove a broken symlink.
 */
function removeBrokenLink(fullPath: string, entryName: string): Effect.Effect<string[]> {
  return pipe(
    remove(fullPath, true),
    Effect.map(() => [`removed stale authored symlink: ${entryName}`]),
    Effect.catchAll(() => Effect.succeed([])),
  )
}

/**
 * Check if entry is an authored skill and remove it if not.
 */
function checkIfAuthoredAndRemove(
  fullPath: string,
  entryName: string,
  skillsDirectory: string,
): Effect.Effect<string[]> {
  const skillMetaPath = path.join(skillsDirectory, entryName, 'meta.json')
  return pipe(
    readFile(skillMetaPath),
    Effect.flatMap((content) => {
      return evaluateAndRemoveIfNeeded(fullPath, entryName, content)
    }),
    Effect.catchAll(() => Effect.succeed([])), // File doesn't exist or can't read
  )
}

/**
 * Parse metadata and remove symlink if it's not an authored skill.
 */
function evaluateAndRemoveIfNeeded(
  fullPath: string,
  entryName: string,
  metaContent: string,
): Effect.Effect<string[], never> {
  return Effect.gen(function* () {
    let shouldRemove = false
    try {
      const meta = JSON.parse(metaContent) as SkillMeta
      shouldRemove = meta.type !== 'authored'
    }
    catch {
      shouldRemove = true
    }

    if (shouldRemove) {
      return yield* pipe(
        remove(fullPath, true),
        Effect.map(() => [`removed stale authored symlink: ${entryName}`]),
        Effect.catchAll(() => Effect.succeed([])),
      )
    }
    return []
  })
}
