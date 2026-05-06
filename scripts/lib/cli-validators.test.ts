import { describe, expect, it } from 'vitest'
import {
  validateBranchName,
  validateDomainName,
  validateSkillName,
} from './cli-validators.ts'

describe('cLI Validators', () => {
  describe('validateSkillName', () => {
    it('accepts valid kebab-case names', () => {
      const result = validateSkillName('my-skill')
      expect(result.ok).toBe(true)
    })

    it('rejects names with uppercase', () => {
      const result = validateSkillName('My-Skill')
      expect(result.ok).toBe(false)
      if (!result.ok)
        expect(result.error).toContain('kebab-case')
    })

    it('rejects empty names', () => {
      const result = validateSkillName('')
      expect(result.ok).toBe(false)
      if (!result.ok)
        expect(result.error).toContain('cannot be empty')
    })

    it('rejects names starting with hyphens', () => {
      const result = validateSkillName('-skill')
      expect(result.ok).toBe(false)
    })

    it('accepts single character names', () => {
      const result = validateSkillName('a')
      expect(result.ok).toBe(true)
    })
  })

  describe('validateDomainName', () => {
    it('accepts valid kebab-case domains', () => {
      const result = validateDomainName('my-domain')
      expect(result.ok).toBe(true)
    })

    it('rejects names with spaces', () => {
      const result = validateDomainName('my domain')
      expect(result.ok).toBe(false)
      if (!result.ok)
        expect(result.error).toBeDefined()
    })

    it('rejects empty domains', () => {
      const result = validateDomainName('')
      expect(result.ok).toBe(false)
      if (!result.ok)
        expect(result.error).toBeDefined()
    })
  })

  describe('validateBranchName', () => {
    it('accepts valid branch names', () => {
      const result = validateBranchName('main')
      expect(result.ok).toBe(true)
    })

    it('accepts branches with slashes', () => {
      const result = validateBranchName('feature/my-feature')
      expect(result.ok).toBe(true)
    })

    it('rejects names with spaces', () => {
      const result = validateBranchName('my feature')
      expect(result.ok).toBe(false)
    })

    it('rejects empty branch names', () => {
      const result = validateBranchName('')
      expect(result.ok).toBe(false)
    })

    it('rejects names with double slashes', () => {
      const result = validateBranchName('feature//name')
      expect(result.ok).toBe(false)
    })
  })
})
