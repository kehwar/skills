import type {
  GitService,

  MetaJson,
} from '../shared/services/index.js'
import type { OutputName } from '../shared/services/meta-file.js'
import type { SkillPath } from '../shared/services/skill-discovery.js'
import type { SkillHash } from '../shared/services/skill-hash.js'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { Cause, Effect } from 'effect'
import {
  LogService,
  MetaFileService,
  SkillCloningService,
  SkillDiscoveryService,
  SkillHashService,
} from '../shared/services/index.js'
import { setupSubmodule } from '../upstream/upstream.js'

export interface SyncInput {
  root: string
}

export interface UpstreamResult {
  upstreamKey: string
  skillsCopied: number
  skillsSkipped: number
  skillsRemoved: number
  warnings: string[]
}

export interface SyncOutput {
  upstreams: UpstreamResult[]
}

type SyncServices = MetaFileService | LogService | SkillDiscoveryService | SkillHashService | GitService | SkillCloningService

function shouldSkipSkillCopy(
  service: SkillHashService,
  upstream: { available: Record<SkillPath, SkillHash> },
  skillPath: SkillPath,
  targetDirectory: string,
  upstreamHash: SkillHash,
): Effect.Effect<boolean, never, never> {
  const existingHash = upstream.available[skillPath]
  if (existingHash !== upstreamHash) {
    return Effect.succeed(false)
  }
  return service.hashSkillDirectory(targetDirectory).pipe(
    Effect.match({
      onSuccess: (hash: SkillHash) => hash === upstreamHash,
      onFailure: () => false,
    }),
  )
}

function updateSubmodulePhase(
  root: string,
  upstreamKey: string,
  url: string,
  branch: string | undefined,
): Effect.Effect<{ effectiveBranch: string | undefined, warnings: string[] }, never, GitService | LogService> {
  return Effect.gen(function* () {
    const result = yield* Effect.either(
      setupSubmodule(root, upstreamKey, url, branch),
    )
    const warnings: string[] = []
    let effectiveBranch: string | undefined
    if (result._tag === 'Left') {
      warnings.push(`Failed to update submodule: ${upstreamKey} — ${result.left.message}`)
    }
    else if (result.right) {
      effectiveBranch = result.right
    }
    return { effectiveBranch, warnings }
  })
}

function processUpstream(
  root: string,
  upstreamKey: string,
  upstream: MetaJson['upstreams'][string],
): Effect.Effect<UpstreamResult, never, SyncServices> {
  return Effect.gen(function* () {
    const logService = yield* LogService
    const skillDiscoveryService = yield* SkillDiscoveryService
    const skillHashService = yield* SkillHashService
    const skillCloningService = yield* SkillCloningService

    yield* logService.info(`Syncing upstream: ${upstreamKey}`)

    const { effectiveBranch, warnings } = yield* updateSubmodulePhase(
      root,
      upstreamKey,
      upstream.url,
      upstream.branch,
    )

    if (effectiveBranch !== undefined && upstream.branch !== effectiveBranch) {
      upstream.branch = effectiveBranch
    }

    const upstreamDirectory = path.join(root, 'upstream', upstreamKey)

    const discoveredPaths = yield* skillDiscoveryService.discoverSkillsInDirectory(upstreamDirectory).pipe(
      Effect.catchAll(() => Effect.succeed([] as SkillPath[])),
    )

    const discoveredSkills: Array<{ path: SkillPath, hash: SkillHash }> = []
    for (const skillPath of discoveredPaths) {
      const fullPath = path.join(upstreamDirectory, skillPath)
      const hash = yield* skillHashService.hashSkillDirectory(fullPath).pipe(
        Effect.catchAll(() => Effect.succeed('' as SkillHash)),
      )
      if (hash.length > 0) {
        discoveredSkills.push({ path: skillPath, hash })
      }
    }

    const discoveredMap = new Map(discoveredSkills.map(s => [s.path, s.hash]))
    const selectedEntries = Object.entries(upstream.skills) as Array<[SkillPath, OutputName]>

    let skillsCopied = 0
    let skillsSkipped = 0
    let skillsRemoved = 0

    const validSelected: Record<SkillPath, OutputName> = {}

    for (const [skillPath, outputName] of selectedEntries) {
      const upstreamHash = discoveredMap.get(skillPath)

      if (upstreamHash === undefined) {
        warnings.push(`Skill "${skillPath}" no longer found in upstream "${upstreamKey}"`)
        const targetDirectory = path.join(root, 'synced', outputName)
        yield* Effect.tryPromise({
          try: async () => fs.rm(targetDirectory, { recursive: true, force: true }),
          catch: () => {},
        })
        skillsRemoved++
        continue
      }

      validSelected[skillPath] = outputName
      const targetDirectory = path.join(root, 'synced', outputName)

      const shouldSkip = yield* shouldSkipSkillCopy(skillHashService, upstream, skillPath, targetDirectory, upstreamHash)
      if (shouldSkip) {
        skillsSkipped++
        continue
      }

      const sourceDirectory = path.join(root, 'upstream', upstreamKey, skillPath)

      yield* skillCloningService.copySkill(sourceDirectory, targetDirectory).pipe(
        Effect.catchAll(() => Effect.void),
      )

      skillsCopied++
    }

    upstream.skills = validSelected

    const availableMap: Record<SkillPath, SkillHash> = {}
    for (const skill of discoveredSkills) {
      availableMap[skill.path] = skill.hash
    }
    upstream.available = availableMap

    return {
      upstreamKey,
      skillsCopied,
      skillsSkipped,
      skillsRemoved,
      warnings,
    }
  }).pipe(
    Effect.catchAllCause(cause =>
      Effect.succeed({
        upstreamKey,
        skillsCopied: 0,
        skillsSkipped: 0,
        skillsRemoved: 0,
        warnings: [`Failed to sync upstream "${upstreamKey}": ${Cause.pretty(cause)}`],
      }),
    ),
  )
}

export function sync(
  input: SyncInput,
): Effect.Effect<SyncOutput, never, SyncServices> {
  return Effect.gen(function* () {
    const metaFileService = yield* MetaFileService
    const logService = yield* LogService

    const metaPath = path.join(input.root, 'meta.json')
    const metaData = yield* metaFileService.read(metaPath).pipe(
      Effect.catchAll(error =>
        logService.warn(`Failed to read meta.json: ${error._tag}`).pipe(
          Effect.andThen(Effect.succeed({ upstreams: {} })),
        ),
      ),
    )
    const metaJson: MetaJson = { upstreams: {}, ...metaData }

    const results: UpstreamResult[] = []

    for (const [upstreamKey, rawUpstream] of Object.entries(metaJson.upstreams)) {
      const upstream = {
        ...rawUpstream,
        skills: rawUpstream.skills ?? {},
        available: rawUpstream.available ?? {},
      }
      const result = yield* processUpstream(input.root, upstreamKey, upstream)
      results.push(result)

      metaJson.upstreams[upstreamKey] = upstream
    }

    yield* metaFileService.write(metaPath, metaJson).pipe(
      Effect.catchAllCause(() => Effect.void),
    )

    return { upstreams: results }
  })
}
