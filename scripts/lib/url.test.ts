import { describe, expect, it } from 'vitest'
import { parseAndNormalizeUrl } from './url.ts'

describe('uRL Pipeline', () => {
  describe('parseAndNormalizeUrl - tracer bullet', () => {
    it('parses valid HTTPS GitHub URL and returns normalized form with metadata', () => {
      const result = parseAndNormalizeUrl('https://github.com/user/repo')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.raw).toBe('https://github.com/user/repo')
        expect(result.data.normalized).toBe('https://github.com/user/repo')
        expect(result.data.owner).toBe('user')
        expect(result.data.repo).toBe('repo')
        expect(result.data.format).toBe('https')
      }
    })
  })

  describe('shorthand URLs (owner/repo)', () => {
    it('expands owner/repo to full HTTPS URL', () => {
      const result = parseAndNormalizeUrl('user/repo')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.raw).toBe('user/repo')
        expect(result.data.normalized).toBe('https://github.com/user/repo')
        expect(result.data.owner).toBe('user')
        expect(result.data.repo).toBe('repo')
      }
    })
  })

  describe('.git suffix handling', () => {
    it('strips .git suffix from HTTPS URL', () => {
      const result = parseAndNormalizeUrl('https://github.com/user/repo.git')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.normalized).toBe('https://github.com/user/repo')
        expect(result.data.repo).toBe('repo')
      }
    })

    it('strips .git suffix from shorthand URL', () => {
      const result = parseAndNormalizeUrl('user/repo.git')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.normalized).toBe('https://github.com/user/repo')
      }
    })
  })

  describe('sSH URLs', () => {
    it('accepts git@github.com:owner/repo format', () => {
      const result = parseAndNormalizeUrl('git@github.com:user/repo')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.raw).toBe('git@github.com:user/repo')
        expect(result.data.normalized).toBe('https://github.com/user/repo')
        expect(result.data.owner).toBe('user')
        expect(result.data.repo).toBe('repo')
        expect(result.data.format).toBe('ssh')
      }
    })

    it('normalizes SSH URL to HTTPS canonical form', () => {
      const result = parseAndNormalizeUrl('git@github.com:myorg/myrepo.git')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.normalized).toBe('https://github.com/myorg/myrepo')
      }
    })
  })

  describe('case normalization', () => {
    it('lowercases domain and preserves case in org/repo', () => {
      const result = parseAndNormalizeUrl('https://GitHub.com/MyOrg/MyRepo')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.normalized).toBe('https://github.com/MyOrg/MyRepo')
      }
    })
  })

  describe('error handling', () => {
    it('rejects empty string', () => {
      const result = parseAndNormalizeUrl('')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('cannot be empty')
      }
    })

    it('rejects non-GitHub HTTPS URLs', () => {
      const result = parseAndNormalizeUrl('https://gitlab.com/user/repo')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('GitHub')
      }
    })

    it('rejects URLs without org/repo structure', () => {
      const result = parseAndNormalizeUrl('https://github.com/user')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('org/repo')
      }
    })

    it('rejects HTTP URLs (requires HTTPS or SSH)', () => {
      const unsecureProtocol = 'http'
      const result = parseAndNormalizeUrl(`${unsecureProtocol}://github.com/user/repo`)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('https')
      }
    })

    it('rejects SSH URLs from non-GitHub hosts', () => {
      const result = parseAndNormalizeUrl('git@gitlab.com:user/repo')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('GitHub')
      }
    })

    it('provides helpful error message with supported formats', () => {
      const result = parseAndNormalizeUrl('invalid-url!')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toMatch(/https:\/\/github\.com|owner\/repo|git@github\.com/)
      }
    })

    it('rejects URLs with trailing slashes', () => {
      const result = parseAndNormalizeUrl('https://github.com/user/repo/')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.normalized).toBe('https://github.com/user/repo')
      }
    })

    it('handles whitespace', () => {
      const result = parseAndNormalizeUrl('  https://github.com/user/repo  ')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.normalized).toBe('https://github.com/user/repo')
      }
    })
  })
})
