/**
 * Submodule Management — Effect-based git submodule operations.
 *
 * ## Implementation
 *
 * Manages submodule lifecycle: init, update, remove.
 * Implements 3-state machine:
 * - State 1: Not registered (not in .gitmodules)
 * - State 2: Missing dir (registered but directory missing)
 * - State 3: Exists (registered and directory present)
 */

import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { spawn } from '@npmcli/git'
import { Effect } from 'effect'

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
 * @param url — GitHub repository URL
 * @param subPath — Relative path in repository
 * @param branch — Optional branch to track
 * @returns Effect with void
 */
export function ensureSubmodule(url: string, subPath: string, branch?: string): Effect.Effect<void, SubmoduleError> {
  return Effect.tryPromise({
    try: async () => {
      const state = getSubmoduleState(subPath)

      if (state === SubmoduleState.Exists) {
        // Already initialized - skip
        return
      }

      // Build submodule add arguments
      const addArguments = ['submodule', 'add']
      if (branch) {
        addArguments.push('--branch', branch)
      }
      addArguments.push(url, subPath)

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
      if (error instanceof SubmoduleError) {
        return error
      }
      return new SubmoduleError(`Failed to ensure submodule: ${error instanceof Error ? error.message : String(error)}`)
    },
  })
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
 * Remove submodule completely (from .gitmodules and filesystem).
 *
 * @param subPath — Relative path of submodule
 * @returns Effect with void
 */
export function removeSubmodule(subPath: string): Effect.Effect<void, SubmoduleError> {
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

      // Clean up directory
      if (existsSync(subPath)) {
        rmSync(subPath, { recursive: true, force: true })
      }
    },
    catch: (error) => {
      if (error instanceof SubmoduleError) {
        return error
      }
      return new SubmoduleError(`Failed to remove submodule: ${error instanceof Error ? error.message : String(error)}`)
    },
  })
}

/**
 * Determine submodule state.
 */
function getSubmoduleState(subPath: string): SubmoduleState {
  // Check if registered in .gitmodules
  let isRegistered = false
  try {
    const gitmodules = readFileSync('.gitmodules', 'utf8')
    isRegistered = gitmodules.includes(`[submodule "${subPath}"]`)
  }
  catch {
    // .gitmodules doesn't exist
  }

  if (!isRegistered) {
    return SubmoduleState.NotRegistered
  }

  // Check if directory exists
  if (!existsSync(subPath)) {
    return SubmoduleState.MissingDirectory
  }

  return SubmoduleState.Exists
}
