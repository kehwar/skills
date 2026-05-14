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

const DEFAULT_BRANCH_FALLBACK = 'main'

async function resolveRemoteUrl(git: ReturnType<typeof simpleGit>): Promise<string> {
  const raw = await git.raw(['remote', 'get-url', 'origin'])
  return raw.trim()
}

async function doDetectDefaultBranch(git: ReturnType<typeof simpleGit>, url: string): Promise<string> {
  const remoteReferences = await git.listRemote(['--symref', url])
  const regex = /^ref:\s+refs\/heads\/(\S+)/m
  const match = regex.exec(remoteReferences)
  return match?.[1] ?? DEFAULT_BRANCH_FALLBACK
}

export class GitService extends Effect.Service<GitService>()('upstream/GitService', {
  effect: Effect.sync(() => ({
    addSubmodule: (root: string, upstreamKey: string, url: string, branch?: string) =>
      Effect.tryPromise({
        try: async () => {
          const submodulePath = path.join('upstream', upstreamKey)
          const git = simpleGit(root)

          let submoduleExists = false
          try {
            const gitmodulesContent = await git.raw(['config', '-f', '.gitmodules', `submodule.${submodulePath}.path`])
            submoduleExists = !!gitmodulesContent.trim()
          }
          catch {
            submoduleExists = false
          }

          if (!submoduleExists) {
            await git.subModule(['add', '--depth', '1', url, submodulePath])
          }

          if (branch !== undefined && branch.length > 0) {
            await git.raw(['config', '-f', '.gitmodules', `submodule.${submodulePath}.branch`, branch])
          }
        },
        catch: (error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)

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

          return new SubmoduleCloneFailed({
            url,
            message: `Failed to add submodule: ${message}`,
          })
        },
      }),
    detectDefaultBranch: (url: string) =>
      Effect.tryPromise({
        try: async () => {
          const git = simpleGit()
          return doDetectDefaultBranch(git, url)
        },
        catch: (error: unknown) => new Error(String(error)),
      }).pipe(
        Effect.catchAll(() => Effect.succeed(DEFAULT_BRANCH_FALLBACK)),
      ),
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

          const remotes = await git.getRemotes()
          if (remotes.length === 0) {
            throw new Error('No remotes found in repository')
          }
          const originRemote = remotes.find(r => r.name === 'origin')
          const firstRemoteName = remotes[0]?.name
          const remoteName = originRemote?.name ?? firstRemoteName ?? 'origin'

          try {
            await git.raw(['fetch', remoteName, `+refs/heads/${branch}:refs/remotes/${remoteName}/${branch}`])
          }
          catch {
            try {
              await git.raw(['fetch', '--unshallow'])
            }
            catch (unshallowError: unknown) {
              const message = unshallowError instanceof Error ? unshallowError.message : String(unshallowError)
              if (!message.includes('not a shallow repository') && !message.includes('does not make sense')) {
                throw unshallowError
              }
            }
            await git.raw(['fetch', remoteName, `+refs/heads/${branch}:refs/remotes/${remoteName}/${branch}`])
          }

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
    updateSubmodule: (root: string, upstreamKey: string, branch?: string) =>
      Effect.tryPromise({
        try: async () => {
          const submoduleRelativePath = path.join('upstream', upstreamKey)
          const fullPath = path.join(root, submoduleRelativePath)
          const parentGit = simpleGit(root)
          const subGit = simpleGit(fullPath)

          let effectiveBranch = branch
          if (effectiveBranch === undefined || effectiveBranch.length === 0) {
            const url = await resolveRemoteUrl(subGit)
            effectiveBranch = await doDetectDefaultBranch(simpleGit(), url)
            await parentGit.raw(['config', '-f', '.gitmodules', `submodule.${submoduleRelativePath}.branch`, effectiveBranch])
          }

          await parentGit.raw(['submodule', 'update', '--remote', '--checkout', '--depth', '1', '--', submoduleRelativePath])

          await subGit.checkout(['-B', effectiveBranch, `origin/${effectiveBranch}`])

          return effectiveBranch
        },
        catch: (error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          return new SubmoduleCloneFailed({
            url: upstreamKey,
            message: `Failed to update submodule: ${message}`,
          })
        },
      }),
    fetchSubmodule: (root: string, upstreamKey: string) =>
      Effect.tryPromise({
        try: async () => {
          const submodulePath = path.join('upstream', upstreamKey)
          const fullPath = path.join(root, submodulePath)
          const git = simpleGit(fullPath)
          await git.fetch()
        },
        catch: (error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          return new SubmoduleCloneFailed({
            url: upstreamKey,
            message: `Failed to fetch submodule: ${message}`,
          })
        },
      }),
    countCommitsBehind: (root: string, upstreamKey: string) =>
      Effect.tryPromise({
        try: async () => {
          const submodulePath = path.join('upstream', upstreamKey)
          const fullPath = path.join(root, submodulePath)
          const git = simpleGit(fullPath)
          const count = await git.raw(['rev-list', '--count', 'HEAD..@{u}'])
          return Number.parseInt(count.trim(), 10)
        },
        catch: (error: unknown) => new Error(String(error)),
      }).pipe(
        Effect.catchAll(() => Effect.succeed(-1)),
      ),
    setSubmoduleBranch: (root: string, upstreamKey: string, branch: string) =>
      Effect.tryPromise({
        try: async () => {
          const submodulePath = path.join('upstream', upstreamKey)
          const git = simpleGit(root)
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
