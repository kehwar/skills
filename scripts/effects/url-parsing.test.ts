import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { deriveUpstreamKey, parseGitHubUrl, URLParseError } from './url-parsing.js'

describe('parseGitHubUrl', () => {
  it('should parse HTTPS GitHub URLs', () => {
    // Arrange
    const url = 'https://github.com/vuejs-ai/awesome-vue'

    // Act
    const effect = parseGitHubUrl(url)
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBeDefined()
    expect(result.normalized).toBe('https://github.com/vuejs-ai/awesome-vue')
    expect(result.owner).toBe('vuejs-ai')
    expect(result.repo).toBe('awesome-vue')
    expect(result.format).toBe('https')
  })

  it('should parse SSH GitHub URLs', () => {
    // Arrange
    const url = 'git@github.com:vuejs-ai/awesome-vue.git'

    // Act
    const effect = parseGitHubUrl(url)
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBeDefined()
    expect(result.normalized).toBe('https://github.com/vuejs-ai/awesome-vue')
    expect(result.owner).toBe('vuejs-ai')
    expect(result.repo).toBe('awesome-vue')
    expect(result.format).toBe('ssh')
  })

  it('should parse shorthand GitHub URLs (owner/repo)', () => {
    // Arrange
    const url = 'vuejs-ai/awesome-vue'

    // Act
    const effect = parseGitHubUrl(url)
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBeDefined()
    expect(result.normalized).toBe('https://github.com/vuejs-ai/awesome-vue')
    expect(result.owner).toBe('vuejs-ai')
    expect(result.repo).toBe('awesome-vue')
  })

  it('should normalize URLs to lowercase domain', () => {
    // Arrange
    const url = 'HTTPS://GitHub.com/vuejs-ai/awesome-vue'

    // Act
    const effect = parseGitHubUrl(url)
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBeDefined()
    expect(result.normalized).toBe('https://github.com/vuejs-ai/awesome-vue')
  })

  it('should strip .git suffix from URLs', () => {
    // Arrange
    const urls = [
      'https://github.com/vuejs-ai/awesome-vue.git',
      'git@github.com:vuejs-ai/awesome-vue.git',
      'vuejs-ai/awesome-vue.git',
    ]

    // Act & Assert
    for (const url of urls) {
      const effect = parseGitHubUrl(url)
      const result = Effect.runSync(effect)

      expect(result).toBeDefined()
      expect(result.normalized).toBe('https://github.com/vuejs-ai/awesome-vue')
      expect(result.repo).toBe('awesome-vue')
    }
  })

  it('should strip trailing slashes from URLs', () => {
    // Arrange
    const url = 'https://github.com/vuejs-ai/awesome-vue/'

    // Act
    const effect = parseGitHubUrl(url)
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBeDefined()
    expect(result.normalized).toBe('https://github.com/vuejs-ai/awesome-vue')
  })

  it('should reject empty URLs', () => {
    // Arrange
    const url = ''

    // Act
    const effect = Effect.match(parseGitHubUrl(url), {
      onSuccess: () => 'success',
      onFailure: error => error,
    })
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBeInstanceOf(URLParseError)
  })

  it('should reject whitespace-only URLs', () => {
    // Arrange
    const url = '   '

    // Act
    const effect = Effect.match(parseGitHubUrl(url), {
      onSuccess: () => 'success',
      onFailure: error => error,
    })
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBeInstanceOf(URLParseError)
  })

  it('should reject invalid SSH URLs (wrong domain)', () => {
    // Arrange
    const url = 'git@gitlab.com:vuejs-ai/awesome-vue'

    // Act
    const effect = Effect.match(parseGitHubUrl(url), {
      onSuccess: () => 'success',
      onFailure: error => error,
    })
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBeInstanceOf(URLParseError)
  })

  it('should reject HTTPS URLs with wrong domain', () => {
    // Arrange
    const url = 'https://gitlab.com/vuejs-ai/awesome-vue'

    // Act
    const effect = Effect.match(parseGitHubUrl(url), {
      onSuccess: () => 'success',
      onFailure: error => error,
    })
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBeInstanceOf(URLParseError)
  })

  it('should reject shorthand without slash', () => {
    // Arrange
    const url = 'vuejsai'

    // Act
    const effect = Effect.match(parseGitHubUrl(url), {
      onSuccess: () => 'success',
      onFailure: error => error,
    })
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBeInstanceOf(URLParseError)
  })

  it('should accept URLs with numbers and hyphens in owner/repo', () => {
    // Arrange
    const urls = [
      'owner-123/repo-456',
      'https://github.com/user2/repo-v2.0',
      'git@github.com:org-name/awesome-repo-123.git',
    ]

    // Act & Assert
    for (const url of urls) {
      const effect = parseGitHubUrl(url)
      const result = Effect.runSync(effect)

      expect(result).toBeDefined()
      expect(result.normalized).toContain('github.com')
    }
  })

  it('should store original raw URL', () => {
    // Arrange
    const originalUrl = 'git@github.com:vuejs-ai/awesome-vue.git'

    // Act
    const effect = parseGitHubUrl(originalUrl)
    const result = Effect.runSync(effect)

    // Assert
    expect(result.raw).toBe(originalUrl)
  })
})

describe('deriveUpstreamKey', () => {
  it('should derive key from normalized HTTPS URL', () => {
    // Arrange
    const url = 'https://github.com/vuejs-ai/awesome-vue'

    // Act
    const effect = deriveUpstreamKey(url)
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBe('vuejs-ai')
  })

  it('should derive key from URL with trailing slash', () => {
    // Arrange
    const url = 'https://github.com/vuejs-ai/awesome-vue/'

    // Act
    const effect = deriveUpstreamKey(url)
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBe('vuejs-ai')
  })

  it('should reject non-GitHub URLs', () => {
    // Arrange
    const url = 'https://example.com/owner/repo'

    // Act
    const effect = Effect.match(deriveUpstreamKey(url), {
      onSuccess: () => 'success',
      onFailure: error => error,
    })
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBeInstanceOf(URLParseError)
  })

  it('should reject malformed URLs', () => {
    // Arrange
    const url = 'https://github.com/owner'

    // Act
    const effect = Effect.match(deriveUpstreamKey(url), {
      onSuccess: () => 'success',
      onFailure: error => error,
    })
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBeInstanceOf(URLParseError)
  })
})
