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
 * ## Service Definition Pattern
 *
 * Each service is defined by:
 *
 * 1. **An interface or class** — The service's public API
 *    ```typescript
 *    export class FileSystem { readSync(path) { ... } }
 *    ```
 *
 * 2. **A Context.Tag** — Used by Effect to inject the service
 *    ```typescript
 *    export const FileSystemTag = Context.Tag<FileSystem>()
 *    ```
 *
 * 3. **Production and test implementations**
 *    ```typescript
 *    // Production: touches real filesystem
 *    export const productionFileSystem = Layer.succeed(
 *      FileSystemTag,
 *      new RealFileSystem()
 *    )
 *
 *    // Test: in-memory filesystem
 *    export const testFileSystem = Layer.succeed(
 *      FileSystemTag,
 *      new MockFileSystem()
 *    )
 *    ```
 *
 * ## Usage in Orchestrators
 *
 * An orchestrator (e.g., `syncOrchestrator()`) is an Effect that depends on services:
 *
 * ```typescript
 * export const syncOrchestrator = Effect.flatMap(
 *   Effect.service(FileSystemTag),
 *   (fs) => Effect.flatMap(
 *     Effect.service(GitOpsTag),
 *     (git) => {
 *       // Use fs and git here
 *       fs.writeSync('/path', 'data')
 *       git.execSync('git status')
 *       return Effect.succeed(result)
 *     }
 *   )
 * )
 * ```
 *
 * ## Composition in CLI
 *
 * At the CLI layer, compose all service layers and run the orchestrator:
 *
 * ```typescript
 * // sync.ts entry point
 * const layers = [
 *   productionFileSystem,
 *   productionGitOps,
 *   productionLogger,
 * ]
 *
 * const result = Effect.runSync(
 *   Effect.provide(Layer.mergeAll(...layers))(
 *     syncOrchestrator
 *   )
 * )
 * ```
 *
 * ## Composition in Tests
 *
 * In tests, inject mocks instead:
 *
 * ```typescript
 * const mockLayers = [
 *   testFileSystem,      // MockFileSystem instead of RealFileSystem
 *   testGitOps,          // MockGitOps instead of RealGitOps
 *   testLogger,          // MockLogger instead of RealLogger
 * ]
 *
 * const result = Effect.runSync(
 *   Effect.provide(Layer.mergeAll(...mockLayers))(
 *     syncOrchestrator
 *   )
 * )
 *
 * // Now the orchestrator uses mocks, no real filesystem/git calls
 * ```
 *
 * ## Context Shapes
 *
 * Each service's Context describes what data it provides.
 *
 * For example, FileSystem's context provides the interface:
 * ```typescript
 * interface FileSystem {
 *   readSync(path: string, encoding: string): string
 *   writeSync(path: string, content: string): void
 * }
 * ```
 *
 * This shape is enforced at compile time by TypeScript.
 * If an orchestrator tries to call a method that doesn't exist,
 * TypeScript will catch it before runtime.
 *
 * ## Benefits of This Pattern
 *
 * 1. **Testability** — No global mocks or spies. Inject test doubles via layers.
 * 2. **Composability** — Services can be combined; new workflows reuse existing services.
 * 3. **Clarity** — Data flow is explicit: services are parameters, not hidden.
 * 4. **Type Safety** — TypeScript verifies at compile time that all services exist.
 * 5. **Observability** — Each service can add logging/tracing transparently.
 * 6. **Recovery** — Effect layers can implement retry, timeout, and error handlers.
 */

import { MockFileSystem } from './mock-fs.js'
import { MockGitOps } from './mock-git-ops.js'

/**
 * Context tags for dependency injection.
 * Used with Effect.service() in orchestrators to request a service.
 *
 * Note: These are simple markers for now; full Effect composition
 * will be implemented in future slices when orchestrators use them.
 */
export const FileSystemTag = 'FileSystem'
export const GitOpsTag = 'GitOps'

/**
 * Layers that provide services for testing.
 *
 * In production, these would be replaced with:
 * - RealFileSystem (touches actual filesystem)
 * - RealGitOps (executes real git commands)
 * - RealLogger (writes to console/files)
 *
 * By default, this module provides test implementations for scripting.
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
 * Usage in tests:
 * ```typescript
 * const services = getTestServices()
 * // services.fs and services.git are available for orchestrator use
 * ```
 */
export function getTestServices() {
  return {
    fs: createTestFileSystemLayer(),
    git: createTestGitOpsLayer(),
  }
}
