import type { SkillMeta } from '../types.ts'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectAuthoredSkills, linkAuthoredSkills, pruneStaleLinksinAuthoredDir } from './authoredSkillsOps.ts'

describe('authoredSkillsOps', () => {
  let tmp: string
  let skillsDir: string
  let authoredDir: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'authored-skills-test-'))
    skillsDir = join(tmp, 'skills')
    authoredDir = join(tmp, 'authored')
    mkdirSync(skillsDir, { recursive: true })
    mkdirSync(authoredDir, { recursive: true })
  })

  afterEach(() => { rmSync(tmp, { recursive: true }) })

  describe('collectAuthoredSkills', () => {
    it('returns empty array when skills directory does not exist', () => {
      const result = collectAuthoredSkills(join(tmp, 'nonexistent'))
      expect(result.ok).toBe(true)
      if (!result.ok)
        throw new Error(result.error)
      expect(result.data).toEqual([])
    })

    it('returns empty array when no skills have type="authored"', () => {
      const skillPath = join(skillsDir, 'synced-skill')
      mkdirSync(skillPath, { recursive: true })
      writeFileSync(join(skillPath, 'meta.json'), JSON.stringify({ type: 'synced', upstream: 'test' }))

      const result = collectAuthoredSkills(skillsDir)
      expect(result.ok).toBe(true)
      if (!result.ok)
        throw new Error(result.error)
      expect(result.data).toEqual([])
    })

    it('collects skills with type="authored"', () => {
      const skillPath1 = join(skillsDir, 'authored-skill-1')
      const skillPath2 = join(skillsDir, 'authored-skill-2')
      mkdirSync(skillPath1, { recursive: true })
      mkdirSync(skillPath2, { recursive: true })

      const meta1: SkillMeta = { type: 'authored' }
      const meta2: SkillMeta = { type: 'authored', domain: 'frappe' }
      writeFileSync(join(skillPath1, 'meta.json'), JSON.stringify(meta1))
      writeFileSync(join(skillPath2, 'meta.json'), JSON.stringify(meta2))

      const result = collectAuthoredSkills(skillsDir)
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
      const skillPath = join(skillsDir, 'no-meta-skill')
      mkdirSync(skillPath, { recursive: true })

      const result = collectAuthoredSkills(skillsDir)
      expect(result.ok).toBe(true)
      if (!result.ok)
        throw new Error(result.error)
      expect(result.data).toEqual([])
    })
  })

  describe('linkAuthoredSkills', () => {
    it('creates flat symlinks for skills without domain', () => {
      const skillPath = join(skillsDir, 'my-skill')
      mkdirSync(skillPath, { recursive: true })
      writeFileSync(join(skillPath, 'SKILL.md'), '# My Skill')

      const collected = [{ name: 'my-skill', meta: { type: 'authored' } as SkillMeta }]
      const result = linkAuthoredSkills(collected, skillsDir, authoredDir)
      expect(result.ok).toBe(true)
      if (!result.ok)
        throw new Error(result.error)

      const linkPath = join(authoredDir, 'my-skill')
      expect(readdirSync(authoredDir)).toContain('my-skill')
      expect(readlinkSync(linkPath)).toContain('my-skill')
      expect(result.data).toContain('linked  authored: my-skill')
    })

    it('creates domain-grouped symlinks for skills with domain', () => {
      const skillPath = join(skillsDir, 'frappe-skill')
      mkdirSync(skillPath, { recursive: true })
      writeFileSync(join(skillPath, 'SKILL.md'), '# Frappe Skill')

      const collected = [{ name: 'frappe-skill', meta: { type: 'authored', domain: 'frappe' } as SkillMeta }]
      const result = linkAuthoredSkills(collected, skillsDir, authoredDir)
      expect(result.ok).toBe(true)
      if (!result.ok)
        throw new Error(result.error)

      const linkPath = join(authoredDir, 'frappe', 'frappe-skill')
      expect(readdirSync(authoredDir)).toContain('frappe')
      expect(readdirSync(join(authoredDir, 'frappe'))).toContain('frappe-skill')
      expect(readlinkSync(linkPath)).toContain('frappe-skill')
      expect(result.data).toContain('linked  authored: frappe-skill (domain: frappe)')
    })

    it('re-links when domain changes', () => {
      const skillPath = join(skillsDir, 'migrated-skill')
      mkdirSync(skillPath, { recursive: true })
      writeFileSync(join(skillPath, 'SKILL.md'), '# Migrated Skill')

      // First link to frappe
      const collected1 = [{ name: 'migrated-skill', meta: { type: 'authored', domain: 'frappe' } as SkillMeta }]
      const result1 = linkAuthoredSkills(collected1, skillsDir, authoredDir)
      expect(result1.ok).toBe(true)
      expect(readdirSync(join(authoredDir, 'frappe'))).toContain('migrated-skill')

      // Re-link to sap
      const collected2 = [{ name: 'migrated-skill', meta: { type: 'authored', domain: 'sap' } as SkillMeta }]
      linkAuthoredSkills(collected2, skillsDir, authoredDir)
      expect(readdirSync(join(authoredDir, 'sap'))).toContain('migrated-skill')
      expect(readdirSync(join(authoredDir, 'frappe')).length).toBe(0)
    })

    it('handles multiple skills in same domain', () => {
      const skill1Path = join(skillsDir, 'frappe-skill-1')
      const skill2Path = join(skillsDir, 'frappe-skill-2')
      mkdirSync(skill1Path, { recursive: true })
      mkdirSync(skill2Path, { recursive: true })

      const collected = [
        { name: 'frappe-skill-1', meta: { type: 'authored', domain: 'frappe' } as SkillMeta },
        { name: 'frappe-skill-2', meta: { type: 'authored', domain: 'frappe' } as SkillMeta },
      ]
      linkAuthoredSkills(collected, skillsDir, authoredDir)

      const frappe = join(authoredDir, 'frappe')
      expect(readdirSync(frappe)).toContain('frappe-skill-1')
      expect(readdirSync(frappe)).toContain('frappe-skill-2')
    })
  })

  describe('pruneStaleLinksinAuthoredDir', () => {
    it('removes symlinks pointing to non-existent skills', () => {
      // Create stale symlink
      const staleLink = join(authoredDir, 'stale-skill')
      symlinkSync(join(skillsDir, 'stale-skill'), staleLink)

      const result = pruneStaleLinksinAuthoredDir(authoredDir, skillsDir)
      expect(result.ok).toBe(true)
      if (!result.ok)
        throw new Error(result.error)

      expect(readdirSync(authoredDir)).not.toContain('stale-skill')
      expect(result.data).toContain('removed stale authored symlink: stale-skill')
    })

    it('removes symlinks pointing to non-authored skills', () => {
      const skillPath = join(skillsDir, 'synced-skill')
      mkdirSync(skillPath, { recursive: true })
      writeFileSync(join(skillPath, 'meta.json'), JSON.stringify({ type: 'synced', upstream: 'test' }))

      // Create symlink
      const linkPath = join(authoredDir, 'synced-skill')
      symlinkSync(join(skillsDir, 'synced-skill'), linkPath)

      const result = pruneStaleLinksinAuthoredDir(authoredDir, skillsDir)
      expect(result.ok).toBe(true)
      if (!result.ok)
        throw new Error(result.error)

      expect(readdirSync(authoredDir)).not.toContain('synced-skill')
      expect(result.data).toContain('removed stale authored symlink: synced-skill')
    })

    it('keeps symlinks pointing to valid authored skills', () => {
      const skillPath = join(skillsDir, 'valid-skill')
      mkdirSync(skillPath, { recursive: true })
      writeFileSync(join(skillPath, 'meta.json'), JSON.stringify({ type: 'authored' }))

      const linkPath = join(authoredDir, 'valid-skill')
      symlinkSync(join(skillsDir, 'valid-skill'), linkPath)

      const result = pruneStaleLinksinAuthoredDir(authoredDir, skillsDir)
      expect(result.ok).toBe(true)
      if (!result.ok)
        throw new Error(result.error)

      expect(readdirSync(authoredDir)).toContain('valid-skill')
      expect(result.data).toHaveLength(0)
    })

    it('prunes stale symlinks in domain subdirectories', () => {
      const staleLink = join(authoredDir, 'frappe', 'stale-skill')
      mkdirSync(join(authoredDir, 'frappe'), { recursive: true })
      symlinkSync(join(skillsDir, 'stale-skill'), staleLink)

      const result = pruneStaleLinksinAuthoredDir(authoredDir, skillsDir)
      expect(result.ok).toBe(true)
      if (!result.ok)
        throw new Error(result.error)

      // frappe dir is removed because it's now empty
      expect(existsSync(join(authoredDir, 'frappe'))).toBe(false)
      expect(result.data).toContain('removed stale authored symlink: stale-skill')
    })

    it('removes empty domain directories after pruning', () => {
      const staleLink = join(authoredDir, 'frappe', 'stale-skill')
      mkdirSync(join(authoredDir, 'frappe'), { recursive: true })
      symlinkSync(join(skillsDir, 'stale-skill'), staleLink)

      const result = pruneStaleLinksinAuthoredDir(authoredDir, skillsDir)
      expect(result.ok).toBe(true)

      expect(readdirSync(authoredDir)).not.toContain('frappe')
    })

    it('leaves non-symlink files and directories alone', () => {
      mkdirSync(join(authoredDir, 'regular-dir'), { recursive: true })
      writeFileSync(join(authoredDir, 'regular-dir', 'nested-file.txt'), 'content')
      writeFileSync(join(authoredDir, 'regular-file.txt'), 'content')

      const result = pruneStaleLinksinAuthoredDir(authoredDir, skillsDir)
      expect(result.ok).toBe(true)

      expect(readdirSync(authoredDir)).toContain('regular-dir')
      expect(readdirSync(authoredDir)).toContain('regular-file.txt')
    })
  })
})
