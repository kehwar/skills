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

// ── normalizeUrl ─────────────────────────────────────────────────────────────

/** Expand `owner/repo` shorthand to a full GitHub HTTPS URL. Full URLs pass through unchanged. */
export function normalizeUrl(url: string): string {
  if (/^https?:\/\//.test(url) || url.startsWith('git@'))
    return url
  const parts = url.split('/')
  if (parts.length === 2)
    return `https://github.com/${url}`
  return url
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

// ── ensureSubmodule ───────────────────────────────────────────────────────────

/**
 * Add or update a git submodule at `submodulePath` inside `root`.
 * - Not registered: adds via `git submodule add`, then checks out the branch if given.
 * - Registered but directory missing: clones directly.
 * - Already exists: updates `.gitmodules` branch config, then fetches and checks out the branch.
 */
export function ensureSubmodule(
  root: string,
  submodulePath: string,
  url: string,
  branch?: string,
): void {
  const subDir = join(root, submodulePath)

  if (!submoduleExists(root, submodulePath)) {
    exec(
      `git submodule add --depth 1 ${url} ${submodulePath}`,
      { cwd: root, inherit: true },
    )
    if (branch) {
      exec(
        `git config -f .gitmodules submodule.${submodulePath}.branch ${branch}`,
        { cwd: root },
      )
      exec(
        `git fetch --depth 1 origin +refs/heads/${branch}:refs/remotes/origin/${branch}`,
        { cwd: subDir, inherit: true },
      )
      exec(`git checkout -B ${branch} FETCH_HEAD`, { cwd: subDir, inherit: true })
    }
  }
  else if (!existsSync(subDir)) {
    mkdirSync(subDir, { recursive: true })
    exec(
      `git clone --depth 1${branch ? ` -b ${branch}` : ''} ${url} ${subDir}`,
      { inherit: true },
    )
  }
  else {
    if (branch) {
      exec(
        `git config -f .gitmodules submodule.${submodulePath}.branch ${branch}`,
        { cwd: root },
      )
      exec(
        `git fetch --depth 1 origin +refs/heads/${branch}:refs/remotes/origin/${branch}`,
        { cwd: subDir, inherit: true },
      )
      exec(`git checkout -B ${branch} FETCH_HEAD`, { cwd: subDir, inherit: true })
    }
    else {
      exec(`git config -f .gitmodules --unset submodule.${submodulePath}.branch`, { cwd: root, safe: true })
      exec('git fetch --depth 1', { cwd: subDir, inherit: true })
      exec('git reset --hard FETCH_HEAD', { cwd: subDir, inherit: true })
    }
  }
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
      catch { /* corrupt meta — fall through to re-copy */ }
    }

    if (existsSync(outputPath))
      rmSync(outputPath, { recursive: true })
    mkdirSync(outputPath, { recursive: true })
    cpSync(sourcePath, outputPath, { recursive: true })

    for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
      const licenseSrc = join(upstreamDir, name)
      if (existsSync(licenseSrc)) { cpSync(licenseSrc, join(outputPath, 'LICENSE.md')); break }
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
