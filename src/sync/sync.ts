import type {
  GitService,

  MetaJson,
  SkillDiscoveryService,
} from '../shared/services/index.js'
import type {
  OutputName,
  UpstreamEntry,
} from '../shared/services/meta-file.js'
import type { SkillPath } from '../shared/services/skill-discovery.js'
import type { SkillHash } from '../shared/services/skill-hash.js'
import type { Skill } from '../upstream/upstream.js'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { Cause, Effect } from 'effect'
import {
  LogService,
  MetaFileService,
  SkillCloningService,
  SkillHashService,
} from '../shared/services/index.js'
import {
  buildUpstreamEntry,
} from '../shared/services/meta-file.js'
import { discoverAndHashSkills, setupSubmodule } from '../upstream/upstream.js'

export interface SyncInput {
  root: string
}

export interface UpstreamResult {
  upstreamKey: string
  skillsCopied: number
  skillsSkipped: number
  skillsRemoved: number
  warnings: string[]
  updatedEntry: UpstreamEntry
}

export interface SyncOutput {
  upstreams: UpstreamResult[]
}

export interface DiffEntry {
  skillPath: SkillPath
  outputName: OutputName
}

export interface DiffResult {
  toCopy: DiffEntry[]
  toSkip: DiffEntry[]
  toRemove: DiffEntry[]
  warnings: string[]
}

export interface ApplyResult {
  skillsCopied: number
  skillsSkipped: number
  skillsRemoved: number
}

type SyncServices = MetaFileService | LogService | SkillDiscoveryService | SkillHashService | GitService | SkillCloningService

export function computeDiff(
  root: string,
  upstreamKey: string,
  selectedEntries: Array<[SkillPath, OutputName]>,
  discoveredSkills: Skill[],
  upstream: { available: Record<SkillPath, SkillHash> },
): Effect.Effect<DiffResult, never, SkillHashService> {
  return Effect.gen(function* () {
    const skillHashService = yield* SkillHashService

    const discoveredMap = new Map(discoveredSkills.map(s => [s.path, s.hash]))

    const toCopy: DiffEntry[] = []
    const toSkip: DiffEntry[] = []
    const toRemove: DiffEntry[] = []
    const warnings: string[] = []

    for (const [skillPath, outputName] of selectedEntries) {
      const upstreamHash = discoveredMap.get(skillPath)

      if (upstreamHash === undefined) {
        warnings.push(`Skill "${skillPath}" no longer found in upstream "${upstreamKey}"`)
        toRemove.push({ skillPath, outputName })
        continue
      }

      const existingHash = upstream.available[skillPath]
      if (existingHash !== upstreamHash) {
        toCopy.push({ skillPath, outputName })
        continue
      }

      const targetDirectory = path.join(root, 'synced', outputName)
      const targetHash = yield* skillHashService.hashSkillDirectory(targetDirectory).pipe(
        Effect.match({ onSuccess: (hash: SkillHash) => hash, onFailure: () => {} }),
      )

      if (targetHash === upstreamHash) {
        toSkip.push({ skillPath, outputName })
      }
      else {
        toCopy.push({ skillPath, outputName })
      }
    }

    return { toCopy, toSkip, toRemove, warnings }
  })
}

export function applyDiff(
  root: string,
  upstreamKey: string,
  diff: DiffResult,
): Effect.Effect<ApplyResult, never, SkillCloningService> {
  return Effect.gen(function* () {
    const skillCloningService = yield* SkillCloningService

    let skillsCopied = 0
    let skillsRemoved = 0

    for (const entry of diff.toRemove) {
      const targetDirectory = path.join(root, 'synced', entry.outputName)
      yield* Effect.tryPromise({
        try: async () => fs.rm(targetDirectory, { recursive: true, force: true }),
        catch: () => {},
      }).pipe(Effect.catchAll(() => Effect.void))
      skillsRemoved++
    }

    for (const entry of diff.toCopy) {
      const sourceDirectory = path.join(root, 'upstream', upstreamKey, entry.skillPath)
      const targetDirectory = path.join(root, 'synced', entry.outputName)
      yield* skillCloningService.copySkill(sourceDirectory, targetDirectory).pipe(
        Effect.catchAll(() => Effect.void),
      )
      skillsCopied++
    }

    return {
      skillsCopied,
      skillsSkipped: diff.toSkip.length,
      skillsRemoved,
    }
  })
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

    yield* logService.info(`Syncing upstream: ${upstreamKey}`)

    const { effectiveBranch, warnings } = yield* updateSubmodulePhase(
      root,
      upstreamKey,
      upstream.url,
      upstream.branch,
    )

    const discoveredSkills = yield* discoverAndHashSkills(root, upstreamKey).pipe(
      Effect.catchAll(() => Effect.succeed([] as Skill[])),
    )

    const selectedEntries = Object.entries(upstream.skills) as Array<[SkillPath, OutputName]>

    const diff = yield* computeDiff(root, upstreamKey, selectedEntries, discoveredSkills, upstream)
    const result = yield* applyDiff(root, upstreamKey, diff)

    const validSelected: Record<SkillPath, OutputName> = {}
    for (const entry of [...diff.toCopy, ...diff.toSkip]) {
      validSelected[entry.skillPath] = entry.outputName
    }

    const availableMap: Record<SkillPath, SkillHash> = {}
    for (const skill of discoveredSkills) {
      availableMap[skill.path] = skill.hash
    }

    const resolvedBranch = effectiveBranch ?? upstream.branch
    const updatedEntry = buildUpstreamEntry(upstream.url, resolvedBranch, validSelected, availableMap)

    return {
      upstreamKey,
      skillsCopied: result.skillsCopied,
      skillsSkipped: result.skillsSkipped,
      skillsRemoved: result.skillsRemoved,
      warnings: [...diff.warnings, ...warnings],
      updatedEntry,
    }
  }).pipe(
    Effect.catchAllCause(cause =>
      Effect.succeed({
        upstreamKey,
        skillsCopied: 0,
        skillsSkipped: 0,
        skillsRemoved: 0,
        warnings: [`Failed to sync upstream "${upstreamKey}": ${Cause.pretty(cause)}`],
        updatedEntry: upstream,
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

      metaJson.upstreams[upstreamKey] = result.updatedEntry
    }

    yield* metaFileService.write(metaPath, metaJson).pipe(
      Effect.catchAllCause(() => Effect.void),
    )

    return { upstreams: results }
  })
}
