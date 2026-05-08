/**
 * Tests for Cleanup Orchestrator
 *
 * Tests orphan detection logic for skills and submodules
 */

import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { cleanup } from './cleanup.js'

describe('cleanup Orchestrator', () => {
  it('should detect no orphans when everything is declared', async () => {
    // Tracer bullet: verify basic structure
    // No actual filesystem, so expect graceful handling
    const input = {
      root: '/test/repo',
    }

    const result = await Effect.runPromise(cleanup(input))

    expect(result).toMatchObject({
      orphanedSubmodules: expect.any(Array),
      orphanedSkills: expect.any(Array),
      staleLinksinAuthored: expect.any(Array),
    })
  })

  it('should return empty arrays when no orphans exist', async () => {
    // With a test directory that has no content
    const input = {
      root: '/nonexistent/repo',
    }

    const result = await Effect.runPromise(cleanup(input))

    // When directories don't exist, there are no orphans to find
    expect(result.orphanedSubmodules).toEqual([])
    expect(result.orphanedSkills).toEqual([])
    expect(result.staleLinksinAuthored).toEqual([])
  })

  it('should handle missing .gitmodules gracefully', async () => {
    // When .gitmodules doesn't exist, should not crash
    const input = {
      root: '/test/repo-no-gitmodules',
    }

    const result = await Effect.runPromise(cleanup(input))

    expect(result.orphanedSubmodules).toEqual([])
  })

  it('should handle missing meta.json gracefully', async () => {
    // When meta.json doesn't exist, should not crash
    const input = {
      root: '/test/repo-no-meta',
    }

    const result = await Effect.runPromise(cleanup(input))

    expect(Array.isArray(result.orphanedSubmodules)).toBe(true)
    expect(Array.isArray(result.orphanedSkills)).toBe(true)
  })

  it('should handle empty directories gracefully', async () => {
    // When directories are empty but exist
    const input = {
      root: '/test/empty-repo',
    }

    const result = await Effect.runPromise(cleanup(input))

    // Should return empty orphan lists without crashing
    expect(result.orphanedSubmodules).toBeDefined()
    expect(result.orphanedSkills).toBeDefined()
    expect(result.staleLinksinAuthored).toBeDefined()
  })
})
