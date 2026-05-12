import * as path from 'node:path'
import { Data, Effect } from 'effect'

import { simpleGit } from 'simple-git'

export class SubmoduleCloneFailed extends Data.TaggedError('SubmoduleCloneFailed')<{
  url: string
  message: string
}> {}

export class SubmoduleAuthFailed extends Data.TaggedError('SubmoduleAuthFailed')<{
  url: string
  message: string
}> {}

export class GitService extends Effect.Service<GitService>()('upstream/GitService', {
  effect: Effect.sync(() => ({
    addSubmodule: (root: string, upstreamKey: string, url: string) =>
      Effect.tryPromise({
        try: async () => {
          const submodulePath = path.join('upstream', upstreamKey)
          const git = simpleGit(root)
          await git.submoduleAdd(url, submodulePath)
        },
        catch: (error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)

          // Distinguish auth failures (SSH key, credentials, permissions)
          if (
            message.includes('Permission denied')
            || message.includes('authentication')
            || message.includes('ssh')
          ) {
            return new SubmoduleAuthFailed({
              url,
              message: `Authentication failed when adding submodule: ${message}`,
            })
          }

          // All other failures (network, not found, invalid URL, etc.)
          return new SubmoduleCloneFailed({
            url,
            message: `Failed to add submodule: ${message}`,
          })
        },
      }),
  })),
}) {}
