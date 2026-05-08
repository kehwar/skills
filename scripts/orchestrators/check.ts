/**
 * Check All Upstreams Orchestrator
 *
 * ## Architecture
 *
 * Manages checking multiple upstream repositories for available updates with partial failure recovery.
 *
 * Key pattern: Use Effect.forEach() with concurrency control to check upstreams in parallel,
 * collecting both successes and failures. Transient upstream issues don't block checking others.
 *
 * ## Workflow
 *
 * 1. **Fetch Remotes** — Fetch all remote changes for each submodule
 * 2. **Count Behind** — Count commits behind for each upstream
 * 3. **Aggregate Results** — Collect all successes and errors
 * 4. **Report** — Provide detailed breakdown of available updates
 *
 * ## Error Handling Strategy
 *
 * Uses **partial failure recovery**: If upstream A's fetch fails, upstreams B and C continue.
 * All errors are collected and reported at the end.
 *
 * Example:
 * - 3 upstreams to check
 * - Upstream 1 fetches successfully, finds 5 commits behind
 * - Upstream 2 has network timeout
 * - Upstream 3 fetches successfully, finds 0 commits behind
 * - Result aggregates success count + error details
 *
 * @example
 * ```typescript
 * import { check } from './check.js'
 * import { Effect } from 'effect'
 *
 * const result = await Effect.runPromise(
 *   check({
 *     root: '/path/to/skills',
 *     upstreams: {
 *       antfu: { url: '...', skills: { 'vue': 'antfu-vue' } },
 *       vuejs: { url: '...', skills: { 'ts': 'vuejs-ts' } }
 *     }
 *   })
 * )
 *
 * // result = {
 * //   totalUpstreams: 2,
 * //   results: [
 * //     { upstreamName: 'antfu', behind: 5, skills: ['vue'] },
 * //     { upstreamName: 'vuejs', behind: 0, skills: ['ts'] }
 * //   ]
 * // }
 * ```
 */

import type { UpstreamMeta } from '../types.js'
import path from 'node:path'
import { Effect } from 'effect'
import { exists } from '../effects/fs.js'
import { revListCount } from '../effects/git.js'
import { log } from '../effects/logger.js'

/**
 * Input to check all upstreams.
 */
export interface CheckInput {
  /** Root directory of the skills repository */
  root: string
  /** All upstreams to check: name → config */
  upstreams: Record<string, UpstreamMeta>
}

/**
 * Result for one upstream check.
 */
export interface CheckResult {
  upstreamName: string
  behind: number
  skills?: string[]
  error?: string
}

/**
 * Aggregated output from checking all upstreams.
 */
export interface CheckOutput {
  /** Total upstreams checked */
  totalUpstreams: number
  /** Result for each upstream (success or error) */
  results: CheckResult[]
}

/**
 * Check all configured upstreams for available updates with partial failure recovery.
 *
 * For each upstream:
 * - Fetch remote changes
 * - Count commits behind HEAD..@{u}
 * - Collect result or error
 *
 * Returns aggregated results with successes and failures.
 *
 * @param input Configuration for checking all upstreams
 * @returns Effect producing CheckOutput
 *
 * @example
 * ```typescript
 * const result = await Effect.runPromise(
 *   check({
 *     root: '/path/to/skills',
 *     upstreams: store.getAllUpstreams()
 *   })
 * )
 *
 * console.log(`Checked ${result.totalUpstreams} upstreams`)
 * for (const result of result.results) {
 *   if (result.error) {
 *     console.error(`${result.upstreamName}: ${result.error}`)
 *   } else {
 *     console.log(`${result.upstreamName}: ${result.behind} commits behind`)
 *   }
 * }
 * ```
 */
export function check(
  input: CheckInput,
): Effect.Effect<CheckOutput, never> {
  const upstreamEntries = Object.entries(input.upstreams)

  return Effect.gen(function* () {
    yield* log('info', `Checking ${upstreamEntries.length} upstreams`)

    const results: CheckResult[] = yield* Effect.all(
      upstreamEntries.map(([upstreamName, upstreamConfig]) => {
        return checkSingleUpstream(
          input.root,
          upstreamName,
          upstreamConfig,
        ).pipe(
          Effect.catchAll((error) => {
            // Collect error but don't short-circuit
            return Effect.succeed({
              upstreamName,
              behind: 0,
              error: (error as Error).message,
            } satisfies CheckResult)
          }),
        )
      }),
      { concurrency: 'unbounded' },
    )

    return {
      totalUpstreams: upstreamEntries.length,
      results,
    } satisfies CheckOutput
  })
}

/**
 * Check a single upstream for available updates.
 *
 * Phases:
 * 1. Verify submodule directory exists
 * 2. Fetch remote changes
 * 3. Count commits behind
 *
 * @param root Root directory of the skills repository
 * @param upstreamName Upstream name
 * @param upstreamConfig Upstream configuration
 * @returns Effect producing CheckResult
 */
function checkSingleUpstream(
  root: string,
  upstreamName: string,
  upstreamConfig: UpstreamMeta,
): Effect.Effect<CheckResult, Error> {
  return Effect.gen(function* () {
    const submodulePath = path.join(root, 'upstream', upstreamName)

    // Collect skills list for reporting (do this even if submodule doesn't exist)
    const skills = upstreamConfig.skills
      ? Object.values(upstreamConfig.skills)
      : undefined

    // Verify submodule exists
    const submoduleExists = yield* exists(submodulePath)
    if (!submoduleExists) {
      return {
        upstreamName,
        behind: 0,
        skills,
        error: `Submodule not found at ${submodulePath}`,
      } satisfies CheckResult
    }

    // Count commits behind HEAD..@{u}
    const countResult = yield* revListCount(submodulePath, 'HEAD..@{u}')

    return {
      upstreamName,
      behind: countResult,
      skills,
    } satisfies CheckResult
  })
}
