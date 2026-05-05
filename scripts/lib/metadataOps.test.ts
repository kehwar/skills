import type { Meta } from '../types.ts'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { saveMeta } from './metadataOps.ts'

describe('saveMeta', () => {
  let tmp: string
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'skills-test-')) })
  afterEach(() => { rmSync(tmp, { recursive: true }) })

  it('writes meta.json with upstream keys sorted alphabetically', () => {
    const meta: Meta = {
      upstreams: {
        zzz: { url: 'https://example.com/zzz' },
        aaa: { url: 'https://example.com/aaa' },
        mmm: { url: 'https://example.com/mmm' },
      },
    }
    saveMeta(meta, tmp)
    const written = JSON.parse(readFileSync(join(tmp, 'meta.json'), 'utf-8')) as Meta
    expect(Object.keys(written.upstreams)).toEqual(['aaa', 'mmm', 'zzz'])
  })

  it('writes a trailing newline', () => {
    const meta: Meta = { upstreams: { foo: { url: 'https://example.com/foo' } } }
    saveMeta(meta, tmp)
    const raw = readFileSync(join(tmp, 'meta.json'), 'utf-8')
    expect(raw.endsWith('\n')).toBe(true)
  })

  it('writes to meta.json in root', () => {
    const meta: Meta = { upstreams: { foo: { url: 'https://example.com/foo' } } }
    saveMeta(meta, tmp)
    expect(existsSync(join(tmp, 'meta.json'))).toBe(true)
  })
})
