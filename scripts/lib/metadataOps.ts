import type { Meta } from '../types.ts'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Serialise meta.json with sorted upstream keys and a trailing newline.
 */
export function saveMeta(meta: Meta, root: string): void {
  const metaPath = join(root, 'meta.json')
  meta.upstreams = Object.fromEntries(
    Object.entries(meta.upstreams).sort(([a], [b]) => a.localeCompare(b)),
  )
  writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`)
}
