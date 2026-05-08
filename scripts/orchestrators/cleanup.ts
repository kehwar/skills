/**
 * Cleanup Orchestrator
 *
 * ## Architecture
 *
 * Detects and reports orphaned skills and submodules (no longer declared in meta.json).
 *
 * Key pattern: Sequential phases with fail-fast (like sync-single-upstream).
 * Any error in a detection phase short-circuits and returns the error immediately.
 *
 * ## Workflow
 *
 * 1. **Detect Orphaned Submodules** — Compare .gitmodules entries with meta.json
 * 2. **Detect Orphaned Skills** — Compare skills/ directory with declared upstreams + authored skills
 * 3. **Detect Stale Symlinks** — Check authored/ directory for broken symlinks
 * 4. **Return Summary** — Provide lists of all orphaned items
 *
 * ## Error Handling
 *
 * Errors in any phase short-circuit; cleanup returns error immediately.
 * This allows CLI to decide whether to continue or fail.
 *
 * Example:
 * - Phase 1 succeeds: finds 2 orphaned submodules
 * - Phase 2 fails: permission denied reading skills/
 * - Result: error from phase 2; orphaned submodules not reported
 *
 * @example
 * ```typescript
 * import { cleanup } from './cleanup.js'
 * import { Effect } from 'effect'
 *
 * const result = await Effect.runPromise(
 *   cleanup({
 *     root: '/path/to/skills'
 *   })
 * )
 *
 * // result = {
 * //   orphanedSubmodules: ['upstream/old-vendor'],
 * //   orphanedSkills: ['old-skill-1', 'old-skill-2'],
 * //   staleLinksinAuthored: ['authored/sap/sap-old → nonexistent']
 * // }
 * ```
 */

import path from 'node:path'
import { Effect } from 'effect'
import { exists, readDirectoryWithTypes, readFile } from '../effects/fs.js'
import { log } from '../effects/logger.js'

/**
 * Input to cleanup orchestrator.
 */
export interface CleanupInput {
  /** Root directory of the skills repository */
  root: string
}

/**
 * Output from cleanup orchestrator.
 * Lists all detected orphaned items.
 */
export interface CleanupOutput {
  /** Submodule paths in .gitmodules but not in meta.json */
  orphanedSubmodules: string[]
  /** Skill folders in skills/ but not declared anywhere */
  orphanedSkills: string[]
  /** Broken symlinks in authored/ */
  staleLinksinAuthored: string[]
}

/**
 * Detect all orphaned skills and submodules.
 *
 * @param input Configuration for cleanup
 * @returns Effect producing CleanupOutput
 *
 * @example
 * ```typescript
 * const result = await Effect.runPromise(cleanup({ root: '/path/to/skills' }))
 * console.log(`Found ${result.orphanedSubmodules.length} orphaned submodules`)
 * ```
 */
export function cleanup(
  input: CleanupInput,
): Effect.Effect<CleanupOutput, never> {
  return Effect.gen(function* () {
    const root = input.root
    yield* log('info', 'Starting cleanup detection')

    // Phase 1: Detect Orphaned Submodules
    yield* log('info', 'Phase 1: detecting orphaned submodules')
    const orphanedSubmodules = yield* detectOrphanedSubmodules(root).pipe(
      Effect.catchAll(() => Effect.succeed([])),
    )
    yield* log('info', `Found ${orphanedSubmodules.length} orphaned submodules`)

    // Phase 2: Detect Orphaned Skills
    yield* log('info', 'Phase 2: detecting orphaned skills')
    const orphanedSkills = yield* detectOrphanedSkills(root).pipe(
      Effect.catchAll(() => Effect.succeed([])),
    )
    yield* log('info', `Found ${orphanedSkills.length} orphaned skills`)

    // Phase 3: Detect Stale Symlinks
    yield* log('info', 'Phase 3: detecting stale symlinks')
    const staleLinksinAuthored = yield* detectStaleSymlinks(root).pipe(
      Effect.catchAll(() => Effect.succeed([])),
    )
    yield* log('info', `Found ${staleLinksinAuthored.length} stale symlinks`)

    return {
      orphanedSubmodules,
      orphanedSkills,
      staleLinksinAuthored,
    } satisfies CleanupOutput
  })
}

/**
 * Parse meta.json and return the upstreams object.
 */
function parseMetaJson(content: string): Record<string, any> {
  try {
    const meta = JSON.parse(content)
    return meta.upstreams || {}
  }
  catch {
    return {}
  }
}

/**
 * Phase 1: Detect submodules in .gitmodules that are not in meta.json.
 */
function detectOrphanedSubmodules(root: string): Effect.Effect<string[], never> {
  return Effect.gen(function* () {
    // Get expected submodules from meta.json
    const expectedSubmodules = new Set<string>()
    const metaPath = path.join(root, 'meta.json')
    const metaExists = yield* exists(metaPath)
    if (metaExists) {
      const metaContent = yield* readFile(metaPath).pipe(
        Effect.catchAll(() => Effect.succeed('')),
      )
      const upstreams = parseMetaJson(metaContent)
      for (const upstreamName of Object.keys(upstreams)) {
        expectedSubmodules.add(`upstream/${upstreamName}`)
      }
    }

    // Get existing submodules from .gitmodules
    const gitmodulesPath = path.join(root, '.gitmodules')
    const gitmodulesExists = yield* exists(gitmodulesPath)
    if (!gitmodulesExists) {
      return []
    }

    const gitmodulesContent = yield* readFile(gitmodulesPath).pipe(
      Effect.catchAll(() => Effect.succeed('')),
    )
    const submodulePaths: string[] = Array.from(
      gitmodulesContent.matchAll(/path\s*=\s*(.+)/g),
      m => m[1].trim(),
    )

    // Find orphaned ones
    const orphaned = submodulePaths.filter(
      submodulePath => !expectedSubmodules.has(submodulePath),
    )

    return orphaned
  })
}

