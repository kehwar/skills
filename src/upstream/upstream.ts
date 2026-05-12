import type { DirectoryReadError, FileReadError, SubmoduleAuthFailed, SubmoduleCloneFailed } from './services/index.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Data, Effect } from 'effect'
import { GitService, MetaFileService, SkillDiscoveryService, SkillHashService, UserPromptService } from './services/index.js'

export class InvalidUrl extends Data.TaggedError('InvalidUrl')<{ message: string }> {}

export interface UpstreamKeyOptions {
  default: string
  alternatives: string[]
  needsUserInput: boolean
}

export function parseGitHubUrl(url: string): { owner: string, repo: string, normalizedUrl: string } | null {
  const normalized = url.endsWith('.git') ? url.slice(0, -4) : url

  // https://github.com/owner/repo
  const httpsRegex = /https:\/\/github\.com\/([^/]+)\/(.+)$/
  let match = httpsRegex.exec(normalized)
  if (match) {
    return { owner: match[1], repo: match[2], normalizedUrl: normalized }
  }

  // git@github.com:owner/repo
  const sshRegex = /git@github\.com:([^/]+)\/(.+)$/
  match = sshRegex.exec(normalized)
  if (match) {
    return { owner: match[1], repo: match[2], normalizedUrl: `https://github.com/${match[1]}/${match[2]}` }
  }

  // github.com/owner/repo (no protocol)
  const plainRegex = /github\.com\/([^/]+)\/(.+)$/
  match = plainRegex.exec(normalized)
  if (match) {
    return { owner: match[1], repo: match[2], normalizedUrl: `https://${normalized}` }
  }

  return null
}

export function resolveUpstreamKey(parsed: { owner: string, repo: string, normalizedUrl?: string } | null): UpstreamKeyOptions {
  if (!parsed) {
    return {
      default: 'upstream-unknown',
      alternatives: [],
      needsUserInput: false,
    }
  }

  const { owner, repo } = parsed
  const repoCandidate = repo.toLowerCase().replace(/[^a-z0-9-]/g, '-')
  const ownerCandidate = owner.toLowerCase().replace(/[^a-z0-9-]/g, '-')

  // Prefer author name for generic "skills" repo names
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
  selectedSkills: Record<string, string>
}

export interface DiscoveredSkill {
  path: string
  hash: string
}

export interface UpstreamAddOutput {
  isNew: boolean
  upstreamKey: string
  discoveredSkills: DiscoveredSkill[]
  syncResult: {
    synced: Array<{ skillPath: string, outputName: string }>
    skipped: Array<{ skillPath: string, reason: string }>
    errors: Array<{ skillPath: string, error: string }>
  }
}

interface MetaJson {
  upstreams: Record<
    string,
    {
      url: string
      skills: Record<string, string>
      available: Record<string, string>
    }
  >
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

export function upstreamAdd(input: UpstreamAddInput): Effect.Effect<UpstreamAddOutput, UpstreamAddError> {
  return Effect.gen(function* () {
    const { root, selectedSkills } = input
    const metaFileService = yield* MetaFileService
    const userPromptService = yield* UserPromptService
    const gitService = yield* GitService
    const skillDiscoveryService = yield* SkillDiscoveryService
    const skillHashService = yield* SkillHashService

    const parsed = parseGitHubUrl(input.url)

    if (!parsed) {
      return yield* Effect.fail(new InvalidUrl({ message: 'URL must be a valid GitHub URL' }))
    }

    const metaPath = path.join(root, 'meta.json')
    const metaData = yield* metaFileService.read(metaPath).pipe(
      Effect.catchTag('MetaFileReadError', () =>
        Effect.fail(new MetaReadError({ message: `Failed to read meta.json at ${metaPath}` }))),
    )
    const metaJson: MetaJson = {
      upstreams: {},
      ...metaData,
    }

    const url = parsed.normalizedUrl
    let upstreamKey: string
    if (typeof input.upstreamKey !== 'undefined') {
      upstreamKey = input.upstreamKey
    }
    else {
      const keyOptions = resolveUpstreamKey(parsed)
      const allCandidates = [keyOptions.default, ...keyOptions.alternatives]
      const availableCandidates = allCandidates.filter(c => !(c in metaJson.upstreams))
      const takenCandidates = allCandidates.filter(c => c in metaJson.upstreams)

      if (takenCandidates.length > 0) {
        console.warn(`[upstream-add] Note: These upstream names are already in use: ${takenCandidates.join(', ')}`)
      }
      if (availableCandidates.length === 0) {
        upstreamKey = yield* userPromptService.prompt('Enter upstream name:')
      }
      else {
        const promptOptions = [
          ...availableCandidates.map(c => ({ label: c, value: c })),
          { label: 'Other (enter custom name)', value: '__other__' },
        ]
        const choice = yield* userPromptService.selectFromList('Upstream name (no upstreamKey provided)', promptOptions)
        upstreamKey = choice === '__other__' ? (yield* userPromptService.prompt('Enter upstream name:')) : choice
      }
    }

    const existing = metaJson.upstreams[upstreamKey]
    if (typeof existing !== 'undefined' && existing.url !== url) {
      return yield* Effect.fail(
        new UpstreamConflict({
          key: upstreamKey,
          existingUrl: existing.url,
        }),
      )
    }

    // Skip if submodule already exists (idempotent operation)
    const submodulePath = path.join(root, 'upstream', upstreamKey)
    const submoduleExists = yield* Effect.tryPromise({
      try: async () => fs.stat(submodulePath).then(() => true).catch(() => false),
      catch: () => false as const,
    })

    if (!submoduleExists) {
      yield* gitService.addSubmodule(root, upstreamKey, url)
    }

    const upstreamDir = path.join(root, 'upstream', upstreamKey)
    const discoveredSkillPaths = yield* skillDiscoveryService.discoverSkillsInDirectory(upstreamDir)

    const discoveredSkills: DiscoveredSkill[] = []
    const availableMap: Record<string, string> = {}

    for (const skillPath of discoveredSkillPaths) {
      const skillFullPath = path.join(upstreamDir, skillPath)
      const hash = yield* skillHashService.hashSkillDirectory(skillFullPath)
      discoveredSkills.push({ path: skillPath, hash })
      availableMap[skillPath] = hash
    }

    const isNew = !(upstreamKey in metaJson.upstreams)

    metaJson.upstreams[upstreamKey] = {
      url,
      skills: selectedSkills,
      available: availableMap,
    }

    yield* metaFileService.write(metaPath, metaJson as unknown as Record<string, unknown>).pipe(
      Effect.catchTag('MetaFileWriteError', () =>
        Effect.fail(new MetaWriteError({ message: `Failed to write meta.json at ${metaPath}` }))),
    )

    const result: UpstreamAddOutput = {
      isNew,
      upstreamKey,
      discoveredSkills,
      syncResult: {
        synced: Object.entries(selectedSkills).map(([skillPath, outputName]) => ({
          skillPath,
          outputName,
        })),
        skipped: [],
        errors: [],
      },
    }

    return result
  }) as Effect.Effect<UpstreamAddOutput, UpstreamAddError>
}
