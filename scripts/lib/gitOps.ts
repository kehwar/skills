import type { ExecResult } from '../types.ts'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

interface ExecOpts {
  cwd?: string
  /** If true, inherit stdio and return void. */
  inherit?: boolean
}

/**
 * Execute a shell command safely.
 * Always returns a Result; never throws.
 * - { ok: true, output } on success
 * - { ok: false, error, code } on failure
 */
export function exec(cmd: string, opts?: ExecOpts): ExecResult {
  const cwd = opts?.cwd
  try {
    if (opts?.inherit) {
      execSync(cmd, { cwd, stdio: 'inherit' })
      return { ok: true, output: '' }
    }
    const output = execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    return { ok: true, output }
  }
  catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    const code = (e as any)?.status
    return { ok: false, error, code }
  }
}

/**
 * Get the current HEAD commit SHA of a git repository.
 * Returns null if not a git directory or command fails.
 */
export function getGitSha(dir: string): string | null {
  const result = exec('git rev-parse HEAD', { cwd: dir })
  return result.ok ? result.output : null
}

/**
 * Check if a git submodule path is registered in .gitmodules.
 */
export function submoduleExists(root: string, submodulePath: string): boolean {
  const gitmodulesPath = join(root, '.gitmodules')
  if (!existsSync(gitmodulesPath))
    return false
  return readFileSync(gitmodulesPath, 'utf-8').includes(`path = ${submodulePath}`)
}
