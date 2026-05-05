import type { Dirent } from 'node:fs'
import type { SkillMeta, UpstreamMeta } from '../types.ts'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getGitSha } from './gitOps.ts'

/**
 * Hash all file contents in a directory (sorted by relative path). 12-char prefix.
 */
export function hashSkillDir(dir: string): string {
  const h = createHash('sha256')
  const entries: string[] = []

  function collect(current: string): void {
    let dirents: Dirent[]
    try {
      dirents = readdirSync(current, { withFileTypes: true })
    }
    catch {
      return
    }
    for (const d of dirents) {
      const full = join(current, d.name)
      if (d.isDirectory() && !d.name.startsWith('.'))
        collect(full)
      else if (d.isFile())
        entries.push(full.slice(dir.length + 1))
    }
  }

  collect(dir)
  entries.sort()
  for (const rel of entries) {
    h.update(rel)
    h.update(readFileSync(join(dir, rel)))
  }
  return h.digest('hex').slice(0, 12)
}

/**
 * Copy selected skills from an Upstream submodule directory into `skills/`.
 * Handles directory reset, file copy, LICENSE discovery, hash computation,
 * and per-skill meta.json write.
 */
export function copySkillsFromUpstream(
  upstreamName: string,
  upstreamDir: string,
  config: UpstreamMeta,
  root: string,
  log: (msg: string) => void = console.log,
  force = false,
): void {
  if (!config.skills)
    return

  const sha = getGitSha(upstreamDir)
  const today = new Date().toISOString().split('T')[0]

  for (const [skillPath, outputName] of Object.entries(config.skills)) {
    const sourcePath = skillPath === '.' ? upstreamDir : join(upstreamDir, skillPath)
    const outputPath = join(root, 'skills', outputName)

    if (!existsSync(sourcePath)) {
      log(`SKIP ${upstreamName}/${skillPath} — path not found in submodule`)
      continue
    }

    const contentHash = hashSkillDir(sourcePath)

    // Read existing meta to compare hash and carry forward syncedAt if unchanged
    let oldSyncedAt: string | undefined
    let hashUnchanged = false
    const existingMetaPath = join(outputPath, 'meta.json')
    if (existsSync(existingMetaPath)) {
      try {
        const old = JSON.parse(readFileSync(existingMetaPath, 'utf-8')) as SkillMeta
        if (old.type === 'synced') {
          oldSyncedAt = old.syncedAt
          hashUnchanged = old.contentHash === contentHash
          if (!force && hashUnchanged) {
            log(`unchanged  ${upstreamName}/${skillPath} → skills/${outputName}`)
            continue
          }
        }
      }
      catch {
        /* corrupt meta — fall through to re-copy */
      }
    }

    if (existsSync(outputPath))
      rmSync(outputPath, { recursive: true })
    mkdirSync(outputPath, { recursive: true })
    cpSync(sourcePath, outputPath, { recursive: true })

    for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
      const licenseSrc = join(upstreamDir, name)
      if (existsSync(licenseSrc)) {
        cpSync(licenseSrc, join(outputPath, 'LICENSE.md'))
        break
      }
    }

    const syncedAt = hashUnchanged && oldSyncedAt != null ? oldSyncedAt : today
    const skillMeta: SkillMeta = {
      type: 'synced',
      upstream: upstreamName,
      sourceUrl: config.url,
      ...(config.branch ? { branch: config.branch } : {}),
      skillPath,
      gitSha: sha ?? 'unknown',
      contentHash,
      syncedAt,
    }
    writeFileSync(join(outputPath, 'meta.json'), `${JSON.stringify(skillMeta, null, 2)}\n`)
    log(`synced  ${upstreamName}/${skillPath} → skills/${outputName}`)
  }
}
