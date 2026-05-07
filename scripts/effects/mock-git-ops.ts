/**
 * MockGitOps — Mock git command executor for testing without real git operations.
 *
 * ## Dependency Injection Pattern
 *
 * This class demonstrates a service that can be swapped between real and mock
 * implementations. Orchestrators that depend on git operations can be tested
 * by injecting this mock instead of the real GitOps service.
 *
 * Usage:
 * ```typescript
 * // In tests:
 * const git = new MockGitOps()
 * git.setCommandResult('git fetch origin', { stdout: '...', exitCode: 0 })
 * const result = git.execSync('git fetch origin')
 *
 * // In production, use RealGitOps (or similar):
 * const git = new RealGitOps()
 * const result = git.execSync('git fetch origin')
 *
 * // Orchestrators don't care which is which:
 * const orchestrate = (git: GitOpsService) => {
 *   return git.execSync('git status')
 * }
 * ```
 *
 * ## Context Shape
 *
 * Services export a Context tag for composition in Effect:
 * ```typescript
 * export const GitOpsTag = Context.Tag<MockGitOps>()
 * ```
 *
 * Layers compose services:
 * ```typescript
 * const mockGitLayer = Layer.succeed(GitOpsTag, new MockGitOps())
 * Effect.provide(mockGitLayer)(myOrchestrator)
 * ```
 */

export interface GitCommandResult {
  stdout: string
  exitCode: number
}

export class MockGitOps {
  private commandResults = new Map<string, GitCommandResult>()

  /**
   * Register a mock result for a specific git command.
   * Allows test setup: `git.setCommandResult('git fetch', { stdout: '...', exitCode: 0 })`
   *
   * @param command - The git command (e.g., 'git fetch origin')
   * @param result - The result to return when this command is executed
   */
  setCommandResult(command: string, result: GitCommandResult): void {
    this.commandResults.set(command, result)
  }

  /**
   * Execute a git command (returns mock result without calling real git).
   * Throws if command has not been registered via setCommandResult.
   *
   * @param command - The git command to execute
   * @returns Mocked command result
   */
  execSync(command: string): GitCommandResult {
    const result = this.commandResults.get(command)
    if (result === undefined) {
      throw new Error(`Unregistered mock command: ${command}`)
    }
    return result
  }
}
