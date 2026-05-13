import * as p from '@clack/prompts'
import { Effect } from 'effect'

function createStopSpinnerEffect(s: ReturnType<typeof p.spinner>) {
  return (stopText: string) =>
    Effect.sync(() => {
      s.stop(stopText)
    })
}

export class LogService extends Effect.Service<LogService>()('shared/LogService', {
  effect: Effect.sync(() => ({
    intro: (text: string) => Effect.sync(() => { p.intro(text) }),
    success: (text: string) => Effect.sync(() => { p.log.success(text) }),
    info: (text: string) => Effect.sync(() => { p.log.info(text) }),
    error: (text: string) => Effect.sync(() => { p.log.error(text) }),
    outro: (text: string) => Effect.sync(() => { p.outro(text) }),
    startSpinner: (text: string) =>
      Effect.sync(() => {
        const s = p.spinner()
        s.start(text)
        return {
          stop: createStopSpinnerEffect(s),
        }
      }),
  })),
}) {}

type LogServiceConfig = ConstructorParameters<typeof LogService>[0]

const noOpStopSpinner = (_stopText: string) => Effect.sync(() => {})

export function createMockLogService(overrides?: Partial<LogServiceConfig>): LogService {
  const defaults: LogServiceConfig = {
    intro: (_text: string) => Effect.sync(() => {}),
    success: (_text: string) => Effect.sync(() => {}),
    info: (_text: string) => Effect.sync(() => {}),
    error: (_text: string) => Effect.sync(() => {}),
    outro: (_text: string) => Effect.sync(() => {}),
    startSpinner: (_text: string) =>
      Effect.sync(() => ({
        stop: noOpStopSpinner,
      })),
  }
  return new LogService({ ...defaults, ...overrides })
}
