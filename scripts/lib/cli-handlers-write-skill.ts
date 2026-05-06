/**
 * Handler for write-skill workflow.
 * Pure business logic: no prompts, no file system errors (only success/failure Result).
 */

import type { Result, SkillMeta } from '../types.ts'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { linkAuthoredSkills } from './authored-skills-ops.ts'
import { SkillMetaStore } from './skill-meta-store.ts'

export interface WriteSkillInput {
  skillName: string
  domain?: string
  sourceUrl?: string
  root: string
}

export interface WriteSkillOutput {
  skillName: string
  domain?: string
  skillPath: string
  message: string
}

/**
 * Create a new authored skill.
 * Handles: folder creation, meta.json write, SKILL.md template, authored/ symlink.
 */
export function handleWriteSkill(input: WriteSkillInput): Result<WriteSkillOutput> {
  const { skillName, domain, sourceUrl, root } = input

  const skillsDirectory = path.join(root, 'skills')
  const authoredDirectory = path.join(root, 'authored')
  const skillPath = path.join(skillsDirectory, skillName)

  try {
    // Create skill folder
    mkdirSync(skillPath, { recursive: true })

    // Write meta.json
    const skillMeta: SkillMeta = {
      type: 'authored',
      ...(domain && { domain }),
      ...(sourceUrl && { sourceUrl }),
    }

    const skillStore = new SkillMetaStore(skillsDirectory)
    skillStore.addSkill(skillName, skillMeta)
    const saveResult = skillStore.saveSkill(skillName)
    if (!saveResult.ok) {
      return { ok: false, error: `Failed to save skill metadata: ${saveResult.error}` }
    }

    // Write SKILL.md template
    const skillMdContent = `---
name: ${skillName}
description: |
  [Add a 1-2 sentence description. Include "Use when" trigger.]
---

# ${skillName}

## Quick start

[Minimal working example]

## Workflows

[Step-by-step processes]

## Advanced features

[Link to additional docs if needed]
`
    writeFileSync(path.join(skillPath, 'SKILL.md'), skillMdContent)

    // Link in authored/ directory if domain specified
    if (domain) {
      const collected = [{ name: skillName, meta: skillMeta }]
      const linkResult = linkAuthoredSkills(
        collected,
        skillsDirectory,
        authoredDirectory,
      )
      if (!linkResult.ok) {
        return {
          ok: false,
          error: `Failed to link skill in authored directory: ${linkResult.error}`,
        }
      }
    }

    const domainSuffix = domain ? ` in domain ${domain}` : ''
    const message = `Created skill: ${skillName}${domainSuffix}`
    return {
      ok: true,
      data: {
        skillName,
        domain,
        skillPath,
        message,
      },
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `Failed to create skill: ${message}` }
  }
}
