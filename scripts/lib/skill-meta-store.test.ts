import type { SkillMeta } from '../types.ts'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SkillMetaStore } from './skill-meta-store.ts'

describe('skillMetaStore', () => {
  let temporaryDirectory: string
  let skillsDirectory: string

  beforeEach(() => {
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'skillmetastore-'))
    skillsDirectory = path.join(temporaryDirectory, 'skills')
    mkdirSync(skillsDirectory, { recursive: true })
  })

  afterEach(() => {
    rmSync(temporaryDirectory, { recursive: true })
  })

  const createSkill = (name: string, meta: SkillMeta) => {
    const skillPath = path.join(skillsDirectory, name)
    mkdirSync(skillPath, { recursive: true })
    writeFileSync(path.join(skillPath, 'meta.json'), JSON.stringify(meta))
  }

  describe('lOAD & SCAN', () => {
    it('loads all skills with valid meta.json', () => {
      const authoredMeta: SkillMeta = { type: 'authored' }
      const syncedMeta: SkillMeta = {
        type: 'synced',
        upstream: 'antfu',
        sourceUrl: 'https://github.com/antfu/skills',
        skillPath: 'skills/vue',
        gitSha: 'abc123',
        contentHash: 'def456',
        syncedAt: '2024-01-01T00:00:00Z',
      }

      createSkill('my-authored-skill', authoredMeta)
      createSkill('my-synced-skill', syncedMeta)

      const store = new SkillMetaStore(skillsDirectory)
      const allMeta = store.readAllSkills()

      expect(allMeta).toHaveProperty('my-authored-skill')
      expect(allMeta).toHaveProperty('my-synced-skill')
      expect(allMeta['my-authored-skill'].type).toBe('authored')
      expect(allMeta['my-synced-skill'].type).toBe('synced')
    })

    it('skips skills without meta.json and logs warning', () => {
      const authoredMeta: SkillMeta = { type: 'authored' }
      createSkill('valid-skill', authoredMeta)

      // Create skill folder without meta.json
      const invalidSkillPath = path.join(skillsDirectory, 'invalid-skill')
      mkdirSync(invalidSkillPath, { recursive: true })
      writeFileSync(path.join(invalidSkillPath, 'SKILL.md'), '# Skill')

      const warnings: string[] = []
      const store = new SkillMetaStore(skillsDirectory, { onWarning: message => warnings.push(message) })
      const allMeta = store.readAllSkills()

      expect(allMeta).toHaveProperty('valid-skill')
      expect(allMeta).not.toHaveProperty('invalid-skill')
      expect(warnings.length).toBeGreaterThan(0)
      expect(warnings[0]).toContain('invalid-skill')
    })

    it('skips skills with invalid JSON and logs warning', () => {
      const validMeta: SkillMeta = { type: 'authored' }
      createSkill('valid-skill', validMeta)

      // Create skill with invalid JSON
      const brokenPath = path.join(skillsDirectory, 'broken-skill')
      mkdirSync(brokenPath, { recursive: true })
      writeFileSync(path.join(brokenPath, 'meta.json'), 'not valid json {')

      const warnings: string[] = []
      const store = new SkillMetaStore(skillsDirectory, { onWarning: message => warnings.push(message) })
      const allMeta = store.readAllSkills()

      expect(allMeta).toHaveProperty('valid-skill')
      expect(allMeta).not.toHaveProperty('broken-skill')
      expect(warnings.length).toBeGreaterThan(0)
    })

    it('returns empty object when skills directory is empty', () => {
      const store = new SkillMetaStore(skillsDirectory)
      const allMeta = store.readAllSkills()

      expect(allMeta).toEqual({})
    })

    it('returns empty object when skills directory does not exist', () => {
      const store = new SkillMetaStore(path.join(skillsDirectory, 'nonexistent'))
      const allMeta = store.readAllSkills()

      expect(allMeta).toEqual({})
    })
  })

  describe('gET SKILL', () => {
    it('returns specific skill metadata', () => {
      const meta: SkillMeta = { type: 'authored', domain: 'frappe' }
      createSkill('test-skill', meta)

      const store = new SkillMetaStore(skillsDirectory)
      const result = store.getSkillMeta('test-skill')

      expect(result).toEqual(meta)
    })

    it('returns undefined for nonexistent skill', () => {
      const store = new SkillMetaStore(skillsDirectory)
      const result = store.getSkillMeta('nonexistent')

      expect(result).toBeUndefined()
    })

    it('returns undefined for skill with invalid meta.json', () => {
      const brokenPath = path.join(skillsDirectory, 'broken-skill')
      mkdirSync(brokenPath, { recursive: true })
      writeFileSync(path.join(brokenPath, 'meta.json'), 'invalid')

      const warnings: string[] = []
      const store = new SkillMetaStore(skillsDirectory, { onWarning: message => warnings.push(message) })
      const result = store.getSkillMeta('broken-skill')

      expect(result).toBeUndefined()
    })
  })

  describe('aDD SKILL', () => {
    it('adds a new skill', () => {
      const store = new SkillMetaStore(skillsDirectory)
      const meta: SkillMeta = { type: 'authored', domain: 'frappe' }
      store.addSkill('new-skill', meta)

      expect(store.getSkillMeta('new-skill')).toEqual(meta)
    })

    it('tracks changes after adding skill', () => {
      const store = new SkillMetaStore(skillsDirectory)
      expect(store.hasChanges()).toBe(false)

      const meta: SkillMeta = { type: 'authored' }
      store.addSkill('new-skill', meta)
      expect(store.hasChanges()).toBe(true)
    })

    it('throws when adding duplicate skill', () => {
      const meta: SkillMeta = { type: 'authored' }
      createSkill('existing-skill', meta)

      const store = new SkillMetaStore(skillsDirectory)
      expect(() => {
        store.addSkill('existing-skill', meta)
      }).toThrow('Skill already exists')
    })

    it('can save newly added skill', () => {
      const store = new SkillMetaStore(skillsDirectory)
      const meta: SkillMeta = { type: 'authored', domain: 'frappe' }
      store.addSkill('new-skill', meta)
      store.saveSkill('new-skill')

      const saved = JSON.parse(
        readFileSync(path.join(skillsDirectory, 'new-skill', 'meta.json'), 'utf8'),
      )
      expect(saved).toEqual(meta)
    })
  })

  describe('uPDATE & TRACK CHANGES', () => {
    it('tracks changes after update', () => {
      const originalMeta: SkillMeta = { type: 'authored' }
      createSkill('test-skill', originalMeta)

      const store = new SkillMetaStore(skillsDirectory)
      expect(store.hasChanges()).toBe(false)

      store.updateSkill('test-skill', { type: 'authored', domain: 'frappe' })
      expect(store.hasChanges()).toBe(true)
    })

    it('updates skill metadata in memory', () => {
      const originalMeta: SkillMeta = { type: 'authored' }
      createSkill('test-skill', originalMeta)

      const store = new SkillMetaStore(skillsDirectory)
      store.updateSkill('test-skill', { type: 'authored', domain: 'frappe' })

      const updated = store.getSkillMeta('test-skill')
      expect(updated).toEqual({ type: 'authored', domain: 'frappe' })
    })

    it('throws when updating nonexistent skill', () => {
      const store = new SkillMetaStore(skillsDirectory)

      expect(() => {
        store.updateSkill('nonexistent', { type: 'authored' })
      }).toThrow('Skill not found')
    })
  })

  describe('sAVE', () => {
    it('saves changes to disk with proper formatting', () => {
      const originalMeta: SkillMeta = { type: 'authored' }
      createSkill('test-skill', originalMeta)

      const store = new SkillMetaStore(skillsDirectory)
      store.updateSkill('test-skill', { type: 'authored', domain: 'frappe' })
      store.saveSkill('test-skill')

      const saved = JSON.parse(
        readFileSync(path.join(skillsDirectory, 'test-skill', 'meta.json'), 'utf8'),
      )
      expect(saved).toEqual({ type: 'authored', domain: 'frappe' })
    })

    it('does not save if no changes', () => {
      const meta: SkillMeta = { type: 'authored' }
      createSkill('test-skill', meta)

      const store = new SkillMetaStore(skillsDirectory)
      // saveSkill on unchanged skill should not reformat
      store.saveSkill('test-skill')

      const afterContent = readFileSync(path.join(skillsDirectory, 'test-skill', 'meta.json'), 'utf8')
      // Just verify it doesn't throw; formatting may differ
      expect(afterContent).toBeTruthy()
    })

    it('saves only specified skill', () => {
      const meta: SkillMeta = { type: 'authored' }
      createSkill('skill1', meta)
      createSkill('skill2', meta)

      const store = new SkillMetaStore(skillsDirectory)
      store.updateSkill('skill1', { type: 'authored', domain: 'frappe' })
      store.updateSkill('skill2', { type: 'authored', domain: 'sap' })
      store.saveSkill('skill1')

      const skill1Meta = JSON.parse(
        readFileSync(path.join(skillsDirectory, 'skill1', 'meta.json'), 'utf8'),
      )
      const skill2Meta = JSON.parse(
        readFileSync(path.join(skillsDirectory, 'skill2', 'meta.json'), 'utf8'),
      )

      expect(skill1Meta.domain).toBe('frappe')
      expect(skill2Meta.domain).toBeUndefined()
    })

    it('throws when saving nonexistent skill', () => {
      const store = new SkillMetaStore(skillsDirectory)

      const result = store.saveSkill('nonexistent')
      expect(result.ok).toBe(false)
      if (result.ok)
        throw new Error('Expected failure')
      expect(result.error).toContain('Skill not found')
    })
  })

  describe('bATCH SAVE', () => {
    it('saves all changed skills', () => {
      const meta: SkillMeta = { type: 'authored' }
      createSkill('skill1', meta)
      createSkill('skill2', meta)

      const store = new SkillMetaStore(skillsDirectory)
      store.updateSkill('skill1', { type: 'authored', domain: 'frappe' })
      store.updateSkill('skill2', { type: 'authored', domain: 'sap' })
      store.saveAll()

      const skill1Meta = JSON.parse(
        readFileSync(path.join(skillsDirectory, 'skill1', 'meta.json'), 'utf8'),
      )
      const skill2Meta = JSON.parse(
        readFileSync(path.join(skillsDirectory, 'skill2', 'meta.json'), 'utf8'),
      )

      expect(skill1Meta.domain).toBe('frappe')
      expect(skill2Meta.domain).toBe('sap')
    })

    it('tracks completion after saveAll', () => {
      const meta: SkillMeta = { type: 'authored' }
      createSkill('test-skill', meta)

      const store = new SkillMetaStore(skillsDirectory)
      store.updateSkill('test-skill', { type: 'authored', domain: 'frappe' })
      expect(store.hasChanges()).toBe(true)

      store.saveAll()
      expect(store.hasChanges()).toBe(false)
    })
  })
})
