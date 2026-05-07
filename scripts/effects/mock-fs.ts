/**
 * MockFileSystem — In-memory filesystem for testing without disk I/O.
 *
 * ## Dependency Injection Pattern
 *
 * This class demonstrates the DI pattern for effects-based services:
 * - **Service Interface**: Provides read/write operations compatible with Node's `fs` module
 * - **Testability**: Tests inject this mock instead of real filesystem
 * - **Effect Context**: Implementations of this service are composed via Effect.provide()
 *
 * Example:
 * ```typescript
 * // In production:
 * const FileSystem = Effect.sync(() => new RealFileSystem())
 *
 * // In tests:
 * const FileSystemMock = Effect.sync(() => new MockFileSystem())
 *
 * // Orchestrator uses Either, doesn't know which is real:
 * const result = pipe(
 *   Effect.provide(FileSystem)(myOrchestrator),
 *   Effect.runSync
 * )
 * ```
 *
 * ## Context Shape
 *
 * Services export a Context tag for use in Effect layers:
 * ```typescript
 * export const FileSystemTag = Context.Tag<MockFileSystem>()
 * ```
 *
 * This allows:
 * - Type-safe service lookup: `Effect.serviceOption(FileSystemTag)`
 * - Composition: `Effect.provide(Layer.succeed(FileSystemTag, new MockFileSystem()))(effect)`
 */
export class MockFileSystem {
  private files = new Map<string, string>()

  /**
   * Write content to a file path in memory.
   * @param path - File path (e.g., '/test/file.txt')
   * @param content - File content as string
   */
  writeFileSync(path: string, content: string): void {
    this.files.set(path, content)
  }

  /**
   * Read content from a file path in memory.
   * @param path - File path (e.g., '/test/file.txt')
   * @param _encoding - Text encoding (e.g., 'utf-8') - unused but included for compatibility
   * @returns File content as string
   */
  readFileSync(path: string, _encoding: string): string {
    const content = this.files.get(path)
    if (content === undefined) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`)
    }
    return content
  }
}
