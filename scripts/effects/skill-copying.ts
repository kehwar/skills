/**
 * Skill Copying — Effect-based skill copying and metadata writing.
 *
 * ## Implementation
 *
 * Copies skill directory and writes skill-level meta.json metadata.
 */

import type { SkillMeta } from '../types.js'
import { cpSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Effect } from 'effect'

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
 * Copy a single skill from source to destination.
 *
 * @param sourcePath — Source skill directory
 * @param destinationPath — Destination skill directory
 * @returns Effect that succeeds with void, fails with CopyError
 */
export function copySingleSkill(sourcePath: string, destinationPath: string): Effect.Effect<void, CopyError> {
  return Effect.sync(() => {
    try {
      mkdirSync(path.dirname(destinationPath), { recursive: true })
      cpSync(sourcePath, destinationPath, { recursive: true, force: true })
    }
    catch (error) {
      throw new CopyError(`Failed to copy skill from ${sourcePath} to ${destinationPath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
}

/**
 * Write skill-level meta.json metadata.
 *
 * @param skillPath — Skill directory path
 * @param meta — Skill metadata to write
 * @returns Effect that succeeds with void, fails with CopyError
 */
export function writeSkillMeta(skillPath: string, meta: SkillMeta): Effect.Effect<void, CopyError> {
  return Effect.sync(() => {
    try {
      const metaPath = path.join(skillPath, 'meta.json')
      const json = `${JSON.stringify(meta, undefined, 2)}\n`
      writeFileSync(metaPath, json, 'utf8')
    }
    catch (error) {
      throw new CopyError(`Failed to write skill meta: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
}
