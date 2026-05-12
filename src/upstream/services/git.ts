import path from 'node:path'
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

export class InvalidBranch extends Data.TaggedError('InvalidBranch')<{
  url: string
  branch: string
  message: string
}> {}

export class GitService extends Effect.Service<GitService>()('upstream/GitService', {
  effect: Effect.sync(() => ({
    addSubmodule: (root: string, upstreamKey: string, url: string, branch?: string) =>
      Effect.tryPromise({
        try: async () => {
          const submodulePath = path.join('upstream', upstreamKey)
          const git = simpleGit(root)

          // Check if submodule already exists
          let submoduleExists = false
          try {
            const gitmodulesContent = await git.raw(['config', '-f', '.gitmodules', `submodule.${submodulePath}.path`])
            submoduleExists = !!gitmodulesContent.trim()
          }
          catch {
            // Submodule doesn't exist if config read fails
            submoduleExists = false
          }

          if (!submoduleExists) {
            // Clone the submodule with shallow depth (--depth 1) for performance
            await git.subModule(['add', '--depth', '1', url, submodulePath])
          }

          // Configure branch in .gitmodules if specified
          // Git config key format: submodule.<path>.branch (no quotes needed for paths with slashes)
          if (branch !== undefined && branch.length > 0) {
            await git.raw(['config', '-f', '.gitmodules', `submodule.${submodulePath}.branch`, branch])
          }
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
    validateBranchExists: (url: string, branch: string) =>
      Effect.tryPromise({
        try: async () => {
          const git = simpleGit()
          const remoteReferences = await git.listRemote(['--heads', url])
          const branchReference = `refs/heads/${branch}`
          if (!remoteReferences.includes(branchReference)) {
            throw new Error(`Branch '${branch}' not found`)
          }
        },
        catch: (error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          return new InvalidBranch({
            url,
            branch,
            message: `Failed to validate branch: ${message}`,
          })
        },
      }),
    checkoutBranch: (root: string, submodulePath: string, branch: string) =>
      Effect.tryPromise({
        try: async () => {
          const fullPath = path.join(root, submodulePath)
          const git = simpleGit(fullPath)

          // Discover the default remote name (typically "origin")
          const remotes = await git.getRemotes()
          if (remotes.length === 0) {
            throw new Error('No remotes found in repository')
          }
          // Use the remote named "origin" if available, otherwise use the first remote
          const originRemote = remotes.find(r => r.name === 'origin')
          const firstRemoteName = remotes[0]?.name
          const remoteName = originRemote?.name ?? firstRemoteName ?? 'origin'

          // For shallow clones, we need to fetch the branch with explicit refspec
          // to properly set up the remote tracking branch
          try {
            // Try to fetch the specific branch with explicit refspec
            // Using raw git command for complex refspec that high-level API doesn't support well
            await git.raw(['fetch', remoteName, `+refs/heads/${branch}:refs/remotes/${remoteName}/${branch}`])
          }
          catch {
            // If fetch fails, try unshallowing first
            try {
              // Unshallow the repository to get full history
              await git.raw(['fetch', '--unshallow'])
            }
            catch (unshallowError: unknown) {
              const message = unshallowError instanceof Error ? unshallowError.message : String(unshallowError)
              // Ignore "not shallow" errors
              if (!message.includes('not a shallow repository') && !message.includes('does not make sense')) {
                throw unshallowError
              }
            }
            // Then try the fetch again with explicit refspec
            await git.raw(['fetch', remoteName, `+refs/heads/${branch}:refs/remotes/${remoteName}/${branch}`])
          }

          // Create and checkout the branch from the remote tracking branch
          await git.checkout(['-B', branch, `${remoteName}/${branch}`])
        },
        catch: (error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          return new SubmoduleCloneFailed({
            url: submodulePath,
            message: `Failed to checkout branch '${branch}': ${message}`,
          })
        },
      }),
    setSubmoduleBranch: (root: string, upstreamKey: string, branch: string) =>
      Effect.tryPromise({
        try: async () => {
          const submodulePath = path.join('upstream', upstreamKey)
          const git = simpleGit(root)
          // Update or set the branch configuration in .gitmodules
          // Git config key format: submodule.<path>.branch (no quotes needed for paths with slashes)
          await git.raw(['config', '-f', '.gitmodules', `submodule.${submodulePath}.branch`, branch])
        },
        catch: (error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          return new SubmoduleCloneFailed({
            url: upstreamKey,
            message: `Failed to set branch in .gitmodules: ${message}`,
          })
        },
      }),
  })),
}) {}
