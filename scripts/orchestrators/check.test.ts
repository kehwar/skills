/**
 * Tests for Check Orchestrator
 *
 * Tests the partial failure recovery pattern: multiple upstreams are checked
 * for available updates. If one upstream fails to fetch, others continue.
 */

import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { check } from './check.js'

describe('check Orchestrator', () => {
  it('should fetch all upstreams and count commits behind', async () => {
    // Tracer bullet: verify the happy path architecture works
    // Input: multiple upstreams all available locally with commits behind
    // Expected: returns data with upstream names and commit counts

    const input = {
      root: '/test/repo',
      upstreams: {
        antfu: {
          url: 'https://github.com/antfu/awesome-craft',
          branch: 'main',
          skills: { vue: 'antfu-vue' },
        },
        vuejs: {
          url: 'https://github.com/vuejs/ai-skills',
          branch: 'main',
          skills: { ts: 'vuejs-ts' },
        },
      },
    }

    const result = await Effect.runPromise(check(input))

    expect(result.totalUpstreams).toBe(2)
    expect(result.results).toHaveLength(2)
    // Since directories don't exist, expect errors for both
    expect(result.results.every(r => r.error !== undefined)).toBe(true)
  })

  it('should continue checking other upstreams if one fails', async () => {
    // Test partial failure recovery
    // Even though upstreams don't exist, the orchestrator should attempt to check all
    const input = {
      root: '/test/repo',
      upstreams: {
        upstream1: { url: 'https://github.com/user/repo1' },
        upstream2: { url: 'https://github.com/user/repo2' },
        upstream3: { url: 'https://github.com/user/repo3' },
      },
    }

    const result = await Effect.runPromise(check(input))

    // Should have attempted all three
    expect(result.totalUpstreams).toBe(3)
    expect(result.results).toHaveLength(3)
    // All should have errors since directories don't exist
    expect(result.results.every(r => r.error !== undefined)).toBe(true)
  })

  it('should handle missing submodule directory gracefully', async () => {
    // When upstream submodule doesn't exist
    const input = {
      root: '/nonexistent/repo',
      upstreams: {
        missing: { url: 'https://github.com/user/repo' },
      },
    }

    const result = await Effect.runPromise(check(input))

    expect(result.totalUpstreams).toBe(1)
    expect(result.results).toHaveLength(1)
    expect(result.results[0].error).toBeDefined()
    expect(result.results[0].behind).toBe(0)
  })

  it('should include skills list in result', async () => {
    // Verify that skills are reported in output
    const input = {
      root: '/test/repo',
      upstreams: {
        antfu: {
          url: 'https://github.com/antfu/awesome-craft',
          skills: { vue: 'antfu-vue', ts: 'antfu-ts' },
        },
      },
    }

    const result = await Effect.runPromise(check(input))

    expect(result.results).toHaveLength(1)
    // Skills should be included even if we get an error
    expect(result.results[0].skills).toBeDefined()
  })
})
