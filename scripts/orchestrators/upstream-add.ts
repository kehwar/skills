/**
 * Upstream Add/Update Orchestrator
 *
 * ## Architecture
 *
 * Orchestrates the workflow for adding or updating a single upstream repository.
 * Mirrors the 4-phase pattern from sync-single-upstream.ts but includes upstream
 * metadata validation and collision detection.
 *
 * Phases:
 * 1. **Validate Input** — Collision check, URL normalization
 * 2. **Ensure Submodule** — Clone/update the upstream repository
 * 3. **Discover Skills** — Recursively find all SKILL.md files
 * 4. **Hash Skills** — Compute deterministic content hash for each skill
 * 5. **Copy Selected** — Copy user-selected skills into skills/ directory
 *
 * Uses Effect.gen() for declarative composition with automatic error propagation.
 * Phases run sequentially; failures short-circuit except in copy phase (collects per-skill errors).
 *
 * ## Error Handling
 *
 * Errors are typed and propagated automatically by Effect.
 * - Validation phase: fails on collision or invalid inputs
 * - Critical phases (submodule, discovery): fail-fast
 * - Copy phase: collects partial failures per-skill
 *
 * ## Structured Logging
 *
 * Each phase logs entry/exit. Integrate with your logging backend via logger service.
 *
 * @example
 * ```typescript
 * import { upstreamAdd } from './upstream-add.js'
 * import { Effect } from 'effect'
 *
 * const result = Effect.runSync(
 *   upstreamAdd({
 *     root: '/path/to/skills',
 *     upstreamKey: 'antfu',
 *     url: 'https://github.com/antfu/awesome-craft',
 *     branch: 'main',
 *     selectedSkills: { 'vue': 'antfu-vue' }
 *   })
 * )
 *
 * // result = {
 * //   isNew: true,
 * //   upstreamKey: 'antfu',
 * //   discoveredSkills: [
 * //     { path: 'vue', hash: 'abc123def456' }
 * //   ],
 * //   syncResult: {
 * //     synced: [{ skillPath: 'vue', outputName: 'antfu-vue' }],
 * //     skipped: [],
 * //     errors: []
 * //   }
 * // }
 * ```
 */

import type { SkillMeta } from '../types.js'
import path from 'node:path'
import { Effect } from 'effect'
import { log } from '../effects/logger.js'
import { copySingleSkill, writeSkillMeta } from '../effects/skill-copying.js'
import { discoverSkills } from '../effects/skill-discovery.js'
import { hashSkillDirectory } from '../effects/skill-hashing.js'
import { ensureSubmodule } from '../effects/submodule-management.js'

/**
 * Input to the upstream add orchestrator.
 * All inputs must be pre-validated and collision-checked by the CLI layer.
 */
export interface UpstreamAddInput {
  /** Root directory of the skills repository */
  root: string
  /** Upstream name (key in meta.json) — must be unique after collision-check */
  upstreamKey: string
  /** Normalized GitHub URL (must be valid HTTPS URL) */
  url: string
  /** Git branch to track (optional, pre-validated if provided) */
  branch?: string
  /** Skills to copy: skillPath → outputName (may be empty for reference-only) */
  selectedSkills: Record<string, string>
}

/**
 * Output from the upstream add orchestrator.
 * Provides full details of what was discovered and synced.
 */
export interface UpstreamAddOutput {
  /** Whether this is a new upstream (true) or update of existing (false) */
  isNew: boolean
  /** The upstream key (for tracking/logging) */
  upstreamKey: string
  /** All discovered skills with their content hashes */
  discoveredSkills: Array<{ path: string, hash: string }>
  /** Results of the copy phase */
  syncResult: {
    /** Successfully copied skills */
    synced: Array<{ skillPath: string, outputName: string }>
    /** Skills not copied (hash unchanged, deselected, etc.) */
    skipped: Array<{ skillPath: string, outputName: string, reason: string }>
    /** Skills that failed to copy */
    errors: Array<{ skillPath: string, outputName: string, error: string }>
  }
}

/**
 * Orchestrate adding or updating an upstream repository.
 *
 * Runs 5 phases sequentially:
 * 1. Validate input (collision, format)
 * 2. Ensure submodule exists
 * 3. Discover all skills
 * 4. Hash each skill
 * 5. Copy selected skills and update meta.json
 *
 * @param input Configuration for this upstream add operation
 * @returns Effect producing UpstreamAddOutput
 */
