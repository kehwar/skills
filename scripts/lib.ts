import type { Dirent } from 'node:fs'
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
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
