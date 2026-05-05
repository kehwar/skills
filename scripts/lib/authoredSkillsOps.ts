/**
 * Authored Skills operations: collect, link, and prune symlinks for authored skills.
 */

import type { SkillMeta } from '../types.ts'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

/**
 * Collect all authored skills from skills/ directory.
 * Returns an array of skill name + metadata pairs.
 */
export function collectAuthoredSkills(skillsDir: string): Array<{ name: string, meta: SkillMeta }> {
  const collected: Array<{ name: string, meta: SkillMeta }> = []

  if (!existsSync(skillsDir))
    return collected

  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory())
      continue
    const skillMetaPath = join(skillsDir, entry.name, 'meta.json')
    if (!existsSync(skillMetaPath))
      continue

    const skillMeta = JSON.parse(readFileSync(skillMetaPath, 'utf-8')) as SkillMeta
    if (skillMeta.type === 'authored') {
      collected.push({ name: entry.name, meta: skillMeta })
    }
  }

  return collected
}

/**
 * Link authored skills into authored/ directory, respecting domain grouping.
 * If domain is set in meta, places in authored/{domain}/skill-name; otherwise flat in authored/.
 * Returns array of messages describing actions taken.
 */
export function linkAuthoredSkills(
  collected: Array<{ name: string, meta: SkillMeta }>,
  skillsDir: string,
  authoredDir: string,
): string[] {
  const messages: string[] = []
  mkdirSync(authoredDir, { recursive: true })

  // First pass: remove all stale links for skills being relinked
  for (const { name } of collected) {
    // Remove from flat location if it exists
    const flatLink = join(authoredDir, name)
    if (existsSync(flatLink)) {
      rmSync(flatLink, { force: true })
    }

    // Remove from any domain subdirectory
    if (existsSync(authoredDir)) {
      for (const domain of readdirSync(authoredDir, { withFileTypes: true })) {
        if (domain.isDirectory()) {
          const domainLink = join(authoredDir, domain.name, name)
          if (existsSync(domainLink)) {
            rmSync(domainLink, { force: true })
          }
        }
      }
    }
  }

  // Second pass: create new links
  for (const { name, meta } of collected) {
    if (meta.type !== 'authored')
      continue

    let linkPath: string
    let linkTarget: string

    if (meta.domain) {
      const domainDir = join(authoredDir, meta.domain)
      mkdirSync(domainDir, { recursive: true })
      linkPath = join(domainDir, name)
      linkTarget = relative(domainDir, join(skillsDir, name))
    }
    else {
      linkPath = join(authoredDir, name)
      linkTarget = relative(authoredDir, join(skillsDir, name))
    }

    mkdirSync(dirname(linkPath), { recursive: true })
    symlinkSync(linkTarget, linkPath)
    messages.push(`linked  authored: ${name}${meta.domain ? ` (domain: ${meta.domain})` : ''}`)
  }

  return messages
}

/**
 * Prune stale symlinks in authored/ directory.
 * Removes symlinks that:
 * - Point to a skill that no longer has type='authored' in its meta.json
 * - Point to a skill that doesn't exist at all
 * Returns array of messages describing actions taken.
 */
export function pruneStaleLinksinAuthoredDir(
  authoredDir: string,
  skillsDir: string,
): string[] {
  const messages: string[] = []

  function pruneRecursive(dir: string): void {
    if (!existsSync(dir))
      return

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)

      if (entry.isSymbolicLink()) {
        const skillName = entry.name
        const targetMetaPath = join(skillsDir, skillName, 'meta.json')

        if (!existsSync(targetMetaPath)) {
          rmSync(full)
          messages.push(`removed stale authored symlink: ${skillName}`)
          continue
        }

        const targetMeta = JSON.parse(readFileSync(targetMetaPath, 'utf-8')) as SkillMeta
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

  pruneRecursive(authoredDir)
  return messages
}
