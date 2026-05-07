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

import path from 'node:path'
import { spawn } from '@npmcli/git'
import { Effect, pipe } from 'effect'
import { exists, readFile, remove } from './fs.js'

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

      // Build submodule add arguments
      const addArguments = ['submodule', 'add']
      if (branch) {
        addArguments.push('--branch', branch)
      }
      addArguments.push(url, subPath)

      return pipe(
        Effect.tryPromise({
          try: async () => {
            try {
              await spawn(addArguments)
            }
            catch (error) {
              throw new Error(`Failed to add submodule: ${error instanceof Error ? error.message : String(error)}`)
            }

            try {
              await spawn(['submodule', 'update', '--init', '--recursive', '--', subPath])
            }
            catch (error) {
              throw new Error(`Failed to update submodule: ${error instanceof Error ? error.message : String(error)}`)
            }
          },
          catch: (error) => {
            return new SubmoduleError(`Failed to ensure submodule: ${error instanceof Error ? error.message : String(error)}`)
          },
        }),
        Effect.flatMap(() => Effect.void),
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
  return Effect.tryPromise({
    try: async () => {
      if (!branch || !/^[\w./-]+$/.test(branch)) {
        throw new Error(`Invalid branch name: ${branch}`)
      }

      try {
        await spawn(['config', '-f', '.gitmodules', `submodule.${subPath}.branch`, branch])
      }
      catch (error) {
        throw new Error(`Failed to set branch config: ${error instanceof Error ? error.message : String(error)}`)
      }

      try {
        await spawn(['submodule', 'update', '--remote', '--', subPath])
      }
      catch (error) {
        throw new Error(`Failed to update submodule remote: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
    catch: (error) => {
      if (error instanceof SubmoduleError) {
        return error
      }
      return new SubmoduleError(`Failed to update submodule branch: ${error instanceof Error ? error.message : String(error)}`)
    },
  })
}

/**
 * Remove submodule completely (from .gitmodules and filesystem) using Layer 1 primitives for fs operations.
 *
 * @param subPath — Relative path of submodule
 * @returns Effect with void
 */
export function removeSubmodule(subPath: string): Effect.Effect<void, SubmoduleError> {
  return pipe(
    // Check if directory exists using Layer 1 primitive
    exists(subPath),
    Effect.flatMap((directoryExists) => {
      return Effect.tryPromise({
        try: async () => {
          // Deinitialize submodule
          try {
            await spawn(['submodule', 'deinit', '-f', '--', subPath])
          }
          catch (error) {
            throw new Error(`Failed to deinit submodule: ${error instanceof Error ? error.message : String(error)}`)
          }

          // Remove from git index
          try {
            await spawn(['rm', '-f', subPath])
          }
          catch (error) {
            throw new Error(`Failed to remove from index: ${error instanceof Error ? error.message : String(error)}`)
          }

          // Remove from .gitmodules
          try {
            await spawn(['config', '-f', '.gitmodules', '--remove-section', `submodule.${subPath}`])
          }
          catch (error) {
            throw new Error(`Failed to remove .gitmodules section: ${error instanceof Error ? error.message : String(error)}`)
          }

          // Return whether we need to clean up directory
          return { needsRemove: directoryExists }
        },
        catch: (error) => {
          return new SubmoduleError(`Failed to remove submodule: ${error instanceof Error ? error.message : String(error)}`)
        },
      })
    }),
    Effect.flatMap((result) => {
      if (result.needsRemove) {
        return pipe(
          remove(subPath, true),
          Effect.catchAll(() => Effect.void), // Ignore removal errors for this operation
        )
      }
      return Effect.void
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
