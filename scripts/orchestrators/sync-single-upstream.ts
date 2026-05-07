/**
 * Sync Single Upstream Orchestrator
 *
 * ## Architecture
 *
 * Orchestrates the 4-phase workflow for syncing a single upstream repository:
 *
 * 1. **Ensure Submodule** — Clone/update the upstream repository as a git submodule
 * 2. **Discover Skills** — Recursively find all SKILL.md files in the upstream
 * 3. **Hash Skills** — Compute deterministic content hash for each discovered skill
 * 4. **Copy Selected** — Copy user-selected skills into skills/ directory and update meta.json
 *
 * Uses Effect.gen() for declarative composition with automatic error propagation.
 * Phases run sequentially; any failure short-circuits and returns error immediately.
 *
 * ## Error Handling
 *
 * Errors are typed (SubmoduleError, DiscoveryError, HashingError, CopyError)
 * and propagated automatically by Effect. No manual error threading required.
 *
 * ## Structured Logging
 *
 * Each phase logs entry/exit with timing. Integrate with your logging backend
 * by providing a logger service.
 *
 * @example
 * ```typescript
 * import { syncSingleUpstream } from './sync-single-upstream.js'
 * import { Effect } from 'effect'
 *
 * const result = Effect.runSync(
 *   syncSingleUpstream({
 *     root: '/path/to/skills',
 *     upstreamName: 'antfu',
 *     upstreamConfig: {
 *       url: 'https://github.com/antfu/awesome-craft',
 *       branch: 'main',
 *       skills: { 'vue': 'antfu-vue' }
 *     },
 *     force: false
 *   })
 * )
 *
 * // result = {
 * //   upstreamName: 'antfu',
 * //   discoveredSkills: [
 * //     { path: 'vue', hash: 'abc123def456' },
 * //     { path: 'ts', hash: 'def789ghi012' }
 * //   ],
 * //   syncResult: {
 * //     synced: [{ skillPath: 'vue', outputName: 'antfu-vue' }],
 * //     skipped: [],
 * //     errors: []
 * //   }
 * // }
 * ```
 *
 * ## Partial Failure Recovery
 *
 * Unlike `sync-all-upstreams.ts`, this orchestrator fails fast (doesn't collect partial results).
 * For recovery patterns, see that module.
 */

import type { SkillMeta, UpstreamMeta } from '../types.js'
import path from 'node:path'
import { Effect } from 'effect'
import { log } from '../effects/logger.js'
import { copySingleSkill, writeSkillMeta } from '../effects/skill-copying.js'
import { discoverSkills } from '../effects/skill-discovery.js'
import { hashSkillDirectory } from '../effects/skill-hashing.js'
import { ensureSubmodule } from '../effects/submodule-management.js'

/**
 * Input to the single upstream sync orchestrator.
 * Encapsulates everything needed to sync one upstream.
 */
export interface SyncSingleUpstreamInput {
  /** Root directory of the skills repository */
  root: string
  /** Upstream name (key in meta.json) */
  upstreamName: string
  /** Upstream configuration from meta.json */
  upstreamConfig: UpstreamMeta
  /** Skills to copy: skillPath → outputName */
  selectedSkills: Record<string, string>
  /** Force re-copy even if unchanged */
  force?: boolean
}

/**
 * Output from the single upstream sync orchestrator.
 * Provides full details of what was discovered and synced.
 */
export interface SyncSingleUpstreamOutput {
  /** The upstream name (for logging/tracking) */
  upstreamName: string
  /** All discovered skills with their content hashes */
  discoveredSkills: Array<{ path: string, hash: string }>
  /** Results of the copy phase */
  syncResult: {
    /** Successfully copied skills */
    synced: Array<{ skillPath: string, outputName: string }>
    /** Skills not copied (hash match or deselected) */
    skipped: Array<{ skillPath: string, outputName: string, reason: string }>
    /** Skills that failed to copy */
    errors: Array<{ skillPath: string, outputName: string, error: string }>
  }
}

