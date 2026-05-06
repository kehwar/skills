import type { Dirent } from 'node:fs'
import type { Result, SkillMeta, UpstreamMeta } from '../types.ts'
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
 *
 * Returns Result<CopySkillsResult> where the data contains:
 * - synced: skills that were copied
 * - skipped: skills that were unchanged or not found
 * - errors: skills that failed to copy (individual failures)
 *
 * The outer Result is ok: true if the operation completed (even if individual skills failed).
 * It's ok: false only for catastrophic failures that prevent processing.
 */
export interface CopySkillsResult {
  synced: Array<{ skillPath: string, outputName: string }>
  skipped: Array<{ skillPath: string, outputName: string, reason: string }>
  errors: Array<{ skillPath: string, outputName: string, error: string }>
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export function copySkillsFromUpstream(
  upstreamName: string,
  upstreamDir: string,
  config: UpstreamMeta,
  root: string,
  force = false,
): Result<CopySkillsResult> {
  const result: CopySkillsResult = {
    synced: [],
    skipped: [],
    errors: [],
  }

  if (!config.skills)
    return { ok: true, data: result }

  const sha = getGitSha(upstreamDir)
  const today = new Date().toISOString().split('T')[0]

  for (const [skillPath, outputName] of Object.entries(config.skills)) {
    try {
      const sourcePath = skillPath === '.' ? upstreamDir : join(upstreamDir, skillPath)
      const outputPath = join(root, 'skills', outputName)

      if (!existsSync(sourcePath)) {
        result.skipped.push({
          skillPath,
          outputName,
          reason: 'path not found in submodule',
        })
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
              result.skipped.push({
                skillPath,
                outputName,
                reason: 'unchanged',
              })
              continue
            }
          }
        }
        catch {
          // corrupt meta — fall through to re-copy
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
      result.synced.push({ skillPath, outputName })
    }
    catch (err) {
      result.errors.push({
        skillPath,
        outputName,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { ok: true, data: result }
}
