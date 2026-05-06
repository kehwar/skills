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
    processSingleSkill(
      skillPath,
      outputName,
      upstreamName,
      upstreamDir,
      config,
      root,
      sha,
      today,
      force,
      result,
    )
  }

  return { ok: true, data: result }
}

function processSingleSkill(
  skillPath: string,
  outputName: string,
  upstreamName: string,
  upstreamDir: string,
  config: UpstreamMeta,
  root: string,
  sha: string | null,
  today: string,
  force: boolean,
  result: CopySkillsResult,
): void {
  try {
    const sourcePath = skillPath === '.' ? upstreamDir : join(upstreamDir, skillPath)
    const outputPath = join(root, 'skills', outputName)

    if (!existsSync(sourcePath)) {
      result.skipped.push({
        skillPath,
        outputName,
        reason: 'path not found in submodule',
      })
      return
    }

    const contentHash = hashSkillDir(sourcePath)
    const skipResult = checkIfSkillUnchanged(outputPath, skillPath, outputName, contentHash, force)
    if (skipResult) {
      result.skipped.push(skipResult)
      return
    }

    const oldSyncedAt = readPreviousSyncedAt(outputPath)
    const hashUnchanged = readPreviousHash(outputPath) === contentHash

    copySkilldirectory(sourcePath, outputPath, upstreamDir)

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

function checkIfSkillUnchanged(
  outputPath: string,
  skillPath: string,
  outputName: string,
  contentHash: string,
  force: boolean,
): { skillPath: string, outputName: string, reason: string } | null {
  const existingMetaPath = join(outputPath, 'meta.json')
  if (!existsSync(existingMetaPath))
    return null

  try {
    const old = JSON.parse(readFileSync(existingMetaPath, 'utf-8')) as SkillMeta
    if (old.type === 'synced' && !force && old.contentHash === contentHash) {
      return {
        skillPath,
        outputName,
        reason: 'unchanged',
      }
    }
  }
  catch {
    // corrupt meta — fall through to re-copy
  }
  return null
}

function readPreviousSyncedAt(outputPath: string): string | undefined {
  const existingMetaPath = join(outputPath, 'meta.json')
  if (!existsSync(existingMetaPath))
    return undefined

  try {
    const old = JSON.parse(readFileSync(existingMetaPath, 'utf-8')) as SkillMeta
    if (old.type === 'synced')
      return old.syncedAt
  }
  catch {
    // ignore corrupt meta
  }
  return undefined
}

function readPreviousHash(outputPath: string): string | undefined {
  const existingMetaPath = join(outputPath, 'meta.json')
  if (!existsSync(existingMetaPath))
    return undefined

  try {
    const old = JSON.parse(readFileSync(existingMetaPath, 'utf-8')) as SkillMeta
    if (old.type === 'synced')
      return old.contentHash
  }
  catch {
    // ignore corrupt meta
  }
  return undefined
}

function copySkilldirectory(sourcePath: string, outputPath: string, upstreamDir: string): void {
  if (existsSync(outputPath))
    rmSync(outputPath, { recursive: true })
  mkdirSync(outputPath, { recursive: true })
  cpSync(sourcePath, outputPath, { recursive: true })

  copyLicenseFile(upstreamDir, outputPath)
}

function copyLicenseFile(upstreamDir: string, outputPath: string): void {
  for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
    const licenseSrc = join(upstreamDir, name)
    if (existsSync(licenseSrc)) {
      cpSync(licenseSrc, join(outputPath, 'LICENSE.md'))
      break
    }
  }
}
