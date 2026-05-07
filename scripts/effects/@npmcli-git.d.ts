declare module '@npmcli/git' {
  /**
   * Spawn a git command with arguments
   * @param arguments_ - Array of git arguments
   * @param options - Options object
   * @returns Promise that resolves with command output
   */
  export function spawn(arguments_: string[], options?: Record<string, unknown>): Promise<void>
}
