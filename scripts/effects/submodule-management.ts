/**
 * Submodule Management — Effect-based git submodule operations.
 *
 * ## Implementation
 *
 * Manages submodule lifecycle: init, update, remove using Layer 1 fs primitives.
 * Implements 3-state machine:
 * - State 1: Not registered (not in .gitmodules)
 * - State 2: Missing dir (registered but directory missing)
 * - State 3: Exists (registered and directory present)
 */

import { Effect, pipe } from 'effect'
import { exists, readFile, remove } from './fs.js'
import {
  addSubmodule,
  deinitSubmodule,
  removeSubmoduleFromGitmodules,
  rmFromIndex,
  setSubmoduleBranch,
  updateSubmoduleInit,
  updateSubmoduleRemote,
} from './git.js'

/**
 * SubmoduleError — Failed submodule operation.
 */
export class SubmoduleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SubmoduleError'
  }
}

/**
 * Submodule state enumeration.
 */
export enum SubmoduleState {
  NotRegistered = 'not-registered',
  MissingDirectory = 'missing-dir',
  Exists = 'exists',
}

/**
 * 3-state machine: ensure submodule is in correct state.
 *
 * - NotRegistered → Init: Register in .gitmodules, init, fetch
 * - MissingDirectory → Init: Re-init and fetch
 * - Exists → Skip: Already initialized
 *
 * Uses Layer 1 fs primitives to check state.
 *
 * @param url — GitHub repository URL
 * @param subPath — Relative path in repository
 * @param branch — Optional branch to track
 * @returns Effect with void
 */
export function ensureSubmodule(url: string, subPath: string, branch?: string): Effect.Effect<void, SubmoduleError> {
  return pipe(
    getSubmoduleStateEffect(subPath),
    Effect.flatMap((state) => {
      if (state === SubmoduleState.Exists) {
        // Already initialized - skip
        return Effect.void
      }

      // Add submodule with optional branch
      return pipe(
        addSubmodule(url, subPath, branch),
        Effect.flatMap(() => updateSubmoduleInit(subPath)),
        Effect.mapError(
          error => new SubmoduleError(
            `Failed to ensure submodule: ${error instanceof Error ? error.message : String(error)}`,
          ),
        ),
      )
    }),
  )
}

/**
 * Update submodule to track different branch.
 *
 * @param subPath — Relative path of submodule
 * @param branch — New branch to track
 * @returns Effect with void
 */
export function updateSubmoduleBranch(subPath: string, branch: string): Effect.Effect<void, SubmoduleError> {
  if (!branch || !/^[\w./-]+$/.test(branch)) {
    return Effect.fail(new SubmoduleError(`Invalid branch name: ${branch}`))
  }

  return pipe(
    setSubmoduleBranch(subPath, branch),
    Effect.flatMap(() => updateSubmoduleRemote(subPath)),
    Effect.mapError(
      error => new SubmoduleError(
        `Failed to update submodule branch: ${error instanceof Error ? error.message : String(error)}`,
      ),
    ),
  )
}

/**
 * Remove submodule completely (from .gitmodules and filesystem) using Layer 1 primitives for fs operations.
 *
 * @param subPath — Relative path of submodule
 * @returns Effect with void
 */
export function removeSubmodule(subPath: string): Effect.Effect<void, SubmoduleError> {
  return pipe(
    exists(subPath),
    Effect.flatMap((directoryExists) => {
      return pipe(
        // Deinitialize, remove from index, and remove from .gitmodules
        deinitSubmodule(subPath),
        Effect.flatMap(() => rmFromIndex(subPath)),
        Effect.flatMap(() => removeSubmoduleFromGitmodules(subPath)),
        Effect.mapError(
          error => new SubmoduleError(
            `Failed to remove submodule: ${error instanceof Error ? error.message : String(error)}`,
          ),
        ),
        Effect.flatMap(() => {
          // Clean up directory if it exists
          if (directoryExists) {
            return pipe(
              remove(subPath, true),
              Effect.catchAll(() => Effect.void), // Ignore removal errors
            )
          }
          return Effect.void
        }),
      )
    }),
  )
}

/**
 * Determine submodule state using Layer 1 fs primitives.
 * Returns an Effect instead of synchronous value.
 */
function getSubmoduleStateEffect(subPath: string): Effect.Effect<SubmoduleState, SubmoduleError> {
  return pipe(
    // Try to read .gitmodules
    readFile('.gitmodules'),
    Effect.flatMap((gitmodules) => {
      const isRegistered = gitmodules.includes(`[submodule "${subPath}"]`)

      if (!isRegistered) {
        return Effect.succeed(SubmoduleState.NotRegistered)
      }

      // Check if directory exists
      return pipe(
        exists(subPath),
        Effect.map((directoryExists) => {
          if (!directoryExists) {
            return SubmoduleState.MissingDirectory
          }
          return SubmoduleState.Exists
        }),
      )
    }),
    Effect.catchAll(() => {
      // .gitmodules doesn't exist or can't be read
      return Effect.succeed(SubmoduleState.NotRegistered)
    }),
  )
}
