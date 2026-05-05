import { describe, expect, it } from 'vitest'
import { MockGitAdapter } from './gitAdapter.ts'

describe('gitAdapter', () => {
  describe('mockGitAdapter', () => {
    it('records submoduleExists checks', () => {
      const adapter = new MockGitAdapter()
      const exists = adapter.submoduleExists('/root', 'upstream/foo')
      expect(exists).toBe(false)
      expect(adapter.getCallSequence()).toContainEqual({
        method: 'submoduleExists',
        args: ['/root', 'upstream/foo'],
      })
    })

    it('tracks registered submodules', () => {
      const adapter = new MockGitAdapter()
      expect(adapter.submoduleExists('/root', 'upstream/foo')).toBe(false)
      adapter.addSubmodule('/root', 'https://github.com/foo/bar', 'upstream/foo')
      expect(adapter.submoduleExists('/root', 'upstream/foo')).toBe(true)
    })

    it('records addSubmodule calls', () => {
      const adapter = new MockGitAdapter()
      adapter.addSubmodule('/root', 'https://github.com/foo/bar', 'upstream/foo')
      expect(adapter.getCallSequence()).toContainEqual({
        method: 'addSubmodule',
        args: ['/root', 'https://github.com/foo/bar', 'upstream/foo'],
      })
    })

    it('records initSubmodule calls', () => {
      const adapter = new MockGitAdapter()
      adapter.initSubmodule('https://github.com/foo/bar', 'upstream/foo', 'main')
      expect(adapter.getCallSequence()).toContainEqual({
        method: 'initSubmodule',
        args: ['https://github.com/foo/bar', 'upstream/foo', 'main'],
      })
    })

    it('records fetchSubmodule calls', () => {
      const adapter = new MockGitAdapter()
      adapter.fetchSubmodule('upstream/foo', 'main')
      expect(adapter.getCallSequence()).toContainEqual({
        method: 'fetchSubmodule',
        args: ['upstream/foo', 'main'],
      })
    })

    it('records checkoutBranch calls', () => {
      const adapter = new MockGitAdapter()
      adapter.checkoutBranch('upstream/foo', 'main')
      expect(adapter.getCallSequence()).toContainEqual({
        method: 'checkoutBranch',
        args: ['upstream/foo', 'main'],
      })
    })

    it('records branch config changes', () => {
      const adapter = new MockGitAdapter()
      adapter.setSubmoduleBranch('/root', 'upstream/foo', 'develop')
      expect(adapter.getCallSequence()).toContainEqual({
        method: 'setSubmoduleBranch',
        args: ['/root', 'upstream/foo', 'develop'],
      })
    })

    it('resets call history', () => {
      const adapter = new MockGitAdapter()
      adapter.addSubmodule('/root', 'https://github.com/foo/bar', 'upstream/foo')
      adapter.reset()
      expect(adapter.getCallSequence()).toEqual([])
      expect(adapter.submoduleExists('/root', 'upstream/foo')).toBe(false)
    })

    it('can simulate ensure new submodule workflow', () => {
      const adapter = new MockGitAdapter()

      // Scenario: New submodule with branch
      expect(adapter.submoduleExists('/root', 'upstream/antfu')).toBe(false)
      adapter.addSubmodule('/root', 'https://github.com/antfu/skills', 'upstream/antfu')
      adapter.setSubmoduleBranch('/root', 'upstream/antfu', 'main')
      adapter.fetchSubmodule('upstream/antfu', 'main')
      adapter.checkoutBranch('upstream/antfu', 'main')

      const calls = adapter.getCallSequence()
      expect(calls.map((c: { method: string, args: unknown[] }) => c.method)).toEqual([
        'submoduleExists',
        'addSubmodule',
        'setSubmoduleBranch',
        'fetchSubmodule',
        'checkoutBranch',
      ])
    })

    it('can simulate ensure existing submodule workflow', () => {
      const adapter = new MockGitAdapter()

      // Pre-register
      adapter.addSubmodule('/root', 'https://github.com/antfu/skills', 'upstream/antfu')

      // Now update branch
      adapter.reset()
      expect(adapter.submoduleExists('/root', 'upstream/antfu')).toBe(false) // After reset
      adapter.addSubmodule('/root', 'https://github.com/antfu/skills', 'upstream/antfu')
      adapter.setSubmoduleBranch('/root', 'upstream/antfu', 'develop')
      adapter.fetchSubmodule('upstream/antfu', 'develop')
      adapter.checkoutBranch('upstream/antfu', 'develop')

      expect(adapter.getCallSequence().map((c: { method: string, args: unknown[] }) => c.method)).toEqual([
        'submoduleExists',
        'addSubmodule',
        'setSubmoduleBranch',
        'fetchSubmodule',
        'checkoutBranch',
      ])
    })
  })
})