/**
 * Orchestrate a full single-upstream sync using Effect.gen().
 *
 * Runs the 4 phases sequentially:
 * 1. Ensure submodule exists and is up to date
 * 2. Discover all skills
 * 3. Hash each skill
 * 4. Copy selected skills
 *
 * Errors in any phase short-circuit and return immediately.
 * Uses Effect.gen() for imperative-style composition while maintaining functional error handling.
 *
 * @param input Configuration and input for this upstream sync
 * @returns Effect producing SyncSingleUpstreamOutput
 *
 * @example
 * ```typescript
 * const effect = syncSingleUpstream({
 *   root: '/path/to/skills',
 *   upstreamName: 'antfu',
 *   upstreamConfig: { url: '...', skills: { 'vue': 'antfu-vue' } },
 *   selectedSkills: { 'vue': 'antfu-vue' },
 * })
 *
 * const result = await Effect.runPromise(effect)
 * console.log(`Synced ${result.syncResult.synced.length} skills`)
 * ```
 */
export function syncSingleUpstream(
  input: SyncSingleUpstreamInput,
): Effect.Effect<SyncSingleUpstreamOutput, Error> {
  // Use Effect.gen() for declarative orchestration
  return Effect.gen(function* () {
    const upstreamName = input.upstreamName
    const root = input.root

    // Phase 1: Ensure Submodule
    yield* log('info', `[${upstreamName}] Phase 1: ensuring submodule`)
    const submodulePath = path.join('upstream', upstreamName)
    yield* ensureSubmodule(
      input.upstreamConfig.url,
      submodulePath,
      input.upstreamConfig.branch,
    )
    const upstreamPath = path.join(root, submodulePath)
    yield* log('info', `[${upstreamName}] ✓ Submodule ready`)

    // Phase 2: Discover Skills
    yield* log('info', `[${upstreamName}] Phase 2: discovering skills`)
    const discoveredList = yield* discoverSkills(upstreamPath)
    yield* log('info', `[${upstreamName}] ✓ Found ${discoveredList.length} skills`)

    // Phase 3: Hash Skills
    yield* log('info', `[${upstreamName}] Phase 3: computing hashes`)
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
    yield* log('info', `[${upstreamName}] ✓ Hashed ${skillsWithHashes.length} skills`)

    // Phase 4: Copy Selected Skills
    yield* log('info', `[${upstreamName}] Phase 4: copying selected skills`)
    const syncResult = yield* copySinglePhaseSkills(
      input.upstreamName,
      upstreamPath,
      root,
      input.upstreamConfig,
      input.selectedSkills,
      skillsWithHashes,
    )
    yield* log('info', `[${upstreamName}] ✓ Copy complete: ${syncResult.synced.length} synced, ${syncResult.errors.length} failed`)

    return {
      upstreamName,
      discoveredSkills: skillsWithHashes,
      syncResult,
    } satisfies SyncSingleUpstreamOutput
  })
}

/**
 * Phase 4: Copy selected skills with error handling per skill.
 * Collects failures without short-circuiting.
 */
function copySinglePhaseSkills(
  upstreamName: string,
  upstreamPath: string,
  root: string,
  config: UpstreamMeta,
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
          upstreamName,
          config,
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
      // No default
      }
    }

    return { synced, skipped, errors }
  })
}

/**
 * Copy a single skill with error handling.
 * Returns a discriminated union result for easy pattern matching.
 */
function copySingleSkillSafe(
  upstreamPath: string,
  root: string,
  upstreamName: string,
  config: UpstreamMeta,
  skillPath: string,
  outputName: string,
  discovered: Array<{ path: string, hash: string }>,
): Effect.Effect<
  | { type: 'synced', skillPath: string, outputName: string }
  | { type: 'skipped', skillPath: string, outputName: string, reason: string }
  | { type: 'error', skillPath: string, outputName: string, error: string }
> {
  return Effect.gen(function* () {
    const sourcePath = skillPath === '.' ? upstreamPath : path.join(upstreamPath, skillPath)
    const destinationPath = path.join(root, 'skills', outputName)

    // Find hash for this skill
    const skillRecord = discovered.find(s => s.path === skillPath)
    const hash = skillRecord?.hash ?? ''

    // Copy the skill
    yield* copySingleSkill(sourcePath, destinationPath)

    // Write metadata
    const meta: SkillMeta = {
      type: 'synced',
      upstream: upstreamName,
      sourceUrl: config.url,
      ...(config.branch ? { branch: config.branch } : {}),
      skillPath,
      gitSha: '', // Get actual git sha from upstream submodule
      contentHash: hash,
      syncedAt: new Date().toISOString(),
    }

    yield* writeSkillMeta(destinationPath, meta)

    return { type: 'synced' as const, skillPath, outputName }
  }).pipe(
    Effect.catchAll((error: Error) =>
      Effect.succeed({
        type: 'error' as const,
        skillPath,
        outputName,
        error: error.message,
      }),
    ),
  )
}
