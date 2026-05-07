import type { Meta } from '../types.js'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { InvalidMetaFormat, loadMeta, saveMeta } from './meta-io.js'

describe('loadMeta', () => {
  it('should load and validate valid meta.json', () => {
    // Arrange
    const validMeta: Meta = {
      upstreams: {
        'vuejs-ai': {
          url: 'https://github.com/vuejs-ai/awesome-vue',
          branch: 'main',
        },
      },
    }

    // Act
    const effect = Effect.succeed(JSON.stringify(validMeta)).pipe(
      Effect.flatMap(json => loadMeta(json)),
    )
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toEqual(validMeta)
  })

  it('should validate that upstreams field exists', () => {
    // Arrange
    const invalidJson = JSON.stringify({})

    // Act
    const effect = Effect.match(loadMeta(invalidJson), {
      onSuccess: () => 'success',
      onFailure: error => error,
    })
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBeInstanceOf(InvalidMetaFormat)
  })

  it('should validate that upstreams is an object, not array', () => {
    // Arrange
    const invalidJson = JSON.stringify({
      upstreams: [],
    })

    // Act
    const effect = Effect.match(loadMeta(invalidJson), {
      onSuccess: () => 'success',
      onFailure: error => error,
    })
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBeInstanceOf(InvalidMetaFormat)
  })

  it('should reject malformed JSON', () => {
    // Arrange
    const invalidJson = '{invalid json'

    // Act
    const effect = Effect.match(loadMeta(invalidJson), {
      onSuccess: () => 'success',
      onFailure: error => error,
    })
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBeInstanceOf(InvalidMetaFormat)
  })

  it('should handle empty upstreams object', () => {
    // Arrange
    const validMeta: Meta = {
      upstreams: {},
    }

    // Act
    const effect = Effect.succeed(JSON.stringify(validMeta)).pipe(
      Effect.flatMap(json => loadMeta(json)),
    )
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toEqual(validMeta)
  })

  it('should preserve upstream metadata (url, branch, etc.)', () => {
    // Arrange
    const validMeta: Meta = {
      upstreams: {
        'upstream-1': {
          url: 'https://github.com/owner1/repo1',
          branch: 'develop',
          skills: {
            'src/skill1': 'skill1-name',
            'src/skill2': 'skill2-name',
          },
          available: {
            'src/skill1': 'abc12345',
            'src/skill2': 'def67890',
          },
          gitSha: 'abc123def456',
        },
      },
    }

    // Act
    const effect = Effect.succeed(JSON.stringify(validMeta)).pipe(
      Effect.flatMap(json => loadMeta(json)),
    )
    const result = Effect.runSync(effect)

    // Assert
    expect(result.upstreams['upstream-1']).toEqual(validMeta.upstreams['upstream-1'])
  })
})

describe('saveMeta', () => {
  it('should serialize meta to JSON with sorted upstreams', () => {
    // Arrange
    const meta: Meta = {
      upstreams: {
        'z-upstream': { url: 'https://github.com/z/repo' },
        'a-upstream': { url: 'https://github.com/a/repo' },
        'm-upstream': { url: 'https://github.com/m/repo' },
      },
    }

    // Act
    const effect = saveMeta(meta)
    const result = Effect.runSync(effect)

    // Assert: verify it's valid JSON
    const parsed = JSON.parse(result)
    expect(parsed).toBeDefined()
    expect(parsed.upstreams).toBeDefined()

    // Assert: verify upstreams are sorted
    const keys = Object.keys(parsed.upstreams)
    expect(keys).toEqual(['a-upstream', 'm-upstream', 'z-upstream'])
  })

  it('should preserve all upstream metadata when saving', () => {
    // Arrange
    const meta: Meta = {
      upstreams: {
        'upstream-1': {
          url: 'https://github.com/owner1/repo1',
          branch: 'develop',
          skills: { 'src/skill1': 'skill-name' },
          available: { 'src/skill1': 'hash123' },
          gitSha: 'sha123',
        },
      },
    }

    // Act
    const effect = saveMeta(meta)
    const result = Effect.runSync(effect)

    // Assert
    const parsed = JSON.parse(result)
    expect(parsed.upstreams['upstream-1']).toEqual(meta.upstreams['upstream-1'])
  })

  it('should format JSON with proper indentation', () => {
    // Arrange
    const meta: Meta = {
      upstreams: {
        test: { url: 'https://github.com/test/repo' },
      },
    }

    // Act
    const effect = saveMeta(meta)
    const result = Effect.runSync(effect)

    // Assert: should have indentation (2 spaces)
    expect(result).toContain('\n')
    // Match newline, 2 spaces, and opening quote
    expect(result).toMatch(/\n {2}"upstreams"/)
  })

  it('should end with newline', () => {
    // Arrange
    const meta: Meta = {
      upstreams: {},
    }

    // Act
    const effect = saveMeta(meta)
    const result = Effect.runSync(effect)

    // Assert
    expect(result.slice(-1)).toBe('\n')
  })

  it('should handle empty upstreams', () => {
    // Arrange
    const meta: Meta = {
      upstreams: {},
    }

    // Act
    const effect = saveMeta(meta)
    const result = Effect.runSync(effect)

    // Assert
    const parsed = JSON.parse(result)
    expect(parsed.upstreams).toEqual({})
  })

  it('should handle multiple upstreams with mixed metadata', () => {
    // Arrange
    const meta: Meta = {
      upstreams: {
        'upstream-with-all': {
          url: 'https://github.com/a/repo',
          branch: 'main',
          skills: { 'src/skill': 'skill' },
          available: { 'src/skill': 'hash' },
          gitSha: 'sha',
        },
        'upstream-minimal': {
          url: 'https://github.com/b/repo',
        },
      },
    }

    // Act
    const effect = saveMeta(meta)
    const result = Effect.runSync(effect)

    // Assert
    const parsed = JSON.parse(result) as Meta
    expect(Object.keys(parsed.upstreams)).toHaveLength(2)
    expect(parsed.upstreams['upstream-with-all']).toEqual(meta.upstreams['upstream-with-all'])
    expect(parsed.upstreams['upstream-minimal']).toEqual(meta.upstreams['upstream-minimal'])
  })
})
