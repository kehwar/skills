import type {
  MetaJson,
} from '../shared/services/index.js'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { Cause, Effect } from 'effect'
import {
  GitService,
  LogService,
  MetaFileService,
  SkillCloningService,
  SkillDiscoveryService,
  SkillHashService,
} from '../shared/services/index.js'

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
  upstream: { available: Record<string, string> },
  skillPath: string,
  targetDirectory: string,
  upstreamHash: string,
): Effect.Effect<boolean, never, never> {
  const existingHash = upstream.available[skillPath]
  if (existingHash !== upstreamHash) {
    return Effect.succeed(false)
  }
  return service.hashSkillDirectory(targetDirectory).pipe(
    Effect.match({
      onSuccess: (hash: string) => hash === upstreamHash,
      onFailure: () => false,
    }),
  )
}

function processUpstream(
  root: string,
  upstreamKey: string,
  upstream: MetaJson['upstreams'][string],
): Effect.Effect<UpstreamResult, never, SyncServices> {
  return Effect.gen(function* () {
    const logService = yield* LogService
    const gitService = yield* GitService
    const skillDiscoveryService = yield* SkillDiscoveryService
    const skillHashService = yield* SkillHashService
    const skillCloningService = yield* SkillCloningService

    yield* logService.info(`Syncing upstream: ${upstreamKey}`)

    const submoduleUpdateResult = yield* Effect.either(
      gitService.updateSubmodule(root, upstreamKey, upstream.branch),
    )

    const warnings: string[] = []
    if (submoduleUpdateResult._tag === 'Left') {
      warnings.push(`Failed to update submodule: ${upstreamKey} — ${submoduleUpdateResult.left.message}`)
    }
    else if (submoduleUpdateResult.right) {
      const effectiveBranch = submoduleUpdateResult.right
      if (upstream.branch !== effectiveBranch) {
        upstream.branch = effectiveBranch
      }
    }

    const upstreamDirectory = path.join(root, 'upstream', upstreamKey)

    const discoveredPaths = yield* skillDiscoveryService.discoverSkillsInDirectory(upstreamDirectory).pipe(
      Effect.catchAll(() => Effect.succeed([] as string[])),
    )

    const discoveredSkills: Array<{ path: string, hash: string }> = []
    for (const skillPath of discoveredPaths) {
      const fullPath = path.join(upstreamDirectory, skillPath)
      const hash = yield* skillHashService.hashSkillDirectory(fullPath).pipe(
        Effect.catchAll(() => Effect.succeed('')),
      )
      if (hash) {
        discoveredSkills.push({ path: skillPath, hash })
      }
    }

    const discoveredMap = new Map(discoveredSkills.map(s => [s.path, s.hash]))
    const selectedEntries = Object.entries(upstream.skills)

    let skillsCopied = 0
    let skillsSkipped = 0
    let skillsRemoved = 0

    const validSelected: Record<string, string> = {}

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

    const availableMap: Record<string, string> = {}
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
