import type { MetaJson, PromptError } from '../shared/services/index.js'
import path from 'node:path'
import { Data, Effect } from 'effect'
import { LogService, MetaFileService, UserPromptService } from '../shared/services/index.js'

export class InvalidUpstreamName extends Data.TaggedError('InvalidUpstreamName')<{
  message: string
}> {}

export class NoAvailableSkills extends Data.TaggedError('NoAvailableSkills')<{
  message: string
}> {}

export class MetaFileError extends Data.TaggedError('MetaFileError')<{
  message: string
}> {}

export interface CloneSkillsInput {
  root: string
  upstreamName: string
}

export interface CloneSkillsOutput {
  upstreamName: string
  selectedSkills: Record<string, string>
  message: string
}

function parseSkillPath(skillPath: string): string {
  // Convert 'skills/skillname' to 'skillname'
  const parts = skillPath.split('/')
  const skillName = parts.at(-1)
  return skillName ?? skillPath
}

export function cloneSkills(
  input: CloneSkillsInput,
): Effect.Effect<
  CloneSkillsOutput,
  InvalidUpstreamName | NoAvailableSkills | PromptError | MetaFileError,
  MetaFileService | UserPromptService | LogService
> {
  return Effect.gen(function* () {
    const metaFileService = yield* MetaFileService
    const userPromptService = yield* UserPromptService
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

    // Validate upstream exists
    const upstream = metaJson.upstreams[input.upstreamName]
    if (upstream === undefined) {
      return yield* Effect.fail(
        new InvalidUpstreamName({
          message: `Upstream "${input.upstreamName}" not found in meta.json`,
        }),
      )
    }

    // Get available skills
    const availableSkillPaths = Object.keys(upstream.available)

    if (availableSkillPaths.length === 0) {
      return yield* Effect.fail(
        new NoAvailableSkills({
          message: `No available skills found in upstream "${input.upstreamName}"`,
        }),
      )
    }

    // Prepare options for multi-select
    const options = availableSkillPaths.map((skillPath) => {
      const skillName = parseSkillPath(skillPath)
      return {
        label: skillName,
        value: skillPath,
        hint: skillPath,
      }
    })

    // Get currently selected skills to show as checked
    const currentSelections = new Set(Object.keys(upstream.skills))

    // Show interactive multi-select
    yield* logService.info(`Available skills in "${input.upstreamName}":`)
    const selectedPaths = yield* userPromptService.multiSelect(
      'Select skills to clone',
      options,
      [...currentSelections],
    )

    // Build the selected skills map (skillPath -> skillName)
    const selectedSkills: Record<string, string> = {}
    for (const skillPath of selectedPaths) {
      const skillName = parseSkillPath(skillPath)
      selectedSkills[skillPath] = skillName
    }

    // Update meta.json
    const updatedMeta = {
      ...metaJson,
      upstreams: {
        ...metaJson.upstreams,
        [input.upstreamName]: {
          ...upstream,
          skills: selectedSkills,
        },
      },
    }
    yield* metaFileService.write(metaPath, updatedMeta).pipe(
      Effect.catchAll(() =>
        Effect.fail(new MetaFileError({ message: 'Failed to write meta.json' })),
      ),
    )

    const count = selectedPaths.length
    const message = count === 0
      ? `No skills selected for "${input.upstreamName}"`
      : `Selected ${count} skill(s) from "${input.upstreamName}" - run 'pnpm sync' to copy them`

    return {
      upstreamName: input.upstreamName,
      selectedSkills,
      message,
    }
  })
}
