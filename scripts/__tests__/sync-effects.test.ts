/**
 * Tracer Bullet Test: Sync Workflow with Effects
 *
 * Tests the critical path through sync.ts refactored to use effects/*:
 * 1. Load meta.json
 * 2. Normalize URLs using parseGitHubUrl Effect
 * 3. Save normalized meta back
 *
 * This test proves the end-to-end integration works before expanding to other behaviors.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Effect } from 'effect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeFile } from '../effects/fs.js'
import { loadMeta, saveMeta } from '../effects/meta-io.js'
import { parseGitHubUrl } from '../effects/url-parsing.js'

describe('sync Effects: URL Normalization Workflow', () => {
  let tempDir: string
  let metaFilePath: string

  beforeEach(() => {
    // Create a temporary directory for this test
    tempDir = `/tmp/sync-test-${Date.now()}`
    metaFilePath = path.join(tempDir, 'meta.json')

    // Ensure temp dir exists
    try {
      rmSync(tempDir, { recursive: true, force: true })
    }
    catch {}
    mkdirSync(tempDir, { recursive: true })
  })

  afterEach(() => {
    // Clean up temp files
    try {
      rmSync(tempDir, { recursive: true, force: true })
    }
    catch {}
  })

  it('should normalize shorthand URLs in meta.json using Effect composition', () => {
    // Arrange: Create meta.json with shorthand URLs
    const originalMeta = {
      upstreams: {
        'vuejs-ai': {
          url: 'vuejs-ai/awesome-vue', // shorthand format
          branch: 'main',
          skills: { vue: 'vuejs-ai-vue' },
        },
        'antfu': {
          url: 'antfu/my-awesome-tools', // shorthand format
          branch: 'main',
          skills: { ts: 'antfu-ts' },
        },
      },
    }

    writeFileSync(metaFilePath, JSON.stringify(originalMeta, null, 2))

    // Act: Read, normalize URLs, and save using Effects
    const normalizeWorkflow = Effect.gen(function* () {
      // Load meta
      const json = yield* Effect.try({
        try: () => readFileSync(metaFilePath, 'utf8'),
        catch: error => new Error(`Failed to read: ${error}`),
      })

      const meta = yield* loadMeta(json)

      // Normalize each upstream URL
      const normalizedUpstreams: Record<string, any> = {}
      for (const [key, upstream] of Object.entries(meta.upstreams)) {
        const urlInfo = yield* parseGitHubUrl(upstream.url)
        normalizedUpstreams[key] = {
          ...upstream,
          url: urlInfo.normalized,
        }
      }

      // Serialize normalized meta
      const normalizedMeta = { upstreams: normalizedUpstreams }
      const serialized = yield* saveMeta(normalizedMeta)

      // Write back to file
      yield* writeFile(metaFilePath, serialized)

      return normalizedMeta
    })

    const result = Effect.runSync(normalizeWorkflow)

    // Assert: Verify URLs are normalized
    expect(result.upstreams['vuejs-ai'].url).toBe('https://github.com/vuejs-ai/awesome-vue')
    expect(result.upstreams.antfu.url).toBe('https://github.com/antfu/my-awesome-tools')

    // Assert: Verify file was saved with normalized URLs
    const savedContent = readFileSync(metaFilePath, 'utf8')
    const savedMeta = JSON.parse(savedContent)
    expect(savedMeta.upstreams['vuejs-ai'].url).toBe('https://github.com/vuejs-ai/awesome-vue')
    expect(savedMeta.upstreams.antfu.url).toBe('https://github.com/antfu/my-awesome-tools')
  })
})
