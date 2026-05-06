import type { Meta, Result, UpstreamMeta } from '../types.ts'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export class MetaStore {
  private root: string
  private meta: Meta
  private original: Meta

  constructor(root: string) {
    this.root = root
    this.meta = this.validate(this.load())
    this.original = this.cloneMeta(this.meta)
  }

  private load(): Meta {
    const metaPath = path.join(this.root, 'meta.json')
    const content = readFileSync(metaPath, 'utf8')
    return JSON.parse(content)
  }

  private validate(meta: unknown): Meta {
    if (!meta || typeof meta !== 'object') {
      throw new Error('Invalid meta.json: must be an object')
    }
    if (!('upstreams' in meta)) {
      throw new Error('Invalid meta.json: upstreams field is required')
    }
    if (typeof meta.upstreams !== 'object' || Array.isArray(meta.upstreams)) {
      throw new TypeError('Invalid meta.json: upstreams must be an object')
    }
    return meta as Meta
  }

  private cloneMeta(meta: Meta): Meta {
    return structuredClone(meta)
  }

  private sortUpstreams(upstreams: Record<string, UpstreamMeta>): Record<string, UpstreamMeta> {
    return Object.fromEntries(
      Object.entries(upstreams).sort(([a], [b]) => a.localeCompare(b)),
    )
  }

  private serializeMeta(): string {
    const sorted = this.sortUpstreams(this.meta.upstreams)
    const toWrite = { upstreams: sorted }
    return `${JSON.stringify(toWrite, undefined, 2)}\n`
  }

  readMeta(): Meta {
    return this.meta
  }

  getUpstream(key: string): UpstreamMeta | undefined {
    return this.meta.upstreams[key]
  }

  getAllUpstreams(): Record<string, UpstreamMeta> {
    return this.meta.upstreams
  }

  updateUpstream(key: string, partial: Partial<UpstreamMeta>): void {
    if (!this.meta.upstreams[key]) {
      throw new Error(`Upstream not found: ${key}`)
    }
    this.meta.upstreams[key] = {
      ...this.meta.upstreams[key],
      ...partial,
    }
  }

  hasChanges(): boolean {
    return JSON.stringify(this.meta) !== JSON.stringify(this.original)
  }

  saveMeta(): Result<void> {
    if (!this.hasChanges()) {
      return { ok: true, data: undefined }
    }

    try {
      const metaPath = path.join(this.root, 'meta.json')
      writeFileSync(metaPath, this.serializeMeta())
      return { ok: true, data: undefined }
    }
    catch (error) {
      return {
        ok: false,
        error: `Failed to save meta.json: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }
}
