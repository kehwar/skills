import type { DirectoryReadError, FileReadError, InvalidBranch, MetaJson, SubmoduleAuthFailed, SubmoduleCloneFailed } from '../shared/services/index.js'
import type { OutputName } from '../shared/services/meta-file.js'
import type { SkillPath } from '../shared/services/skill-discovery.js'
import type { SkillHash } from '../shared/services/skill-hash.js'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { Data, Effect } from 'effect'
import { GitService, LogService, MetaFileService, SkillDiscoveryService, SkillHashService, UserPromptService } from '../shared/services/index.js'
import { buildUpstreamEntry } from '../shared/services/meta-file.js'

export class InvalidUrl extends Data.TaggedError('InvalidUrl')<{ message: string }> {}

export interface UpstreamKeyOptions {
  default: string
  alternatives: string[]
  needsUserInput: boolean
}

export function parseGitHubUrl(url: string): { owner: string, repo: string, normalizedUrl: string } | undefined {
  const normalized = url.endsWith('.git') ? url.slice(0, -4) : url

  const httpsRegex = /https:\/\/github\.com\/([^/]+)\/(.+)$/ // Matches: https://github.com/owner/repo
  let match = httpsRegex.exec(normalized)
  if (match && match[1] !== undefined && match[2] !== undefined) {
    return { owner: match[1], repo: match[2], normalizedUrl: normalized }
  }

  const sshRegex = /git@github\.com:([^/]+)\/(.+)$/ // Matches: git@github.com:owner/repo
  match = sshRegex.exec(normalized)
  if (match && match[1] !== undefined && match[2] !== undefined) {
    return { owner: match[1], repo: match[2], normalizedUrl: `https://github.com/${match[1]}/${match[2]}` }
  }

  const plainRegex = /github\.com\/([^/]+)\/(.+)$/ // Matches: github.com/owner/repo (no protocol)
  match = plainRegex.exec(normalized)
  if (match && match[1] !== undefined && match[2] !== undefined) {
    return { owner: match[1], repo: match[2], normalizedUrl: `https://${normalized}` }
  }

  const bareRegex = /^([^/]+)\/([^/]+)$/ // Matches: owner/repo (bare shorthand)
  match = bareRegex.exec(normalized)
  if (match && match[1] !== undefined && match[2] !== undefined) {
    return { owner: match[1], repo: match[2], normalizedUrl: `https://github.com/${match[1]}/${match[2]}` }
  }

  return undefined
}

export function resolveUpstreamKey(parsed: { owner: string, repo: string, normalizedUrl?: string } | undefined): UpstreamKeyOptions {
  if (!parsed) {
    return {
      default: 'upstream-unknown',
      alternatives: [],
      needsUserInput: false,
    }
  }

  const { owner, repo } = parsed
  const repoCandidate = repo.toLowerCase().replaceAll(/[^a-z0-9-]/g, '-')
  const ownerCandidate = owner.toLowerCase().replaceAll(/[^a-z0-9-]/g, '-')

  if (repoCandidate === 'skills') {
    return {
      default: ownerCandidate,
      alternatives: [repoCandidate],
      needsUserInput: true,
    }
  }

  if (repoCandidate === ownerCandidate) {
    return {
      default: repoCandidate,
      alternatives: [],
      needsUserInput: false,
    }
  }

  return {
    default: repoCandidate,
    alternatives: [ownerCandidate],
    needsUserInput: true,
  }
}

export class UpstreamConflict extends Data.TaggedError('UpstreamConflict')<{
  key: string
  existingUrl: string
}> {}

export class MetaReadError extends Data.TaggedError('MetaReadError')<{ message: string }> {}

export class MetaParseError extends Data.TaggedError('MetaParseError')<{ message: string }> {}

export class MetaWriteError extends Data.TaggedError('MetaWriteError')<{ message: string }> {}

export type UpstreamAddError
  = | InvalidUrl
    | UpstreamConflict
    | InvalidBranch
    | SubmoduleCloneFailed
    | SubmoduleAuthFailed
    | DirectoryReadError
    | FileReadError
    | MetaReadError
    | MetaParseError
    | MetaWriteError

export interface UpstreamAddInput {
  root: string
  url: string
  upstreamKey?: string
  branch?: string
  selectedSkills: Record<SkillPath, OutputName>
}

export interface Skill {
  path: SkillPath
  hash: SkillHash
}

