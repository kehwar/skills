declare module '@npmcli/git' {
  /**
   * Execute a git command with arguments
   * @param arguments_ - Array of git arguments
   * @param options - Options object
   * @returns Promise that resolves with command result
   */
  function git(arguments_: string[], options?: Record<string, unknown>): Promise<any>
  export = git
}
