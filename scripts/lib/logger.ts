/**
 * Operation logger: centralized logging with simple severity tiers.
 * Streams to console immediately; accumulates summary at end.
 */

export type Severity = 'info' | 'warn' | 'error'

export interface LogEntry {
  severity: Severity
  message: string
  timestamp: Date
}

export interface OperationResult {
  totalOps: number
  skipped: number
  failed: number
  summary: string
}

class Logger {
  private entries: LogEntry[] = []

  log(severity: Severity, message: string): void {
    const entry: LogEntry = {
      severity,
      message,
      timestamp: new Date(),
    }
    this.entries.push(entry)

    // Stream to console immediately
    const prefix = severity === 'info' ? '' : `${severity.toUpperCase()}: `
    console.log(`${prefix}${message}`)
  }

  info(message: string): void {
    this.log('info', message)
  }

  warn(message: string): void {
    this.log('warn', message)
  }

  error(message: string): void {
    this.log('error', message)
  }

  /**
   * Generate operation summary from accumulated logs.
   * Counts by severity.
   */
  summary(totalOps: number): OperationResult {
    const skipped = this.entries.filter(e => e.message.includes('SKIP')).length
    const failed = this.entries.filter(e => e.severity === 'error').length

    const summaryText = failed > 0
      ? `${totalOps} operations: ${failed} failed, ${skipped} skipped`
      : skipped > 0
        ? `${totalOps} operations: ${skipped} skipped, rest succeeded`
        : `${totalOps} operations: all succeeded`

    return {
      totalOps,
      skipped,
      failed,
      summary: summaryText,
    }
  }

  /**
   * Clear entries (useful for testing or resetting state).
   */
  clear(): void {
    this.entries = []
  }

  /**
   * Get all logged entries (for testing or inspection).
   */
  getEntries(): LogEntry[] {
    return [...this.entries]
  }
}

// Export singleton
export const logger = new Logger()
