import { describe, expect, it } from 'vitest'
import { MockGitOps } from './mock-git-ops.js'

describe('mockGitOps', () => {
  it('should execute git commands without calling real git', () => {
    const git = new MockGitOps()

    // Simulate setting a command result that MockGitOps will "return"
    git.setCommandResult('git status', { stdout: 'On branch main', exitCode: 0 })

    // Execute the command
    const result = git.execSync('git status')

    // Verify it returns our mock result, not actual git output
    expect(result.stdout).toBe('On branch main')
    expect(result.exitCode).toBe(0)
  })
})
