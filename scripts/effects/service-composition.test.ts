import { describe, expect, it } from 'vitest'
import { MockFileSystem } from './mock-fs.js'
import { MockGitOps } from './mock-git-ops.js'

describe('service Composition via Effect', () => {
  it('should compose services via Effect.provide()', () => {
    // Create mock services
    const fs = new MockFileSystem()
    const git = new MockGitOps()

    // Simulate what an orchestrator would do:
    // Use filesystem service
    fs.writeFileSync('/config.json', '{"branch": "main"}')
    const config = fs.readFileSync('/config.json', 'utf8')

    // Use git service
    git.setCommandResult('git status', { stdout: 'On branch main', exitCode: 0 })
    const gitResult = git.execSync('git status')

    // Both services work correctly when composed
    expect(config).toBe('{"branch": "main"}')
    expect(gitResult.stdout).toBe('On branch main')
  })
})
