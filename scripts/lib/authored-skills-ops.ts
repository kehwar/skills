/**
 * Authored Skills operations: collect, link, and prune symlinks for authored skills.
 */

import type { Result, SkillMeta } from '../types.ts'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import path from 'node:path'

/**
 * Collect all authored skills from skills/ directory.
 * Returns Result<array of skill name + metadata pairs>.
 */
export function collectAuthoredSkills(skillsDirectory: string): Result<Array<{ name: string, meta: SkillMeta }>> {
  const collected: Array<{ name: string, meta: SkillMeta }> = []

  try {
    if (!existsSync(skillsDirectory))
      return { ok: true, data: collected }

    for (const entry of readdirSync(skillsDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory())
        continue
      const skillMetaPath = path.join(skillsDirectory, entry.name, 'meta.json')
      if (!existsSync(skillMetaPath))
        continue

      const skillMeta = JSON.parse(readFileSync(skillMetaPath, 'utf8')) as SkillMeta
      if (skillMeta.type === 'authored') {
        collected.push({ name: entry.name, meta: skillMeta })
      }
    }

    return { ok: true, data: collected }
  }
  catch (error) {
    return {
      ok: false,
      error: `Failed to collect authored skills: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Remove all stale links for a skill being relinked.
 */
function removeStaleSkillLinks(name: string, authoredDirectory: string): void {
  // Remove from flat location if it exists
  const flatLink = path.join(authoredDirectory, name)
  if (existsSync(flatLink))
    rmSync(flatLink, { force: true })

  // Remove from any domain subdirectory
  if (existsSync(authoredDirectory)) {
    for (const domain of readdirSync(authoredDirectory, { withFileTypes: true })) {
      if (domain.isDirectory()) {
        const domainLink = path.join(authoredDirectory, domain.name, name)
        if (existsSync(domainLink))
          rmSync(domainLink, { force: true })
      }
    }
  }
}

/**
 * Create a new link for an authored skill.
 */
function createSkillLink(
  name: string,
  meta: Extract<SkillMeta, { type: 'authored' }>,
  skillsDirectory: string,
  authoredDirectory: string,
): string {
  let linkPath: string
  let linkTarget: string

  if (meta.domain) {
    const domainDirectory = path.join(authoredDirectory, meta.domain)
    mkdirSync(domainDirectory, { recursive: true })
    linkPath = path.join(domainDirectory, name)
    linkTarget = path.relative(domainDirectory, path.join(skillsDirectory, name))
  }
  else {
    linkPath = path.join(authoredDirectory, name)
    linkTarget = path.relative(authoredDirectory, path.join(skillsDirectory, name))
  }

  mkdirSync(path.dirname(linkPath), { recursive: true })
  symlinkSync(linkTarget, linkPath)

  return meta.domain ? ` (domain: ${meta.domain})` : ''
}

/**
 * Link authored skills into authored/ directory, respecting domain grouping.
 * If domain is set in meta, places in authored/{domain}/skill-name; otherwise flat in authored/.
 * Returns Result<array of messages> describing actions taken.
 */
export function linkAuthoredSkills(
  collected: Array<{ name: string, meta: SkillMeta }>,
  skillsDirectory: string,
  authoredDirectory: string,
): Result<string[]> {
  const messages: string[] = []

  try {
    mkdirSync(authoredDirectory, { recursive: true })

    // First pass: remove all stale links for skills being relinked
    for (const { name } of collected)
      removeStaleSkillLinks(name, authoredDirectory)

    // Second pass: create new links
    for (const { name, meta } of collected) {
      if (meta.type !== 'authored')
        continue

      const domainSuffix = createSkillLink(name, meta as Extract<SkillMeta, { type: 'authored' }>, skillsDirectory, authoredDirectory)
      messages.push(`linked  authored: ${name}${domainSuffix}`)
    }

    return { ok: true, data: messages }
  }
  catch (error) {
    return {
      ok: false,
      error: `Failed to link authored skills: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Prune stale symlinks in authored/ directory.
 * Removes symlinks that:
 * - Point to a skill that no longer has type='authored' in its meta.json
 * - Point to a skill that doesn't exist at all
 * Returns Result<array of messages> describing actions taken.
 */
export function pruneStaleLinksinAuthoredDirectory(
  authoredDirectory: string,
  skillsDirectory: string,
): Result<string[]> {
  const messages: string[] = []

  try {
    function pruneRecursive(directory: string): void {
      if (!existsSync(directory))
        return

      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name)

        if (entry.isSymbolicLink()) {
          const skillName = entry.name
          const targetMetaPath = path.join(skillsDirectory, skillName, 'meta.json')

          if (!existsSync(targetMetaPath)) {
            rmSync(full)
            messages.push(`removed stale authored symlink: ${skillName}`)
            continue
          }

          const targetMeta = JSON.parse(readFileSync(targetMetaPath, 'utf8')) as SkillMeta
          if (targetMeta.type !== 'authored') {
            rmSync(full)
            messages.push(`removed stale authored symlink: ${skillName}`)
          }
        }
        else if (entry.isDirectory()) {
          pruneRecursive(full)
          // Remove empty subdirs
          if (existsSync(full) && readdirSync(full).length === 0)
            rmSync(full, { recursive: true })
        }
      }
    }

    pruneRecursive(authoredDirectory)
    return { ok: true, data: messages }
  }
  catch (error) {
    return {
      ok: false,
      error: `Failed to prune stale authored symlinks: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
