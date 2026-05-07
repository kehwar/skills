/**
 * Skill Copying — Effect-based skill copying and metadata writing.
 *
 * ## Implementation
 *
 * Copies skill directory and writes skill-level meta.json metadata using Layer 1 primitives.
 */

import type { SkillMeta } from '../types.js'
import path from 'node:path'
import { Effect, pipe } from 'effect'
import { mkdir, recursiveCopy, writeFile } from './fs.js'

/**
 * CopyError — Failed to copy skill.
 */
export class CopyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CopyError'
  }
}

/**
 * Copy a single skill from source to destination using Layer 1 primitives where possible.
 *
 * Uses Layer 1 mkdir for directory creation and Effect.try for recursive copy.
 *
 * @param sourcePath — Source skill directory
 * @param destinationPath — Destination skill directory
 * @returns Effect that succeeds with void, fails with CopyError
 */
export function copySingleSkill(sourcePath: string, destinationPath: string): Effect.Effect<void, CopyError> {
  return pipe(
    // First, create parent directory using Layer 1 primitive
    mkdir(path.dirname(destinationPath), true),
    Effect.flatMap(() =>
      // Then perform recursive copy using Layer 1 primitive
      pipe(
        recursiveCopy(sourcePath, destinationPath, { force: true }),
        Effect.catchAll(() =>
          Effect.fail(
            new CopyError(
              `Failed to copy skill from ${sourcePath} to ${destinationPath}`,
            ),
          ),
        ),
      ),
    ),
  )
}

/**
 * Write skill-level meta.json metadata using Layer 1 writeFile primitive.
 *
 * @param skillPath — Skill directory path
 * @param meta — Skill metadata to write
 * @returns Effect that succeeds with void, fails with CopyError
 */
export function writeSkillMeta(skillPath: string, meta: SkillMeta): Effect.Effect<void, CopyError> {
  return pipe(
    Effect.sync(() => {
      const metaPath = path.join(skillPath, 'meta.json')
      const json = `${JSON.stringify(meta, undefined, 2)}\n`
      return { metaPath, json }
    }),
    Effect.flatMap(({ metaPath, json }) =>
      // Use Layer 1 writeFile primitive
      writeFile(metaPath, json),
    ),
    Effect.catchAll((error: unknown) =>
      Effect.fail(new CopyError(`Failed to write skill meta: ${error instanceof Error ? error.message : String(error)}`)),
    ),
  )
}
