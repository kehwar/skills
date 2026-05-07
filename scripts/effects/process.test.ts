import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { cwd, environment, requestExit } from './process.js'

describe('process.cwd', () => {
  it('should return current working directory', () => {
    const effect = cwd()
    const result = Effect.runSync(effect)

    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
    expect(result).toBe(process.cwd())
  })
})

describe('process.env', () => {
  it('should return environment variable if set', () => {
    // NODE_ENV is typically set
    const effect = environment('NODE_ENV')
    const result = Effect.runSync(effect)

    // Result might be undefined in some test environments
    if (result !== undefined) {
      expect(typeof result).toBe('string')
    }
  })

  it('should return undefined for non-existent variable', () => {
    const uniqueVariableName = `NON_EXISTENT_VAR_${Date.now()}`
    const effect = environment(uniqueVariableName)
    const result = Effect.runSync(effect)

    expect(result).toBeUndefined()
  })

  it('should read PATH environment variable', () => {
    const effect = environment('PATH')
    const result = Effect.runSync(effect)

    // PATH should exist on most systems
    expect(typeof result).toBe('string')
    expect(result!.length).toBeGreaterThan(0)
  })
})

// Note: We don't test requestExit() directly as it throws an ExitCode error.
// requestExit() can be tested in integration tests or by catching the error.
describe('process.requestExit', () => {
  it('should export requestExit function', () => {
    expect(typeof requestExit).toBe('function')
  })
})
