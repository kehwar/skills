declare module '@npmcli/git' {
  /**
   * Execute a git command with arguments
   * @param arguments_ - Array of git arguments
   * @param options - Options object
   * @returns Promise that resolves with command result
   */
  interface GitSpawnResult {
    cmd: string
    args: string[]
    code: number
    signal: string | null
    stdout: string | globalThis.Buffer
    stderr: string | globalThis.Buffer
  }

  interface GitModule {
    clone: (url: string, directory: string, options?: Record<string, unknown>) => Promise<GitSpawnResult>
    revs: (options?: Record<string, unknown>) => Promise<Record<string, unknown>>
    spawn: (arguments_: string[], options?: Record<string, unknown>) => Promise<GitSpawnResult>
    is: (path: string) => Promise<boolean>
    find: (options?: Record<string, unknown>) => Promise<string>
    isClean: (options?: Record<string, unknown>) => Promise<boolean>
    errors: Record<string, unknown>
  }

  export = git as GitModule
}
