import type { Result } from '../types.ts'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

interface ExecOptions {
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
export function exec(cmd: string, options?: ExecOptions): Result<string> {
  const cwd = options?.cwd
  try {
    // Parse command and arguments: split on first space to separate command from arguments_
    const parts = cmd.split(/\s+/)
    const command = parts[0]!
    const arguments_ = parts.slice(1)

    const result = spawnSync(command, arguments_, {
      cwd,
      stdio: options?.inherit ? 'inherit' : ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
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
  catch (error_) {
    const error = error_ instanceof Error ? error_.message : String(error_)
    return { ok: false, error }
  }
}

/**
 * Get the current HEAD commit SHA of a git repository.
 * Returns undefined if not a git directory or command fails.
 */
export function getGitSha(directory: string): string | undefined {
  const result = exec('git rev-parse HEAD', { cwd: directory })
  return result.ok ? result.data : undefined
}

/**
 * Check if a git submodule path is registered in .gitmodules.
 */
export function submoduleExists(root: string, submodulePath: string): boolean {
  const gitmodulesPath = path.join(root, '.gitmodules')
  if (!existsSync(gitmodulesPath))
    return false
  return readFileSync(gitmodulesPath, 'utf8').includes(`path = ${submodulePath}`)
}
