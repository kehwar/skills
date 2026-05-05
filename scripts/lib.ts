import type { Dirent } from 'node:fs'
import type { Meta, SkillMeta, UpstreamMeta } from './types.ts'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

// ── exec (overloaded) ─────────────────────────────────────────────────────────

interface ExecOpts { cwd?: string }

export function exec(cmd: string, opts: ExecOpts & { inherit: true }): void
export function exec(cmd: string, opts: ExecOpts & { safe: true }): string | null
export function exec(cmd: string, opts?: ExecOpts): string
export function exec(
  cmd: string,
  opts?: ExecOpts & { inherit?: boolean, safe?: boolean },
): string | void | null {
  const cwd = opts?.cwd
  if (opts?.inherit) {
    execSync(cmd, { cwd, stdio: 'inherit' })
    return
  }
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  }
  catch (e) {
    if (opts?.safe)
      return null
    throw e
  }
}

// ── submoduleExists ───────────────────────────────────────────────────────────

export function submoduleExists(root: string, submodulePath: string): boolean {
  const gitmodulesPath = join(root, '.gitmodules')
  if (!existsSync(gitmodulesPath))
    return false
  return readFileSync(gitmodulesPath, 'utf-8').includes(`path = ${submodulePath}`)
}

// ── getGitSha ─────────────────────────────────────────────────────────────────

export function getGitSha(dir: string): string | null {
  return exec('git rev-parse HEAD', { cwd: dir, safe: true })
}

// ── findSkillDirs ─────────────────────────────────────────────────────────────

/** Recursively find directories containing a SKILL.md, relative to `dir`. */
export function findSkillDirs(dir: string): string[] {
  const results: string[] = []
  function walk(current: string): void {
    let entries: Dirent[]
    try { entries = readdirSync(current, { withFileTypes: true }) }
    catch { return }
    if (entries.some(e => e.isFile() && e.name === 'SKILL.md')) {
      results.push(relative(dir, current) || '.')
      return
    }
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.'))
        walk(join(current, entry.name))
    }
  }
  walk(dir)
  return results
}

// ── hashSkillDir ──────────────────────────────────────────────────────────────

/** Hash all file contents in a directory (sorted by relative path). 12-char prefix. */
export function hashSkillDir(dir: string): string {
  const h = createHash('sha256')
  const entries: string[] = []
  function collect(current: string): void {
    let dirents: Dirent[]
    try { dirents = readdirSync(current, { withFileTypes: true }) }
    catch { return }
    for (const d of dirents) {
      const full = join(current, d.name)
      if (d.isDirectory() && !d.name.startsWith('.'))
        collect(full)
      else if (d.isFile())
        entries.push(relative(dir, full))
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

// ── saveMeta ──────────────────────────────────────────────────────────────────

/** Serialise meta.json with sorted upstream keys and a trailing newline. */
export function saveMeta(meta: Meta, root: string): void {
  const metaPath = join(root, 'meta.json')
  meta.upstreams = Object.fromEntries(
    Object.entries(meta.upstreams).sort(([a], [b]) => a.localeCompare(b)),
  )
  writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`)
}

// ── copySkillsFromUpstream ────────────────────────────────────────────────────

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
): void {
  if (!config.skills)
    return

  const sha = getGitSha(upstreamDir)
  const date = new Date().toISOString().split('T')[0]

  for (const [skillPath, outputName] of Object.entries(config.skills)) {
    const sourcePath = skillPath === '.' ? upstreamDir : join(upstreamDir, skillPath)
    const outputPath = join(root, 'skills', outputName)

    if (!existsSync(sourcePath)) {
      log(`SKIP ${upstreamName}/${skillPath} — path not found in submodule`)
      continue
    }

    if (existsSync(outputPath))
      rmSync(outputPath, { recursive: true })
    mkdirSync(outputPath, { recursive: true })
    cpSync(sourcePath, outputPath, { recursive: true })

    for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
      const licenseSrc = join(upstreamDir, name)
      if (existsSync(licenseSrc)) { cpSync(licenseSrc, join(outputPath, 'LICENSE.md')); break }
    }

    const contentHash = hashSkillDir(sourcePath)
    const skillMeta: SkillMeta = {
      type: 'synced',
      upstream: upstreamName,
      sourceUrl: config.url,
      ...(config.branch ? { branch: config.branch } : {}),
      skillPath,
      gitSha: sha ?? 'unknown',
      contentHash,
      syncedAt: date,
    }
    writeFileSync(join(outputPath, 'meta.json'), `${JSON.stringify(skillMeta, null, 2)}\n`)
    log(`synced  ${upstreamName}/${skillPath} → skills/${outputName}`)
  }
}
