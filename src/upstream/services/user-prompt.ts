import * as p from '@clack/prompts'
import { Data, Effect } from 'effect'

export class PromptError extends Data.TaggedError('PromptError')<{
  message: string
}> {}

export class UserPromptService extends Effect.Service<UserPromptService>()(
  'upstream/UserPromptService',
  {
    effect: Effect.sync(() => ({
      selectFromList: (message: string, options: Array<{ label: string, value: string }>) =>
        Effect.promise(async () => {
          const choice = await p.select({ message, options })
          if (p.isCancel(choice)) {
            throw new PromptError({ message: 'User cancelled' })
          }
          return choice
        }).pipe(
          Effect.catchAll((error: unknown) =>
            Effect.fail(
              error instanceof PromptError
                ? error
                : new PromptError({ message: String(error) }),
            ),
          ),
        ),

      confirm: (message: string) =>
        Effect.promise(async () => {
          const choice = await p.confirm({ message })
          if (p.isCancel(choice)) {
            throw new PromptError({ message: 'User cancelled' })
          }
          return choice
        }).pipe(
          Effect.catchAll((error: unknown) =>
            Effect.fail(
              error instanceof PromptError
                ? error
                : new PromptError({ message: String(error) }),
            ),
          ),
        ),

      prompt: (message: string) =>
        Effect.promise(async () => {
          const answer = await p.text({ message })
          if (p.isCancel(answer)) {
            throw new PromptError({ message: 'User cancelled' })
          }
          return answer
        }).pipe(
          Effect.catchAll((error: unknown) =>
            Effect.fail(
              error instanceof PromptError
                ? error
                : new PromptError({ message: String(error) }),
            ),
          ),
        ),
    })),
  },
) {}