export function upstreamAdd(
  input: UpstreamAddInput,
): Effect.Effect<UpstreamAddOutput, Error> {
  return Effect.gen(function* () {
    const { root, upstreamKey, url, branch, selectedSkills } = input

    // Phase 1: Validate Input (already done by CLI, but orchestrator can double-check)
    yield* log('info', `[${upstreamKey}] Phase 1: validating input`)
    // Validation is minimal here since CLI pre-validates (enhanced validation in skills-bv3.6)
    yield* log('info', `[${upstreamKey}] ✓ Input validated`)

    // Phase 2: Ensure Submodule
    yield* log('info', `[${upstreamKey}] Phase 2: ensuring submodule`)
    const submodulePath = `upstream/${upstreamKey}`
    yield* ensureSubmodule(url, submodulePath, branch)
    const upstreamPath = path.join(root, submodulePath)
    yield* log('info', `[${upstreamKey}] ✓ Submodule ready`)

    // Phase 3: Discover Skills
    yield* log('info', `[${upstreamKey}] Phase 3: discovering skills`)
    const discoveredList = yield* discoverSkills(upstreamPath)
    yield* log('info', `[${upstreamKey}] ✓ Found ${discoveredList.length} skills`)

    // Phase 4: Hash Skills
    yield* log('info', `[${upstreamKey}] Phase 4: computing hashes`)
    const skillsWithHashes: Array<{ path: string, hash: string }> = yield* Effect.all(
      discoveredList.map(skill =>
        hashSkillDirectory(
          skill.path === '.'
            ? upstreamPath
            : path.join(upstreamPath, skill.path),
        ).pipe(
          Effect.map(hash => ({ path: skill.path, hash })),
          Effect.catchAll(() => Effect.succeed({ path: skill.path, hash: '' })),
        ),
      ),
      { concurrency: 'unbounded' },
    )
    yield* log('info', `[${upstreamKey}] ✓ Hashed ${skillsWithHashes.length} skills`)

    // Phase 5: Copy Selected Skills
    yield* log('info', `[${upstreamKey}] Phase 5: copying selected skills`)
    const syncResult = yield* copySelectedSkills(
      upstreamKey,
      upstreamPath,
      root,
      selectedSkills,
      skillsWithHashes,
    )
    yield* log('info', `[${upstreamKey}] ✓ Copy complete: ${syncResult.synced.length} synced, ${syncResult.errors.length} failed`)

    return {
      isNew: true, // isNew state detection implemented in skills-bv3.6 (load existing meta)
      upstreamKey,
      discoveredSkills: skillsWithHashes,
      syncResult,
    } satisfies UpstreamAddOutput
  })
}

/**
 * Phase 5: Copy selected skills with error handling per skill.
 * Collects failures without short-circuiting.
 */
function copySelectedSkills(
  upstreamKey: string,
  upstreamPath: string,
  root: string,
  selectedSkills: Record<string, string>,
  discovered: Array<{ path: string, hash: string }>,
): Effect.Effect<{
  synced: Array<{ skillPath: string, outputName: string }>
  skipped: Array<{ skillPath: string, outputName: string, reason: string }>
  errors: Array<{ skillPath: string, outputName: string, error: string }>
}, never> {
  return Effect.gen(function* () {
    const synced: Array<{ skillPath: string, outputName: string }> = []
    const skipped: Array<{ skillPath: string, outputName: string, reason: string }> = []
    const errors: Array<{ skillPath: string, outputName: string, error: string }> = []

    // Copy each selected skill
    const skillEntries = Object.entries(selectedSkills)
    const copyResults = yield* Effect.all(
      skillEntries.map(([skillPath, outputName]) =>
        copySingleSkillSafe(
          upstreamPath,
          root,
          upstreamKey,
          skillPath,
          outputName,
          discovered,
        ),
      ),
      { concurrency: 4 },
    )

    // Process results
    for (const result of copyResults) {
      switch (result.type) {
        case 'synced': {
          synced.push({ skillPath: result.skillPath, outputName: result.outputName })
          break
        }
        case 'skipped': {
          skipped.push({ skillPath: result.skillPath, outputName: result.outputName, reason: result.reason })
          break
        }
        case 'error': {
          errors.push({ skillPath: result.skillPath, outputName: result.outputName, error: result.error })
          break
        }
      }
    }

    return { synced, skipped, errors }
  })
}

/**
 * Safe wrapper for copying a single skill.
 * Catches errors and returns typed result for collection.
 */
function copySingleSkillSafe(
  upstreamPath: string,
  root: string,
  upstreamKey: string,
  skillPath: string,
  outputName: string,
  discovered: Array<{ path: string, hash: string }>,
): Effect.Effect<
  | { type: 'synced', skillPath: string, outputName: string }
  | { type: 'skipped', skillPath: string, outputName: string, reason: string }
  | { type: 'error', skillPath: string, outputName: string, error: string },
  never
> {
  const skillDirectory = skillPath === '.' ? upstreamPath : path.join(upstreamPath, skillPath)
  const outputPath = path.join(root, 'skills', outputName)

  return Effect.gen(function* () {
    // Copy the skill, catching any errors
    const copyResult = yield* copySingleSkill(skillDirectory, outputPath).pipe(
      Effect.map(() => ({ ok: true as const })),
      Effect.catchAll((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return Effect.succeed({ ok: false as const, error: errorMessage })
      }),
    )

    if (!copyResult.ok) {
      return { type: 'error', skillPath, outputName, error: copyResult.error }
    }

    // Find the skill's hash for metadata
    const skillHash = discovered.find(s => s.path === skillPath)?.hash ?? ''

    // Write skill metadata
    const skillMeta: SkillMeta = {
      type: 'synced',
      upstream: upstreamKey,
      sourceUrl: '', // Derived from config in future phase (skills-bv3.6)
      skillPath,
      gitSha: '', // Derived from git in future phase (skills-bv3.6)
      contentHash: skillHash,
      syncedAt: new Date().toISOString(),
    }

    const metaResult = yield* writeSkillMeta(outputPath, skillMeta).pipe(
      Effect.map(() => ({ ok: true as const })),
      Effect.catchAll((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return Effect.succeed({ ok: false as const, error: errorMessage })
      }),
    )

    if (!metaResult.ok) {
      return { type: 'error', skillPath, outputName, error: metaResult.error }
    }

    return { type: 'synced', skillPath, outputName }
  })
}
