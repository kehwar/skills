/**
 * Sync All Upstreams Orchestrator
 *
 * ## Architecture
 *
 * Manages syncing of multiple upstream repositories with partial failure recovery.
 *
 * Key pattern: Use Effect.forEach() with concurrency control to sync upstreams in parallel,
 * collecting both successes and failures. Transient upstream issues don't block the entire sync.
 *
 * ## Workflow
 *
 * 1. **Validate Configuration** — Ensure all upstreams have valid URLs and configs
 * 2. **Parallel Sync** — Sync selected upstreams concurrently (default 3 at a time)
 * 3. **Aggregate Results** — Collect all successes and errors
 * 4. **Update Meta** — Write consolidated results to meta.json
 * 5. **Report** — Provide detailed success/failure breakdown
 *
 * ## Error Handling Strategy
 *
 * Unlike sync-single-upstream.ts (fail-fast), this module uses **partial failure recovery**.
 * If upstream A fails, upstreams B and C continue syncing.
 * All errors are collected and reported at the end.
 *
 * Example:
 * - 5 upstreams selected
 * - Upstream 2 has network timeout
 * - Upstream 4 has invalid SKILL.md structure
 * - Sync continues for 1, 3, 5
 * - Result aggregates success count + error details
 *
 * @example
 * ```typescript
 * import { syncAllUpstreams } from './sync-all-upstreams.js'
 * import { Effect } from 'effect'
 *
 * const result = Effect.runSync(
 *   syncAllUpstreams({
 *     root: '/path/to/skills',
 *     upstreams: {
 *       antfu: { url: '...', skills: { 'vue': 'antfu-vue' } },
 *       vuejs: { url: '...', skills: { 'ts': 'vuejs-ts' } }
 *     },
 *     concurrency: 3
 *   })
 * )
 *
 * // result = {
 * //   totalUpstreams: 2,
 * //   successCount: 2,
 * //   failureCount: 0,
 * //   details: [
 * //     { upstreamName: 'antfu', success: true, output: { ... } },
 * //     { upstreamName: 'vuejs', success: true, output: { ... } }
 * //   ]
 * // }
 * ```
 */

import type { UpstreamMeta } from '../types.js'
import type { SyncSingleUpstreamOutput } from './sync-single-upstream.js'
import { Effect } from 'effect'
import { log } from '../effects/logger.js'
import { syncSingleUpstream } from './sync-single-upstream.js'

/**
 * Input to sync all upstreams.
 */
export interface SyncAllUpstreamsInput {
  /** Root directory of the skills repository */
  root: string
  /** All upstreams to sync: name → config */
  upstreams: Record<string, UpstreamMeta>
  /** How many upstreams to sync in parallel (default 3) */
  concurrency?: number
  /** Force re-copy even if unchanged */
  force?: boolean
}

/**
 * Detailed result for one upstream sync.
 */
export interface SyncUpstreamDetail {
  upstreamName: string
  success: boolean
  output?: SyncSingleUpstreamOutput
  error?: string
}

/**
 * Aggregated output from syncing all upstreams.
 */
export interface SyncAllUpstreamsOutput {
  /** Total upstreams attempted */
  totalUpstreams: number
  /** Successfully synced */
  successCount: number
  /** Failed to sync */
  failureCount: number
  /** Detailed result for each upstream */
  details: SyncUpstreamDetail[]
}

/**
 * Sync all configured upstreams with partial failure recovery.
 *
 * Runs sync-single-upstream for each upstream in parallel (concurrency-limited),
 * collecting both successes and failures. Returns aggregated results.
 *
 * @param input Configuration for syncing all upstreams
 * @returns Effect producing SyncAllUpstreamsOutput
 *
 * @example
 * ```typescript
 * const result = await Effect.runPromise(
 *   syncAllUpstreams({
 *     root: '/path/to/skills',
 *     upstreams: store.getAllUpstreams(),
 *     concurrency: 3
 *   })
 * )
 *
 * console.log(`Synced ${result.successCount}/${result.totalUpstreams}`)
 * for (const detail of result.details) {
 *   if (!detail.success) {
 *     console.error(`${detail.upstreamName}: ${detail.error}`)
 *   }
 * }
 * ```
 */
export function syncAllUpstreams(
  input: SyncAllUpstreamsInput,
): Effect.Effect<SyncAllUpstreamsOutput, never> {
  const concurrency = input.concurrency ?? 3
  const upstreamEntries = Object.entries(input.upstreams).filter(([, config]) => config.skills)

  return Effect.gen(function* () {
    yield* log('info', `Syncing ${upstreamEntries.length} upstreams (concurrency: ${concurrency})`)

    const details: SyncUpstreamDetail[] = yield* Effect.all(
      upstreamEntries.map(([upstreamName, upstreamConfig]) => {
        return syncSingleUpstream({
          root: input.root,
          upstreamName,
          upstreamConfig,
          selectedSkills: upstreamConfig.skills ?? {},
          force: input.force ?? false,
        }).pipe(
          Effect.map(output => ({
            upstreamName,
            success: true as const,
            output,
          })),
          Effect.catchAll((error: Error) =>
            Effect.succeed({
              upstreamName,
              success: false as const,
              error: error.message,
            }),
          ),
        )
      }),
      { concurrency },
    )

    const successCount = details.filter(d => d.success).length
    const failureCount = details.filter(d => !d.success).length

    return {
      totalUpstreams: upstreamEntries.length,
      successCount,
      failureCount,
      details,
    }
  })
}