export interface UpstreamAddOutput {
  isNew: boolean
  upstreamKey: string
  discoveredSkills: Skill[]
  syncResult: {
    synced: Array<{ skillPath: SkillPath, outputName: OutputName }>
    skipped: Array<{ skillPath: SkillPath, reason: string }>
    errors: Array<{ skillPath: SkillPath, error: string }>
  }
}

export function normalizeGitHubUrl(url: string): string {
  const withoutGit = url.endsWith('.git') ? url.slice(0, -4) : url
  if (withoutGit.startsWith('git@github.com:')) {
    return `https://github.com/${withoutGit.slice('git@github.com:'.length)}`
  }
  if (withoutGit.startsWith('github.com/')) {
    return `https://${withoutGit}`
  }
  return withoutGit
}

function resolveUpstreamKeyFromInput(
  input: UpstreamAddInput,
  metaJson: MetaJson,
): Effect.Effect<string, unknown, UserPromptService | LogService> {
  return Effect.gen(function* () {
    const userPromptService = yield* UserPromptService
    const logService = yield* LogService

    if (input.upstreamKey !== undefined) {
      return input.upstreamKey
    }

    const parsed = parseGitHubUrl(input.url)
    if (!parsed) {
      return 'upstream-unknown'
    }

    const keyOptions = resolveUpstreamKey(parsed)
    const allCandidates = [keyOptions.default, ...keyOptions.alternatives]
    const availableCandidates = allCandidates.filter(c => !(c in metaJson.upstreams))
    const takenCandidates = allCandidates.filter(c => c in metaJson.upstreams)

    if (takenCandidates.length > 0) {
      yield* logService.info(`Upstream names already in use: ${takenCandidates.join(', ')}`)
    }

    if (availableCandidates.length === 0) {
      return yield* userPromptService.prompt('Enter upstream name:')
    }

    const promptOptions = [
      ...availableCandidates.map(c => ({ label: c, value: c })),
      { label: 'Other (enter custom name)', value: '__other__' },
    ]
    const choice = yield* userPromptService.selectFromList('Upstream name', promptOptions)
    return choice === '__other__'
      ? yield* userPromptService.prompt('Enter upstream name:')
      : choice
  })
}

function validateUpstreamInput(
  url: string,
  upstreamKey: string,
  metaJson: MetaJson,
): Effect.Effect<void, UpstreamConflict> {
  return Effect.gen(function* () {
    const existing = metaJson.upstreams[upstreamKey]
    if (existing !== undefined && existing.url !== url) {
      return yield* Effect.fail(
        new UpstreamConflict({
          key: upstreamKey,
          existingUrl: existing.url,
        }),
      )
    }
  })
}

export function setupSubmodule(
  root: string,
  upstreamKey: string,
  url: string,
  branch: string | undefined,
): Effect.Effect<string, SubmoduleCloneFailed | SubmoduleAuthFailed | InvalidBranch, GitService | LogService> {
  return Effect.gen(function* () {
    const gitService = yield* GitService
    const logService = yield* LogService

    let effectiveBranch = branch
    if (effectiveBranch === undefined || effectiveBranch.length === 0) {
      effectiveBranch = yield* gitService.detectDefaultBranch(url)
      yield* logService.info(`Auto-detected branch: ${effectiveBranch}`)
    }
    else {
      yield* logService.info(`Validating branch: ${effectiveBranch}`)
      yield* gitService.validateBranchExists(url, effectiveBranch)
    }

    const submodulePath = path.join(root, 'upstream', upstreamKey)
    const checkExists = Effect.tryPromise({
      try: async () => fs.stat(submodulePath).then(() => true).catch(() => false),
      catch: () => new Error('Failed to check submodule existence'),
    }).pipe(Effect.orDie)

    const submoduleExists = yield* checkExists

    if (submoduleExists) {
      const isGitRepo = yield* Effect.tryPromise({
        try: async () => {
          const dotGit = path.join(submodulePath, '.git')
          const stat = await fs.stat(dotGit)
          return stat.isDirectory() || stat.isFile()
        },
        catch: (error: unknown) => new Error(String(error)),
      }).pipe(Effect.catchAll(() => Effect.succeed(false)))
      if (isGitRepo) {
        yield* logService.info(`Checking out branch: ${effectiveBranch}`)
        yield* gitService.checkoutBranch(root, path.join('upstream', upstreamKey), effectiveBranch)
        yield* gitService.setSubmoduleBranch(root, upstreamKey, effectiveBranch)
      }
    }
    else {
      yield* logService.info('Cloning submodule...')
      yield* gitService.addSubmodule(root, upstreamKey, url, effectiveBranch)
      yield* gitService.checkoutBranch(root, path.join('upstream', upstreamKey), effectiveBranch)
      yield* gitService.setSubmoduleBranch(root, upstreamKey, effectiveBranch)
    }

    return effectiveBranch
  })
}

