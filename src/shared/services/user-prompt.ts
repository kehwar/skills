import * as p from '@clack/prompts'
import { Data, Effect } from 'effect'

export class PromptError extends Data.TaggedError('PromptError')<{
  message: string
}> {}

export class UserPromptService extends Effect.Service<UserPromptService>()(
  'shared/UserPromptService',
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

      multiSelect: (message: string, options: Array<{ label: string, value: string, hint?: string }>, initialValues?: string[]) =>
        Effect.promise(async () => {
          const choices = await p.multiselect({
            message,
            options: options.map(opt => ({
              label: opt.label,
              value: opt.value,
              hint: opt.hint,
            })),
            initialValues,
          })
          if (p.isCancel(choices)) {
            throw new PromptError({ message: 'User cancelled' })
          }
          return choices
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

type UserPromptServiceConfig = ConstructorParameters<typeof UserPromptService>[0]

export function createMockUserPromptService(
  overrides?: Partial<UserPromptServiceConfig>,
): UserPromptService {
  const defaults: UserPromptServiceConfig = {
    selectFromList: (_message: string, options: Array<{ label: string, value: string }>) =>
      Effect.sync(() => options[0]?.value ?? ''),
    multiSelect: (_message: string, options: Array<{ label: string, value: string, hint?: string }>, initialValues?: string[]) =>
      Effect.sync(() => initialValues ?? []),
    confirm: (_message: string) =>
      Effect.sync(() => true),
    prompt: (_message: string) =>
      Effect.sync(() => 'custom-name'),
  }
  return new UserPromptService({ ...defaults, ...overrides })
}
