import { describe, expect, it } from 'vitest'
import {
  addSubmodule,
  checkoutBranch,
  CommandFailed,
  deinitSubmodule,
  exec,
  fetchSubmodule,
  getHeadSha,
  GitNotFound,
  initSubmodule,
  InvalidBranch,
  removeSubmoduleFromGitmodules,
  revListCount,
  setSubmoduleBranch,
} from './git.js'

describe('git module', () => {
  it('should export all git operations', () => {
    expect(typeof exec).toBe('function')
    expect(typeof getHeadSha).toBe('function')
    expect(typeof addSubmodule).toBe('function')
    expect(typeof initSubmodule).toBe('function')
    expect(typeof fetchSubmodule).toBe('function')
    expect(typeof setSubmoduleBranch).toBe('function')
    expect(typeof checkoutBranch).toBe('function')
    expect(typeof deinitSubmodule).toBe('function')
    expect(typeof removeSubmoduleFromGitmodules).toBe('function')
    expect(typeof revListCount).toBe('function')
  })

  it('should export error types', () => {
    expect(GitNotFound).toBeDefined()
    expect(CommandFailed).toBeDefined()
    expect(InvalidBranch).toBeDefined()

    const gitNotFound = new GitNotFound()
    expect(gitNotFound).toBeInstanceOf(Error)
    expect(gitNotFound.name).toBe('GitNotFound')

    const cmdFailed = new CommandFailed('test', 'error')
    expect(cmdFailed).toBeInstanceOf(Error)
    expect(cmdFailed.name).toBe('CommandFailed')

    const invalidBranch = new InvalidBranch('bad-branch')
    expect(invalidBranch).toBeInstanceOf(Error)
    expect(invalidBranch.name).toBe('InvalidBranch')
  })
})

// Note: Full git integration tests would require a real git repository.
// These tests verify the module structure and error handling.
// In actual usage, these operations would be tested with:
// - Mock git commands via child_process mocking
// - Real git repositories in integration tests
// - Docker containers for CI/CD testing
