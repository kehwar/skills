import type { SkillMeta } from '../types.ts'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectAuthoredSkills, linkAuthoredSkills, pruneStaleLinksinAuthoredDirectory } from './authored-skills-ops.ts'

describe('authoredSkillsOps', () => {
  let temporary: string
  let skillsDirectory: string
  let authoredDirectory: string

  beforeEach(() => {
    temporary = mkdtempSync(path.join(tmpdir(), 'authored-skills-test-'))
    skillsDirectory = path.join(temporary, 'skills')
    authoredDirectory = path.join(temporary, 'authored')
    mkdirSync(skillsDirectory, { recursive: true })
    mkdirSync(authoredDirectory, { recursive: true })
  })

  afterEach(() => {
    rmSync(temporary, { recursive: true })
  })

  describe('collectAuthoredSkills', () => {
    it('returns empty array when skills directory does not exist', () => {
      const result = collectAuthoredSkills(path.join(temporary, 'nonexistent'))
      expect(result.ok).toBe(true)
      if (!result.ok)
        throw new Error(result.error)
      expect(result.data).toEqual([])
    })

    it('returns empty array when no skills have type="authored"', () => {
      const skillPath = path.join(skillsDirectory, 'synced-skill')
      mkdirSync(skillPath, { recursive: true })
      writeFileSync(path.join(skillPath, 'meta.json'), JSON.stringify({ type: 'synced', upstream: 'test' }))

      const result = collectAuthoredSkills(skillsDirectory)
      expect(result.ok).toBe(true)
      if (!result.ok)
        throw new Error(result.error)
      expect(result.data).toEqual([])
    })

    it('collects skills with type="authored"', () => {
      const skillPath1 = path.join(skillsDirectory, 'authored-skill-1')
      const skillPath2 = path.join(skillsDirectory, 'authored-skill-2')
      mkdirSync(skillPath1, { recursive: true })
      mkdirSync(skillPath2, { recursive: true })

      const meta1: SkillMeta = { type: 'authored' }
      const meta2: SkillMeta = { type: 'authored', domain: 'frappe' }
      writeFileSync(path.join(skillPath1, 'meta.json'), JSON.stringify(meta1))
      writeFileSync(path.join(skillPath2, 'meta.json'), JSON.stringify(meta2))

      const result = collectAuthoredSkills(skillsDirectory)
      expect(result.ok).toBe(true)
      if (!result.ok)
        throw new Error(result.error)
      expect(result.data).toHaveLength(2)
      const m1 = result.data.find((s: any) => s.name === 'authored-skill-1')?.meta
      const m2 = result.data.find((s: any) => s.name === 'authored-skill-2')?.meta
      expect(m1?.type === 'authored' && m1.domain).toBeUndefined()
      expect(m2?.type === 'authored' && m2.domain).toBe('frappe')
    })

    it('skips skills without meta.json', () => {
      const skillPath = path.join(skillsDirectory, 'no-meta-skill')
      mkdirSync(skillPath, { recursive: true })

      const result = collectAuthoredSkills(skillsDirectory)
      expect(result.ok).toBe(true)
      if (!result.ok)
        throw new Error(result.error)
      expect(result.data).toEqual([])
    })
  })

  describe('linkAuthoredSkills', () => {
    it('creates flat symlinks for skills without domain', () => {
      const skillPath = path.join(skillsDirectory, 'my-skill')
      mkdirSync(skillPath, { recursive: true })
      writeFileSync(path.join(skillPath, 'SKILL.md'), '# My Skill')

      const collected = [{ name: 'my-skill', meta: { type: 'authored' } as SkillMeta }]
      const result = linkAuthoredSkills(collected, skillsDirectory, authoredDirectory)
      expect(result.ok).toBe(true)
      if (!result.ok)
        throw new Error(result.error)

      const linkPath = path.join(authoredDirectory, 'my-skill')
      expect(readdirSync(authoredDirectory)).toContain('my-skill')
      expect(readlinkSync(linkPath)).toContain('my-skill')
      expect(result.data).toContain('linked  authored: my-skill')
    })

    it('creates domain-grouped symlinks for skills with domain', () => {
      const skillPath = path.join(skillsDirectory, 'frappe-skill')
      mkdirSync(skillPath, { recursive: true })
      writeFileSync(path.join(skillPath, 'SKILL.md'), '# Frappe Skill')

      const collected = [{ name: 'frappe-skill', meta: { type: 'authored', domain: 'frappe' } as SkillMeta }]
      const result = linkAuthoredSkills(collected, skillsDirectory, authoredDirectory)
      expect(result.ok).toBe(true)
      if (!result.ok)
        throw new Error(result.error)

      const linkPath = path.join(authoredDirectory, 'frappe', 'frappe-skill')
      expect(readdirSync(authoredDirectory)).toContain('frappe')
      expect(readdirSync(path.join(authoredDirectory, 'frappe'))).toContain('frappe-skill')
      expect(readlinkSync(linkPath)).toContain('frappe-skill')
      expect(result.data).toContain('linked  authored: frappe-skill (domain: frappe)')
    })

    it('re-links when domain changes', () => {
      const skillPath = path.join(skillsDirectory, 'migrated-skill')
      mkdirSync(skillPath, { recursive: true })
      writeFileSync(path.join(skillPath, 'SKILL.md'), '# Migrated Skill')

      // First link to frappe
      const collected1 = [{ name: 'migrated-skill', meta: { type: 'authored', domain: 'frappe' } as SkillMeta }]
      const result1 = linkAuthoredSkills(collected1, skillsDirectory, authoredDirectory)
      expect(result1.ok).toBe(true)
      expect(readdirSync(path.join(authoredDirectory, 'frappe'))).toContain('migrated-skill')

      // Re-link to sap
      const collected2 = [{ name: 'migrated-skill', meta: { type: 'authored', domain: 'sap' } as SkillMeta }]
      linkAuthoredSkills(collected2, skillsDirectory, authoredDirectory)
      expect(readdirSync(path.join(authoredDirectory, 'sap'))).toContain('migrated-skill')
      expect(readdirSync(path.join(authoredDirectory, 'frappe')).length).toBe(0)
    })

    it('handles multiple skills in same domain', () => {
      const skill1Path = path.join(skillsDirectory, 'frappe-skill-1')
      const skill2Path = path.join(skillsDirectory, 'frappe-skill-2')
      mkdirSync(skill1Path, { recursive: true })
      mkdirSync(skill2Path, { recursive: true })

      const collected = [
        { name: 'frappe-skill-1', meta: { type: 'authored', domain: 'frappe' } as SkillMeta },
        { name: 'frappe-skill-2', meta: { type: 'authored', domain: 'frappe' } as SkillMeta },
      ]
      linkAuthoredSkills(collected, skillsDirectory, authoredDirectory)

      const frappe = path.join(authoredDirectory, 'frappe')
      expect(readdirSync(frappe)).toContain('frappe-skill-1')
      expect(readdirSync(frappe)).toContain('frappe-skill-2')
    })
  })

  describe('pruneStaleLinksinAuthoredDirectory', () => {
    it('removes symlinks pointing to non-existent skills', () => {
      // Create stale symlink
      const staleLink = path.join(authoredDirectory, 'stale-skill')
      symlinkSync(path.join(skillsDirectory, 'stale-skill'), staleLink)

      const result = pruneStaleLinksinAuthoredDirectory(authoredDirectory, skillsDirectory)
      expect(result.ok).toBe(true)
      if (!result.ok)
        throw new Error(result.error)

      expect(readdirSync(authoredDirectory)).not.toContain('stale-skill')
      expect(result.data).toContain('removed stale authored symlink: stale-skill')
    })

    it('removes symlinks pointing to non-authored skills', () => {
      const skillPath = path.join(skillsDirectory, 'synced-skill')
      mkdirSync(skillPath, { recursive: true })
      writeFileSync(path.join(skillPath, 'meta.json'), JSON.stringify({ type: 'synced', upstream: 'test' }))

      // Create symlink
      const linkPath = path.join(authoredDirectory, 'synced-skill')
      symlinkSync(path.join(skillsDirectory, 'synced-skill'), linkPath)

      const result = pruneStaleLinksinAuthoredDirectory(authoredDirectory, skillsDirectory)
      expect(result.ok).toBe(true)
      if (!result.ok)
        throw new Error(result.error)

      expect(readdirSync(authoredDirectory)).not.toContain('synced-skill')
      expect(result.data).toContain('removed stale authored symlink: synced-skill')
    })

    it('keeps symlinks pointing to valid authored skills', () => {
      const skillPath = path.join(skillsDirectory, 'valid-skill')
      mkdirSync(skillPath, { recursive: true })
      writeFileSync(path.join(skillPath, 'meta.json'), JSON.stringify({ type: 'authored' }))

      const linkPath = path.join(authoredDirectory, 'valid-skill')
      symlinkSync(path.join(skillsDirectory, 'valid-skill'), linkPath)

      const result = pruneStaleLinksinAuthoredDirectory(authoredDirectory, skillsDirectory)
      expect(result.ok).toBe(true)
      if (!result.ok)
        throw new Error(result.error)

      expect(readdirSync(authoredDirectory)).toContain('valid-skill')
      expect(result.data).toHaveLength(0)
    })

    it('prunes stale symlinks in domain subdirectories', () => {
      const staleLink = path.join(authoredDirectory, 'frappe', 'stale-skill')
      mkdirSync(path.join(authoredDirectory, 'frappe'), { recursive: true })
      symlinkSync(path.join(skillsDirectory, 'stale-skill'), staleLink)

      const result = pruneStaleLinksinAuthoredDirectory(authoredDirectory, skillsDirectory)
      expect(result.ok).toBe(true)
      if (!result.ok)
        throw new Error(result.error)

      // frappe directory is removed because it's now empty
      expect(existsSync(path.join(authoredDirectory, 'frappe'))).toBe(false)
      expect(result.data).toContain('removed stale authored symlink: stale-skill')
    })

    it('removes empty domain directories after pruning', () => {
      const staleLink = path.join(authoredDirectory, 'frappe', 'stale-skill')
      mkdirSync(path.join(authoredDirectory, 'frappe'), { recursive: true })
      symlinkSync(path.join(skillsDirectory, 'stale-skill'), staleLink)

      const result = pruneStaleLinksinAuthoredDirectory(authoredDirectory, skillsDirectory)
      expect(result.ok).toBe(true)

      expect(readdirSync(authoredDirectory)).not.toContain('frappe')
    })

    it('leaves non-symlink files and directories alone', () => {
      mkdirSync(path.join(authoredDirectory, 'regular-directory'), { recursive: true })
      writeFileSync(path.join(authoredDirectory, 'regular-directory', 'nested-file.txt'), 'content')
      writeFileSync(path.join(authoredDirectory, 'regular-file.txt'), 'content')

      const result = pruneStaleLinksinAuthoredDirectory(authoredDirectory, skillsDirectory)
      expect(result.ok).toBe(true)

      expect(readdirSync(authoredDirectory)).toContain('regular-directory')
      expect(readdirSync(authoredDirectory)).toContain('regular-file.txt')
    })
  })
})
