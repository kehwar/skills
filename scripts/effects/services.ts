/**
 * Service Composition and Dependency Injection Layer
 *
 * This file demonstrates the Effect-based DI pattern used throughout scripts/.
 * All orchestrators depend on services defined here, injected via Effect layers.
 *
 * ## Architecture Overview
 *
 * ```
 * CLI Layer (entry points: sync.ts, check.ts, etc.)
 *   ↓
 * Orchestrators Layer (orchestration logic, high-level workflows)
 *   ↓
 * Effects Layer (services: filesystem, git, logging) ← YOU ARE HERE
 *   ↓
 * Core Layer (primitives, no Effect dependencies)
 * ```
 *
 * ## Layer 1: Core Primitives
 *
 * Pure Effect wrappers around Node.js APIs with typed error handling:
 *
 * - **fs.ts** — Filesystem operations (readFile, writeFile, mkdir, etc.)
 * - **git.ts** — Git command execution (exec, getHeadSha, submodule ops)
 * - **logger.ts** — Structured logging with levels and indentation
 * - **clock.ts** — Time operations (now, iso8601)
 * - **process.ts** — Process access (cwd, env, exit)
 *
 * Each module exports:
 * - Effect functions that represent operations
 * - Custom error types (e.g., NotFound, CommandFailed, InvalidBranch)
 * - JSDoc with error handling patterns and examples
 *
 * ## Dependency Injection with Effect.provide()
 *
 * These primitives are typically used directly in domain operations and orchestrators:
 *
 * ```typescript
 * // In an orchestrator
 * import { readFile } from '../effects/fs.js'
 * import { getHeadSha } from '../effects/git.js'
 *
 * export const myOrchestrator = pipe(
 *   getHeadSha(),
 *   Effect.flatMap(sha => readFile(`.git/refs/heads/${sha}`))
 * )
 * ```
 *
 * For advanced DI patterns (e.g., swapping implementations), wrap in Context.Tag:
 *
 * ```typescript
 * import { Context } from 'effect'
 *
 * interface FileSystem {
 *   readFile(path: string): Effect<string, NotFound | IOError>
 * }
 *
 * export const FileSystemTag = Context.Tag<FileSystem>('FileSystem')
 *
 * // Production layer
 * export const productionFS = Layer.succeed(FileSystemTag, {
 *   readFile: (path) => readFile(path)
 * })
 *
 * // Test layer
 * export const mockFS = Layer.succeed(FileSystemTag, {
 *   readFile: (path) => Effect.succeed('mock content')
 * })
 * ```
 *
 * ## Usage in Tests
 *
 * Test utilities can mock Layer 1 services by providing alternative implementations:
 *
 * ```typescript
 * // Mock all operations to return test data
 * const mockServices = {
 *   fs: {
 *     readFile: () => Effect.succeed('test file'),
 *     writeFile: () => Effect.succeed(undefined),
 *   },
 *   git: {
 *     exec: () => Effect.succeed('git status'),
 *   }
 * }
 * ```
 *
 * ## Benefits of This Pattern
 *
 * 1. **Type Safety** — Effect's error channel enforces error handling
 * 2. **Testability** — All operations are Effects; easily mocked with Effect.succeed
 * 3. **Composability** — Combine operations with pipe(), flatMap(), etc.
 * 4. **Error Propagation** — Errors short-circuit automatically; no manual threading
 * 5. **Observable** — Effect allows introspection, retry, timeout, and tracing
 * 6. **Gradual Migration** — Old Result<T> and new Effect code can coexist
 */

import { MockFileSystem } from './mock-fs.js'
import { MockGitOps } from './mock-git-ops.js'

/**
 * Context tags for dependency injection (for advanced DI patterns).
 * These are optional; Layer 1 primitives can be used directly without tags.
 *
 * Usage:
 * ```typescript
 * export const FileSystemTag = Context.Tag<FileSystem>('FileSystem')
 * export const GitOpsTag = Context.Tag<GitOps>('GitOps')
 * ```
 *
 * Note: Currently, tags are not exported; Layer 1 uses direct Effect functions.
 * If orchestrators need to swap implementations, add Context.Tag exports here.
 */

export function createTestFileSystemLayer() {
  return new MockFileSystem()
}

export function createTestGitOpsLayer() {
  return new MockGitOps()
}

/**
 * Get all test service instances for convenient composition.
 *
 * DEPRECATED: Use Layer 1 Effect functions directly (fs.ts, git.ts, etc.)
 *
 * Usage in tests:
 * ```typescript
 * // Old pattern (still supported for backward compatibility)
 * const services = getTestServices()
 * services.fs.readFileSync(path)
 *
 * // New pattern (recommended)
 * import { readFile } from './fs.js'
 * Effect.runSync(readFile(path))
 * ```
 */
export function getTestServices() {
  return {
    fs: createTestFileSystemLayer(),
    git: createTestGitOpsLayer(),
  }
}

/**
 * Layer 1 Service Summary
 *
 * All services are now Effect-based and fully typed:
 *
 * - **fs module**: readFile, writeFile, mkdir, copy, symlink, remove, exists, readDir
 *   Error types: NotFound, PermissionDenied, IOError
 *
 * - **git module**: exec, getHeadSha, addSubmodule, initSubmodule, fetchSubmodule,
 *   setSubmoduleBranch, checkoutBranch, deinitSubmodule, removeSubmoduleFromGitmodules, revListCount
 *   Error types: GitNotFound, CommandFailed, InvalidBranch
 *
 * - **logger module**: log, indent
 *   No errors; logging is always successful
 *
 * - **clock module**: now, iso8601
 *   No errors; time operations always succeed
 *
 * - **process module**: exit, cwd, env
 *   No errors; process operations always succeed
 *
 * To use these services in an orchestrator:
 *
 * ```typescript
 * import * as fs from './fs.js'
 * import * as git from './git.js'
 * import * as logger from './logger.js'
 *
 * export const myOrchestrator = pipe(
 *   logger.log('info', 'Starting sync...'),
 *   Effect.flatMap(() => fs.readFile('/tmp/config.json')),
 *   Effect.flatMap(config => git.exec('git status')),
 *   Effect.catch(fs.NotFound, () => 'config not found')
 * )
 * ```
 */