export function discoverAndHashSkills(
  root: string,
  upstreamKey: string,
): Effect.Effect<Skill[], DirectoryReadError | FileReadError, SkillDiscoveryService | SkillHashService | LogService> {
  return Effect.gen(function* () {
    const skillDiscoveryService = yield* SkillDiscoveryService
    const skillHashService = yield* SkillHashService
    const logService = yield* LogService

    yield* logService.info('Discovering skills...')
    const upstreamDirectory = path.join(root, 'upstream', upstreamKey)
    const discoveredSkillPaths = yield* skillDiscoveryService.discoverSkillsInDirectory(upstreamDirectory)

    const discoveredSkills: Skill[] = []
    for (const skillPath of discoveredSkillPaths) {
      const skillFullPath = path.join(upstreamDirectory, skillPath)
      const hash = yield* skillHashService.hashSkillDirectory(skillFullPath)
      discoveredSkills.push({ path: skillPath, hash })
    }

    return discoveredSkills
  })
}

function updateMetaFile(
  metaPath: string,
  metaJson: MetaJson,
  upstreamKey: string,
  url: string,
  branch: string | undefined,
  selectedSkills: Record<SkillPath, OutputName>,
  discoveredSkills: Skill[],
): Effect.Effect<void, MetaWriteError, MetaFileService> {
  return Effect.gen(function* () {
    const metaFileService = yield* MetaFileService

    const availableMap: Record<SkillPath, SkillHash> = {}
    for (const skill of discoveredSkills) {
      availableMap[skill.path] = skill.hash
    }

    metaJson.upstreams[upstreamKey] = buildUpstreamEntry(url, branch, selectedSkills, availableMap)

    yield* metaFileService.write(metaPath, metaJson).pipe(
      Effect.catchTag('MetaFileWriteError', () =>
        Effect.fail(new MetaWriteError({ message: `Failed to write meta.json at ${metaPath}` }))),
    )
  })
}

export function upstreamAdd(input: UpstreamAddInput): Effect.Effect<UpstreamAddOutput, UpstreamAddError> {
  return Effect.gen(function* () {
    const metaFileService = yield* MetaFileService
    const logService = yield* LogService

    const parsed = parseGitHubUrl(input.url)
    if (!parsed) {
      return yield* Effect.fail(new InvalidUrl({ message: 'URL must be a valid GitHub URL' }))
    }

    const metaPath = path.join(input.root, 'meta.json')
    const metaData = yield* metaFileService.read(metaPath).pipe(
      Effect.catchAll(error =>
        logService.warn(`Failed to read meta.json: ${error._tag}`).pipe(
          Effect.andThen(Effect.succeed({ upstreams: {} })),
        ),
      ),
    )
    const metaJson: MetaJson = { upstreams: {}, ...metaData }

    const upstreamKey = yield* resolveUpstreamKeyFromInput(input, metaJson).pipe(
      Effect.catchAll(() => Effect.succeed('upstream-unknown')),
    )

    const url = parsed.normalizedUrl
    yield* validateUpstreamInput(url, upstreamKey, metaJson)

    yield* logService.info(`Fetching upstream: ${upstreamKey}`)
    const effectiveBranch = yield* setupSubmodule(input.root, upstreamKey, url, input.branch)

    const discoveredSkills = yield* discoverAndHashSkills(input.root, upstreamKey)

    const isNew = !(upstreamKey in metaJson.upstreams)
    yield* updateMetaFile(metaPath, metaJson, upstreamKey, url, effectiveBranch, input.selectedSkills, discoveredSkills)

    return {
      isNew,
      upstreamKey,
      discoveredSkills,
      syncResult: {
        synced: Object.entries(input.selectedSkills).map(([skillPath, outputName]) => ({
          skillPath,
          outputName,
        })),
        skipped: [],
        errors: [],
      },
    }
  }) as unknown as Effect.Effect<UpstreamAddOutput, UpstreamAddError>
}
