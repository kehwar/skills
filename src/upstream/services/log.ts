import * as p from '@clack/prompts'
import { Effect } from 'effect'

export class LogService extends Effect.Service<LogService>()('upstream/LogService', {
  effect: Effect.sync(() => {
    function createStopSpinnerEffect(s: ReturnType<typeof p.spinner>) {
      return (stopText: string) =>
        Effect.sync(() => {
          s.stop(stopText)
        })
    }

    return {
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
    }
  }),
}) {}
