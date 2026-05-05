import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

interface ExecOpts {
  cwd?: string
}

/**
 * Execute a shell command.
 * Returns trimmed stdout.
 */
export function exec(cmd: string, opts: ExecOpts & { inherit: true }): void
/**
 * Execute a shell command safely.
 * Returns trimmed stdout or null on failure (doesn't throw).
 */
export function exec(cmd: string, opts: ExecOpts & { safe: true }): string | null
/**
 * Execute a shell command.
 * Returns trimmed stdout. Throws on failure.
 */
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

/**
 * Get the current HEAD commit SHA of a git repository.
 * Returns null if not a git directory.
 */
export function getGitSha(dir: string): string | null {
  return exec('git rev-parse HEAD', { cwd: dir, safe: true })
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
