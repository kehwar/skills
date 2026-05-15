import type { MetaJson } from '../shared/services/index.js'
import type { OutputName } from '../shared/services/meta-file.js'
import type { SkillPath } from '../shared/services/skill-discovery.js'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { Data, Effect } from 'effect'
import {
  LogService,
  MetaFileService,
  SkillCloningService,
  UserPromptService,
} from '../shared/services/index.js'

export class InvalidUpstreamName extends Data.TaggedError('InvalidUpstreamName')<{
  message: string
}> {}

export class NoAvailableSkills extends Data.TaggedError('NoAvailableSkills')<{
  message: string
}> {}

export class MetaFileError extends Data.TaggedError('MetaFileError')<{
  message: string
}> {}

export interface SelectedSkill {
  sourcePath: SkillPath
  outputName: OutputName
}

export interface CloneSkillsInput {
  root: string
  upstreamName: string
}

export interface CloneSkillsOutput {
  upstreamName: string
  selectedSkills: SelectedSkill[]
  message: string
  cloned: string[]
  removed: string[]
}

function parseSkillPath(skillPath: string): string {
  const parts = skillPath.split('/')
  const skillName = parts.at(-1)
  return skillName ?? skillPath
}

type CloneServices = MetaFileService | UserPromptService | LogService | SkillCloningService

export function cloneSkills(
  input: CloneSkillsInput,
): Effect.Effect<
  CloneSkillsOutput,
  unknown,
  CloneServices
> {
  return Effect.gen(function* () {
    const metaFileService = yield* MetaFileService
    const userPromptService = yield* UserPromptService
    const logService = yield* LogService
    const skillCloningService = yield* SkillCloningService

    const metaPath = path.join(input.root, 'meta.json')
    const metaData = yield* metaFileService.read(metaPath).pipe(
      Effect.catchAll((error: unknown) =>
        logService.warn(`Failed to read meta.json: ${(error as { _tag: string })._tag}`).pipe(
          Effect.andThen(Effect.succeed({ upstreams: {} })),
        ),
      ),
    )
    const metaJson: MetaJson = { upstreams: {}, ...metaData }

    const upstream = metaJson.upstreams[input.upstreamName]
    if (upstream === undefined) {
      return yield* Effect.fail(
        new InvalidUpstreamName({
          message: `Upstream "${input.upstreamName}" not found in meta.json`,
        }),
      )
    }

    const availableSkillPaths = Object.keys(upstream.available)

    if (availableSkillPaths.length === 0) {
      return yield* Effect.fail(
        new NoAvailableSkills({
          message: `No available skills found in upstream "${input.upstreamName}"`,
        }),
      )
    }

    const options = availableSkillPaths.map((skillPath) => {
      const skillName = parseSkillPath(skillPath)
      return {
        label: skillName,
        value: skillPath,
        hint: skillPath,
      }
    })

    const currentSelections = new Set(Object.keys(upstream.skills))

    yield* logService.info(`Available skills in "${input.upstreamName}":`)
    const selectedPaths = yield* userPromptService.multiSelect(
      'Select skills to clone',
      options,
      [...currentSelections],
    )

    const selectedSkillsMap: Record<string, OutputName> = {}
    for (const skillPath of selectedPaths) {
      const skillName = parseSkillPath(skillPath)
      selectedSkillsMap[skillPath] = skillName as OutputName
    }

    const selectedSkills: SelectedSkill[] = selectedPaths.map(skillPath => ({
      sourcePath: skillPath as SkillPath,
      outputName: selectedSkillsMap[skillPath]!,
    }))

    const previouslySelected = Object.keys(upstream.skills)
    const newlySelected = selectedPaths.filter(p => !currentSelections.has(p))
    const deselected = previouslySelected.filter(p => !selectedPaths.includes(p))

    const cloned: string[] = []
    for (const skillPath of newlySelected) {
      const outputName = selectedSkillsMap[skillPath as SkillPath]!
      const sourceDirectory = path.join(input.root, 'upstream', input.upstreamName, skillPath)
      const destinationDirectory = path.join(input.root, 'synced', outputName)
      yield* skillCloningService.copySkill(sourceDirectory, destinationDirectory).pipe(
        Effect.catchAll(() => Effect.void),
      )
      cloned.push(skillPath)
    }

    const removed: string[] = []
    for (const skillPath of deselected) {
      const outputName = upstream.skills[skillPath as SkillPath]!
      const targetDirectory = path.join(input.root, 'synced', outputName)
      yield* Effect.tryPromise({
        try: async () => fs.rm(targetDirectory, { recursive: true, force: true }),
        catch: () => {},
      })
      removed.push(skillPath)
    }

    const updatedMeta = {
      ...metaJson,
      upstreams: {
        ...metaJson.upstreams,
        [input.upstreamName]: {
          ...upstream,
          skills: selectedSkillsMap as Record<SkillPath, OutputName>,
        },
      },
    }
    yield* metaFileService.write(metaPath, updatedMeta).pipe(
      Effect.catchAll(() =>
        Effect.fail(new MetaFileError({ message: 'Failed to write meta.json' })),
      ),
    )

    const count = selectedPaths.length
    let message: string
    if (count === 0) {
      message = `No skills selected for "${input.upstreamName}"`
    }
    else {
      const parts: string[] = [`Selected ${count} skill(s) from "${input.upstreamName}"`]
      if (cloned.length > 0) {
        parts.push(`cloned ${cloned.length}`)
      }
      if (removed.length > 0) {
        parts.push(`removed ${removed.length}`)
      }
      message = parts.join(', ')
    }

    return {
      upstreamName: input.upstreamName,
      selectedSkills,
      message,
      cloned,
      removed,
    }
  })
}
