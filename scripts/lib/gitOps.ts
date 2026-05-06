import type { Result } from '../types.ts'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

interface ExecOpts {
  cwd?: string
  /** If true, inherit stdio and return empty string. */
  inherit?: boolean
}

/**
 * Execute a shell command safely using spawn (no shell interpretation).
 * Always returns a Result; never throws.
 * - { ok: true, data: output } on success
 * - { ok: false, error } on failure
 */
export function exec(cmd: string, opts?: ExecOpts): Result<string> {
  const cwd = opts?.cwd
  try {
    // Parse command and arguments: split on first space to separate command from args
    const parts = cmd.split(/\s+/)
    const command = parts[0]!
    const args = parts.slice(1)

    const result = spawnSync(command, args, {
      cwd,
      stdio: opts?.inherit ? 'inherit' : ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    })

    if (result.error)
      return { ok: false, error: result.error.message }

    if (result.status !== 0) {
      const stderr = result.stderr || result.stdout || 'Command failed'
      return { ok: false, error: stderr.trim() }
    }

    const output = result.stdout?.trim() || ''
    return { ok: true, data: output }
  }
  catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    return { ok: false, error }
  }
}

/**
 * Get the current HEAD commit SHA of a git repository.
 * Returns null if not a git directory or command fails.
 */
export function getGitSha(dir: string): string | null {
  const result = exec('git rev-parse HEAD', { cwd: dir })
  return result.ok ? result.data : null
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
