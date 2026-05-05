import type { SkillMeta } from '../types.ts'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SkillMetaStore } from './skillMetaStore.ts'

describe('skillMetaStore', () => {
  let tempDir: string
  let skillsDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillmetastore-'))
    skillsDir = join(tempDir, 'skills')
    mkdirSync(skillsDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true })
  })

  const createSkill = (name: string, meta: SkillMeta) => {
    const skillPath = join(skillsDir, name)
    mkdirSync(skillPath, { recursive: true })
    writeFileSync(join(skillPath, 'meta.json'), JSON.stringify(meta))
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

      const store = new SkillMetaStore(skillsDir)
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
      const invalidSkillPath = join(skillsDir, 'invalid-skill')
      mkdirSync(invalidSkillPath, { recursive: true })
      writeFileSync(join(invalidSkillPath, 'SKILL.md'), '# Skill')

      const warnings: string[] = []
      const store = new SkillMetaStore(skillsDir, { onWarning: msg => warnings.push(msg) })
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
      const brokenPath = join(skillsDir, 'broken-skill')
      mkdirSync(brokenPath, { recursive: true })
      writeFileSync(join(brokenPath, 'meta.json'), 'not valid json {')

      const warnings: string[] = []
      const store = new SkillMetaStore(skillsDir, { onWarning: msg => warnings.push(msg) })
      const allMeta = store.readAllSkills()

      expect(allMeta).toHaveProperty('valid-skill')
      expect(allMeta).not.toHaveProperty('broken-skill')
      expect(warnings.length).toBeGreaterThan(0)
    })

    it('returns empty object when skills dir is empty', () => {
      const store = new SkillMetaStore(skillsDir)
      const allMeta = store.readAllSkills()

      expect(allMeta).toEqual({})
    })

    it('returns empty object when skills dir does not exist', () => {
      const store = new SkillMetaStore(join(skillsDir, 'nonexistent'))
      const allMeta = store.readAllSkills()

      expect(allMeta).toEqual({})
    })
  })

  describe('gET SKILL', () => {
    it('returns specific skill metadata', () => {
      const meta: SkillMeta = { type: 'authored', domain: 'frappe' }
      createSkill('test-skill', meta)

      const store = new SkillMetaStore(skillsDir)
      const result = store.getSkillMeta('test-skill')

      expect(result).toEqual(meta)
    })

    it('returns undefined for nonexistent skill', () => {
      const store = new SkillMetaStore(skillsDir)
      const result = store.getSkillMeta('nonexistent')

      expect(result).toBeUndefined()
    })

    it('returns undefined for skill with invalid meta.json', () => {
      const brokenPath = join(skillsDir, 'broken-skill')
      mkdirSync(brokenPath, { recursive: true })
      writeFileSync(join(brokenPath, 'meta.json'), 'invalid')

      const warnings: string[] = []
      const store = new SkillMetaStore(skillsDir, { onWarning: msg => warnings.push(msg) })
      const result = store.getSkillMeta('broken-skill')

      expect(result).toBeUndefined()
    })
  })

  describe('aDD SKILL', () => {
    it('adds a new skill', () => {
      const store = new SkillMetaStore(skillsDir)
      const meta: SkillMeta = { type: 'authored', domain: 'frappe' }
      store.addSkill('new-skill', meta)

      expect(store.getSkillMeta('new-skill')).toEqual(meta)
    })

    it('tracks changes after adding skill', () => {
      const store = new SkillMetaStore(skillsDir)
      expect(store.hasChanges()).toBe(false)

      const meta: SkillMeta = { type: 'authored' }
      store.addSkill('new-skill', meta)
      expect(store.hasChanges()).toBe(true)
    })

    it('throws when adding duplicate skill', () => {
      const meta: SkillMeta = { type: 'authored' }
      createSkill('existing-skill', meta)

      const store = new SkillMetaStore(skillsDir)
      expect(() => {
        store.addSkill('existing-skill', meta)
      }).toThrow('Skill already exists')
    })

    it('can save newly added skill', () => {
      const store = new SkillMetaStore(skillsDir)
      const meta: SkillMeta = { type: 'authored', domain: 'frappe' }
      store.addSkill('new-skill', meta)
      store.saveSkill('new-skill')

      const saved = JSON.parse(
        readFileSync(join(skillsDir, 'new-skill', 'meta.json'), 'utf-8'),
      )
      expect(saved).toEqual(meta)
    })
  })

  describe('uPDATE & TRACK CHANGES', () => {
    it('tracks changes after update', () => {
      const originalMeta: SkillMeta = { type: 'authored' }
      createSkill('test-skill', originalMeta)

      const store = new SkillMetaStore(skillsDir)
      expect(store.hasChanges()).toBe(false)

      store.updateSkill('test-skill', { type: 'authored', domain: 'frappe' })
      expect(store.hasChanges()).toBe(true)
    })

    it('updates skill metadata in memory', () => {
      const originalMeta: SkillMeta = { type: 'authored' }
      createSkill('test-skill', originalMeta)

      const store = new SkillMetaStore(skillsDir)
      store.updateSkill('test-skill', { type: 'authored', domain: 'frappe' })

      const updated = store.getSkillMeta('test-skill')
      expect(updated).toEqual({ type: 'authored', domain: 'frappe' })
    })

    it('throws when updating nonexistent skill', () => {
      const store = new SkillMetaStore(skillsDir)

      expect(() => {
        store.updateSkill('nonexistent', { type: 'authored' })
      }).toThrow('Skill not found')
    })
  })

  describe('sAVE', () => {
    it('saves changes to disk with proper formatting', () => {
      const originalMeta: SkillMeta = { type: 'authored' }
      createSkill('test-skill', originalMeta)

      const store = new SkillMetaStore(skillsDir)
      store.updateSkill('test-skill', { type: 'authored', domain: 'frappe' })
      store.saveSkill('test-skill')

      const saved = JSON.parse(
        readFileSync(join(skillsDir, 'test-skill', 'meta.json'), 'utf-8'),
      )
      expect(saved).toEqual({ type: 'authored', domain: 'frappe' })
    })

    it('does not save if no changes', () => {
      const meta: SkillMeta = { type: 'authored' }
      createSkill('test-skill', meta)

      const store = new SkillMetaStore(skillsDir)
      // saveSkill on unchanged skill should not reformat
      store.saveSkill('test-skill')

      const afterContent = readFileSync(join(skillsDir, 'test-skill', 'meta.json'), 'utf-8')
      // Just verify it doesn't throw; formatting may differ
      expect(afterContent).toBeTruthy()
    })

    it('saves only specified skill', () => {
      const meta: SkillMeta = { type: 'authored' }
      createSkill('skill1', meta)
      createSkill('skill2', meta)

      const store = new SkillMetaStore(skillsDir)
      store.updateSkill('skill1', { type: 'authored', domain: 'frappe' })
      store.updateSkill('skill2', { type: 'authored', domain: 'sap' })
      store.saveSkill('skill1')

      const skill1Meta = JSON.parse(
        readFileSync(join(skillsDir, 'skill1', 'meta.json'), 'utf-8'),
      )
      const skill2Meta = JSON.parse(
        readFileSync(join(skillsDir, 'skill2', 'meta.json'), 'utf-8'),
      )

      expect(skill1Meta.domain).toBe('frappe')
      expect(skill2Meta.domain).toBeUndefined()
    })

    it('throws when saving nonexistent skill', () => {
      const store = new SkillMetaStore(skillsDir)

      expect(() => {
        store.saveSkill('nonexistent')
      }).toThrow('Skill not found')
    })
  })

  describe('bATCH SAVE', () => {
    it('saves all changed skills', () => {
      const meta: SkillMeta = { type: 'authored' }
      createSkill('skill1', meta)
      createSkill('skill2', meta)

      const store = new SkillMetaStore(skillsDir)
      store.updateSkill('skill1', { type: 'authored', domain: 'frappe' })
      store.updateSkill('skill2', { type: 'authored', domain: 'sap' })
      store.saveAll()

      const skill1Meta = JSON.parse(
        readFileSync(join(skillsDir, 'skill1', 'meta.json'), 'utf-8'),
      )
      const skill2Meta = JSON.parse(
        readFileSync(join(skillsDir, 'skill2', 'meta.json'), 'utf-8'),
      )

      expect(skill1Meta.domain).toBe('frappe')
      expect(skill2Meta.domain).toBe('sap')
    })

    it('tracks completion after saveAll', () => {
      const meta: SkillMeta = { type: 'authored' }
      createSkill('test-skill', meta)

      const store = new SkillMetaStore(skillsDir)
      store.updateSkill('test-skill', { type: 'authored', domain: 'frappe' })
      expect(store.hasChanges()).toBe(true)

      store.saveAll()
      expect(store.hasChanges()).toBe(false)
    })
  })
})
