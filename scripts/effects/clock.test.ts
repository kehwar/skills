import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { iso8601, now } from './clock.js'

describe('clock.now', () => {
  it('should return current date', () => {
    const before = new Date()
    const effect = now()
    const result = Effect.runSync(effect)
    const after = new Date()

    expect(result).toBeInstanceOf(Date)
    expect(result.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(result.getTime()).toBeLessThanOrEqual(after.getTime())
  })
})

describe('clock.iso8601', () => {
  it('should return ISO 8601 formatted timestamp', () => {
    const effect = iso8601()
    const result = Effect.runSync(effect)

    expect(typeof result).toBe('string')
    // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})
