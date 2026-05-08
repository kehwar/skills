/**
 * Write Skill Orchestrator
 *
 * ## Architecture
 *
 * Orchestrates the full skill creation workflow:
 * 1. **Validate** skill name (kebab-case, no duplicates)
 * 2. **Validate** domain name (if provided)
 * 3. **Create** skill folder in skills/
 * 4. **Write** meta.json with type='authored' + domain/sourceUrl (if provided)
 * 5. **Write** SKILL.md template
 * 6. **Link** skill to authored/{domain}/ via symlink (if domain provided)
 *
 * Uses Effect.gen() for declarative composition with automatic error propagation.
 * Phases run sequentially; any failure short-circuits immediately.
 *
 * ## Error Handling
 *
 * Errors are typed (ValidationError, CollisionError, IOError) and propagated
 * automatically by Effect. No manual error threading required.
 *
 * ## Public Interface
 *
 * Designed for integration with CLI layer:
 * - Input includes all required configuration (skillName, domain, root, etc.)
 * - Output provides complete result details (skillPath, symlinked status)
 * - All errors are typed for caller to handle appropriately
 *
 * @example
 * ```typescript
 * import { writeSkillOrchestrator } from './orchestrators/write-skill.js'
 * import { Effect } from 'effect'
 *
 * const result = await Effect.runPromise(
 *   writeSkillOrchestrator({
 *     skillName: 'my-skill',
 *     domain: 'frappe',
 *     sourceUrl: undefined,
 *     root: '/path/to/skills'
 *   })
 * )
 *
 * // result = {
 * //   skillName: 'my-skill',
 * //   domain: 'frappe',
 * //   skillPath: '/path/to/skills/skills/my-skill',
 * //   symlinked: true,
 * //   message: 'Created skill: my-skill in domain frappe'
 * // }
 * ```
 */

import type { AuthoredSkillsError } from '../effects/authored-skills.js'
import type { ValidationError } from '../effects/validation.js'
import type { SkillMeta } from '../types.js'
import path from 'node:path'
import { Effect } from 'effect'
import { linkSkillToAuthoredDirectory } from '../effects/authored-skills.js'
import { exists, mkdir, writeFile } from '../effects/fs.js'
import { writeSkillMeta } from '../effects/skill-copying.js'
import { validateDomainName, validateSkillName } from '../effects/validation.js'

/**
 * Input to the write-skill orchestrator.
 * Encapsulates everything needed to create a new skill.
 */
export interface WriteSkillInput {
  /** Skill name to create (will be validated) */
  skillName: string
  /** Optional domain for skill organization */
  domain?: string
  /** Optional upstream source URL */
  sourceUrl?: string
  /** Root directory of the skills repository */
  root: string
}

/**
 * Output from the write-skill orchestrator.
 * Provides full details of what was created.
 */
export interface WriteSkillOutput {
  /** The skill name that was created */
  skillName: string
  /** Domain if provided */
  domain?: string
  /** Absolute path to the created skill */
  skillPath: string
  /** Whether a symlink was created in authored/ */
  symlinked: boolean
  /** Human-friendly message about what was created */
  message: string
}

/**
 * CollisionError — Skill or domain already exists at target path.
 */
export class CollisionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CollisionError'
  }
}

/**
 * Orchestrate the full skill creation workflow.
 *
 * Runs phases sequentially:
 * 1. Validate skill name
 * 2. Check skill doesn't already exist
 * 3. Validate domain name (if provided)
 * 4. Create skill folder
 * 5. Write meta.json
 * 6. Write SKILL.md template
 * 7. Create symlink (if domain provided)
 *
 * Errors in any phase short-circuit and return immediately.
 *
 * @param input Configuration and input for skill creation
 * @returns Effect producing WriteSkillOutput or error
 */
export function writeSkillOrchestrator(
  input: WriteSkillInput,
): Effect.Effect<WriteSkillOutput, ValidationError | CollisionError | AuthoredSkillsError | Error> {
  return Effect.gen(function* () {
    const { skillName, domain, sourceUrl, root } = input
    const skillsDir = path.join(root, 'skills')
    const authoredDir = path.join(root, 'authored')
    const skillPath = path.join(skillsDir, skillName)

    // Phase 1: Validate skill name
    yield* validateSkillName(skillName)

    // Phase 2: Check skill doesn't already exist
    const skillExists = yield* exists(skillPath)
    if (skillExists) {
      return yield* Effect.fail(
        new CollisionError(`Skill already exists: ${skillName}`),
      )
    }

    // Phase 3: Validate domain name (if provided)
    if (domain) {
      yield* validateDomainName(domain)
    }

    // Phase 4: Create skill folder
    yield* mkdir(skillPath, true)

    // Phase 5: Write meta.json
    const skillMeta: SkillMeta = {
      type: 'authored',
      ...(domain && { domain }),
      ...(sourceUrl && { sourceUrl }),
    }
    yield* writeSkillMeta(skillPath, skillMeta)

    // Phase 6: Write SKILL.md template
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
    yield* writeFile(path.join(skillPath, 'SKILL.md'), skillMdContent)

    // Phase 7: Create symlink (if domain provided)
    let symlinkCreated = false
    if (domain) {
      yield* linkSkillToAuthoredDirectory(skillPath, domain, authoredDir)
      symlinkCreated = true
    }

    // Return output
    const domainSuffix = domain ? ` in domain ${domain}` : ''
    return {
      skillName,
      domain,
      skillPath,
      symlinked: symlinkCreated,
      message: `Created skill: ${skillName}${domainSuffix}`,
    } satisfies WriteSkillOutput
  })
}
