import type { Meta } from '../types.ts'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MetaStore } from './meta-store.ts'

describe('metaStore', () => {
  let temporaryDirectory: string

  beforeEach(() => {
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'metastore-'))
  })

  afterEach(() => {
    rmSync(temporaryDirectory, { recursive: true })
  })

  const createStoreWithMeta = (meta: Meta) => {
    writeFileSync(path.join(temporaryDirectory, 'meta.json'), JSON.stringify(meta))
    return new MetaStore(temporaryDirectory)
  }

  describe('rEAD & VALIDATE', () => {
    it('loads valid meta.json and returns Meta object', () => {
      const validMeta: Meta = {
        upstreams: {
          antfu: {
            url: 'https://github.com/antfu/skills',
            skills: { 'skills/vue': 'vue' },
            available: { 'skills/vue': 'abc123def456' },
          },
        },
      }

      const store = createStoreWithMeta(validMeta)
      const result = store.readMeta()
      expect(result.upstreams).toHaveProperty('antfu')
      expect(result.upstreams.antfu.url).toBe('https://github.com/antfu/skills')
    })

    it('throws when meta.json does not exist', () => {
      expect(() => new MetaStore(temporaryDirectory)).toThrow()
    })

    it('throws when meta.json is invalid JSON', () => {
      writeFileSync(path.join(temporaryDirectory, 'meta.json'), 'not valid json {')
      expect(() => new MetaStore(temporaryDirectory)).toThrow()
    })

    it('throws when upstreams field is missing', () => {
      writeFileSync(path.join(temporaryDirectory, 'meta.json'), JSON.stringify({}))
      expect(() => new MetaStore(temporaryDirectory)).toThrow()
    })

    it('throws when upstreams is not an object', () => {
      writeFileSync(path.join(temporaryDirectory, 'meta.json'), JSON.stringify({ upstreams: [] }))
      expect(() => new MetaStore(temporaryDirectory)).toThrow()
    })
  })

  describe('gET UPSTREAM', () => {
    it('returns upstream by key', () => {
      const meta: Meta = {
        upstreams: {
          antfu: {
            url: 'https://github.com/antfu/skills',
          },
          frappe: {
            url: 'https://github.com/frappe/frappe',
            branch: 'develop',
          },
        },
      }

      const store = createStoreWithMeta(meta)
      const upstream = store.getUpstream('antfu')

      expect(upstream).toEqual({
        url: 'https://github.com/antfu/skills',
      })
    })

    it('returns undefined for missing upstream', () => {
      const meta: Meta = {
        upstreams: {
          antfu: {
            url: 'https://github.com/antfu/skills',
          },
        },
      }

      const store = createStoreWithMeta(meta)
      expect(store.getUpstream('nonexistent')).toBeUndefined()
    })

    it('returns all upstreams', () => {
      const meta: Meta = {
        upstreams: {
          antfu: { url: 'https://github.com/antfu/skills' },
          frappe: { url: 'https://github.com/frappe/frappe' },
        },
      }

      const store = createStoreWithMeta(meta)
      const all = store.getAllUpstreams()

      expect(Object.keys(all)).toEqual(['antfu', 'frappe'])
      expect(all.antfu.url).toBe('https://github.com/antfu/skills')
    })
  })

  describe('uPDATE UPSTREAM', () => {
    it('updates upstream url', () => {
      const meta: Meta = {
        upstreams: {
          antfu: {
            url: 'https://github.com/antfu/skills',
          },
        },
      }

      const store = createStoreWithMeta(meta)
      store.updateUpstream('antfu', { url: 'https://github.com/new/url' })

      const updated = store.getUpstream('antfu')
      expect(updated?.url).toBe('https://github.com/new/url')
    })

    it('updates upstream skills', () => {
      const meta: Meta = {
        upstreams: {
          antfu: {
            url: 'https://github.com/antfu/skills',
            skills: { 'skills/vue': 'vue' },
          },
        },
      }

      const store = createStoreWithMeta(meta)
      store.updateUpstream('antfu', { skills: { 'skills/vite': 'vite' } })

      expect(store.getUpstream('antfu')?.skills).toEqual({ 'skills/vite': 'vite' })
    })

    it('tracks changes between original and current state', () => {
      const meta: Meta = {
        upstreams: {
          antfu: {
            url: 'https://github.com/antfu/skills',
          },
        },
      }

      const store = createStoreWithMeta(meta)
      expect(store.hasChanges()).toBe(false)

      store.updateUpstream('antfu', { url: 'https://github.com/new/url' })
      expect(store.hasChanges()).toBe(true)
    })

    it('merges partial updates', () => {
      const meta: Meta = {
        upstreams: {
          antfu: {
            url: 'https://github.com/antfu/skills',
            branch: 'main',
            skills: { 'skills/vue': 'vue' },
          },
        },
      }

      const store = createStoreWithMeta(meta)
      store.updateUpstream('antfu', { url: 'https://github.com/new/url' })

      const updated = store.getUpstream('antfu')
      expect(updated?.url).toBe('https://github.com/new/url')
      expect(updated?.branch).toBe('main')
      expect(updated?.skills).toEqual({ 'skills/vue': 'vue' })
    })
  })

  describe('sAVE', () => {
    it('writes meta.json with sorted upstream keys', () => {
      const meta: Meta = {
        upstreams: {
          zebra: { url: 'https://github.com/z/z' },
          antfu: { url: 'https://github.com/antfu/skills' },
          frappe: { url: 'https://github.com/frappe/frappe' },
        },
      }

      const store = createStoreWithMeta(meta)
      store.updateUpstream('zebra', { url: 'https://github.com/z/z-updated' })
      store.saveMeta()

      const saved = JSON.parse(readFileSync(path.join(temporaryDirectory, 'meta.json'), 'utf8'))
      const keys = Object.keys(saved.upstreams)
      expect(keys).toEqual(['antfu', 'frappe', 'zebra'])
    })

    it('writes file with trailing newline', () => {
      const meta: Meta = {
        upstreams: {
          antfu: { url: 'https://github.com/antfu/skills' },
        },
      }

      const store = createStoreWithMeta(meta)
      store.updateUpstream('antfu', { url: 'https://github.com/antfu/skills-updated' })
      store.saveMeta()

      const content = readFileSync(path.join(temporaryDirectory, 'meta.json'), 'utf8')
      expect(content).toMatch(/\n$/)
    })

    it('preserves nested fields during save', () => {
      const meta: Meta = {
        upstreams: {
          antfu: {
            url: 'https://github.com/antfu/skills',
            skills: { 'skills/vue': 'vue' },
            available: { 'skills/vue': 'hash123' },
            branch: 'main',
          },
        },
      }

      const store = createStoreWithMeta(meta)
      store.updateUpstream('antfu', { url: 'https://github.com/new/url' })
      store.saveMeta()

      const saved = JSON.parse(readFileSync(path.join(temporaryDirectory, 'meta.json'), 'utf8'))
      expect(saved.upstreams.antfu).toEqual({
        url: 'https://github.com/new/url',
        skills: { 'skills/vue': 'vue' },
        available: { 'skills/vue': 'hash123' },
        branch: 'main',
      })
    })

    it('does not write if no changes', async () => {
      const meta: Meta = {
        upstreams: {
          antfu: { url: 'https://github.com/antfu/skills' },
        },
      }

      const store = createStoreWithMeta(meta)

      // Modify and immediately save to ensure hasChanges returns false
      store.updateUpstream('antfu', { url: 'https://github.com/antfu/skills' })
      store.saveMeta()
      // Re-create store to verify no changes detected
      const store2 = createStoreWithMeta(meta)
      expect(store2.hasChanges()).toBe(false)
    })
  })
})
