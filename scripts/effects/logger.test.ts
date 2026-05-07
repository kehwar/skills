import { Effect } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { indent, log } from './logger.js'

describe('logger.log', () => {
  it('should log info messages', () => {
    const logSpy = vi.spyOn(console, 'log')

    const effect = log('info', 'Test message')
    Effect.runSync(effect)

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Test message'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[INFO]'))

    logSpy.mockRestore()
  })

  it('should log error messages to console.error', () => {
    const errorSpy = vi.spyOn(console, 'error')

    const effect = log('error', 'Error message')
    Effect.runSync(effect)

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Error message'))
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[ERROR]'))

    errorSpy.mockRestore()
  })

  it('should log warn messages to console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn')

    const effect = log('warn', 'Warning message')
    Effect.runSync(effect)

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Warning message'))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[WARN]'))

    warnSpy.mockRestore()
  })
})

describe('logger.indent', () => {
  it('should log message without indentation at level 0', () => {
    const logSpy = vi.spyOn(console, 'log')

    const effect = indent('Message', 0)
    Effect.runSync(effect)

    expect(logSpy).toHaveBeenCalledWith('Message')

    logSpy.mockRestore()
  })

  it('should indent message based on level', () => {
    const logSpy = vi.spyOn(console, 'log')

    const effect = indent('Message', 2)
    Effect.runSync(effect)

    expect(logSpy).toHaveBeenCalledWith('    Message')

    logSpy.mockRestore()
  })
})