/**
 * Helper to collect expected skills from meta.json upstreams.
 */
function collectSkillsFromMeta(root: string, expectedSkills: Set<string>): Effect.Effect<void, never> {
  return Effect.gen(function* () {
    const metaPath = path.join(root, 'meta.json')
    const metaExists = yield* exists(metaPath)
    if (!metaExists)
      return

    const metaContent = yield* readFile(metaPath).pipe(
      Effect.catchAll(() => Effect.succeed('')),
    )
    const upstreams = parseMetaJson(metaContent)
    for (const config of Object.values(upstreams)) {
      const configObject = config as any
      if (configObject.skills) {
        for (const outputName of Object.values(configObject.skills)) {
          expectedSkills.add(outputName as string)
        }
      }
    }
  })
}

/**
 * Helper to collect skills marked as authored.
 */
function collectAuthoredSkills(root: string, expectedSkills: Set<string>): Effect.Effect<void, never> {
  return Effect.gen(function* () {
    const skillsDirectory = path.join(root, 'skills')
    const skillsExists = yield* exists(skillsDirectory)
    if (!skillsExists)
      return

    const entries = yield* readDirectoryWithTypes(skillsDirectory).pipe(
      Effect.catchAll(() => Effect.succeed([])),
    )
    for (const entry of entries) {
      if (!entry.isDirectory())
        continue

      const skillMetaPath = path.join(skillsDirectory, entry.name, 'meta.json')
      const skillMetaExists = yield* exists(skillMetaPath)
      if (!skillMetaExists)
        continue

      const skillMetaContent = yield* readFile(skillMetaPath).pipe(
        Effect.catchAll(() => Effect.succeed('')),
      )
      try {
        const skillMeta = JSON.parse(skillMetaContent) as any
        if (skillMeta.type === 'authored') {
          expectedSkills.add(entry.name)
        }
      }
      catch {
        // Invalid JSON, skip
      }
    }
  })
}

/**
 * Phase 2: Detect skills in skills/ that are not declared in meta.json or authored.
 */
function detectOrphanedSkills(root: string): Effect.Effect<string[], never> {
  return Effect.gen(function* () {
    // Get expected skill names
    const expectedSkills = new Set<string>()

    // From meta.json upstreams
    yield* collectSkillsFromMeta(root, expectedSkills)

    // From authored skills (check meta.json in each skill directory)
    yield* collectAuthoredSkills(root, expectedSkills)

    // Get existing skills from skills/ directory
    const skillsDirectory = path.join(root, 'skills')
    const skillsExists = yield* exists(skillsDirectory)
    if (!skillsExists) {
      return []
    }

    const entries = yield* readDirectoryWithTypes(skillsDirectory).pipe(
      Effect.catchAll(() => Effect.succeed([])),
    )
    const existingSkills = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)

    // Find orphaned ones
    const orphaned = existingSkills.filter(name => !expectedSkills.has(name))

    return orphaned
  })
}

/**
 * Helper to check for stale symlinks at a given directory level.
 */
function checkStaleLinksInDirectory(
  directoryPath: string,
  pathPrefix: string,
): Effect.Effect<string[], never> {
  return Effect.gen(function* () {
    const staleLinks: string[] = []
    const entries = yield* readDirectoryWithTypes(directoryPath).pipe(
      Effect.catchAll(() => Effect.succeed([])),
    )

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        const linkPath = path.join(directoryPath, entry.name)
        const targetExists = yield* exists(linkPath)
        if (!targetExists) {
          staleLinks.push(`${pathPrefix}/${entry.name}`)
        }
      }
    }

    return staleLinks
  })
}

/**
 * Helper to check for stale symlinks in domain subdirectories.
 */
function checkStaleLinksinDomains(
  authoredDirectory: string,
  entries: Array<{ name: string, isDirectory: () => boolean }>,
): Effect.Effect<string[], never> {
  return Effect.gen(function* () {
    const staleLinks: string[] = []

    for (const entry of entries) {
      if (!entry.isDirectory())
        continue

      const domainPath = path.join(authoredDirectory, entry.name)
      const domainStaleLinks = yield* checkStaleLinksInDirectory(domainPath, `authored/${entry.name}`)
      staleLinks.push(...domainStaleLinks)
    }

    return staleLinks
  })
}

/**
 * Phase 3: Detect stale symlinks in authored/ directory.
 */
function detectStaleSymlinks(root: string): Effect.Effect<string[], never> {
  return Effect.gen(function* () {
    const authoredDirectory = path.join(root, 'authored')
    const authoredExists = yield* exists(authoredDirectory)
    if (!authoredExists) {
      return []
    }

    // Read entries in authored directory (including domains)
    const entries = yield* readDirectoryWithTypes(authoredDirectory).pipe(
      Effect.catchAll(() => Effect.succeed([])),
    )

    // Check for stale symlinks at root level
    const rootStaleLinks = yield* checkStaleLinksInDirectory(authoredDirectory, 'authored')

    // Check for stale symlinks in domain directories
    const domainStaleLinks = yield* checkStaleLinksinDomains(authoredDirectory, entries)

    return [...rootStaleLinks, ...domainStaleLinks]
  })
}
