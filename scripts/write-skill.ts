/**
 * Create a new authored skill interactively.
 * Usage: pnpm write-skill <name> [--domain <domain>] [--source <url>]
 *
 * 1. Validates skill name (kebab-case)
 * 2. Prompts for domain if not specified
 * 3. Normalizes source URL (if provided)
 * 4. Creates skills/<name>/ folder with SKILL.md, meta.json, README.md
 * 5. Uses authoring lib to create symlink in authored/<domain>/ if domain specified
 * 6. Prints success message
 */

import type { SkillMeta } from './types.ts'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import { linkAuthoredSkills } from './lib/authoredSkillsOps.ts'
import { SkillMetaStore } from './lib/skillMetaStore.ts'
import { normalizeUrl } from './lib/urlOps.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const skillsDir = join(root, 'skills')
const authoredDir = join(root, 'authored')
const errors: string[] = []

// ── Parse CLI arguments ─────────────────────────────────────────────────────

const args = process.argv.slice(2)
const domainFlagIdx = args.findIndex(a => a === '--domain' || a === '-d')
const domain: string | undefined = domainFlagIdx !== -1 ? args[domainFlagIdx + 1] : undefined
const sourceFlagIdx = args.findIndex(a => a === '--source' || a === '-s')
const sourceUrl: string | undefined = sourceFlagIdx !== -1 ? args[sourceFlagIdx + 1] : undefined
const positional = args.filter((_, i) => {
  if (domainFlagIdx !== -1 && (i === domainFlagIdx || i === domainFlagIdx + 1))
    return false
  if (sourceFlagIdx !== -1 && (i === sourceFlagIdx || i === sourceFlagIdx + 1))
    return false
  return true
})
const skillName = positional[0]

// ── Determine domain ────────────────────────────────────────────────────────

let selectedDomain: string | undefined

function getDomains(): string[] {
  if (!existsSync(authoredDir))
    return []
  return readdirSync(authoredDir, { withFileTypes: true })
    .filter(f => f.isDirectory() && !f.name.startsWith('.'))
    .map(f => f.name)
    .sort()
}

p.intro('Write Skill')

// ── Validate CLI arguments ──────────────────────────────────────────────────

if (!skillName) {
  p.log.error('Usage: pnpm write-skill <name> [--domain <domain>] [--source <url>]')
  process.exit(1)
}

const kebabCaseRegex = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
if (!kebabCaseRegex.test(skillName)) {
  p.log.error(`Invalid skill name "${skillName}". Must be kebab-case (lowercase, hyphens, no spaces).`)
  process.exit(1)
}

const skillPath = join(skillsDir, skillName)
if (existsSync(skillPath)) {
  p.log.error(`Skill already exists: ${skillName}`)
  process.exit(1)
}
if (domain) {
  // Domain specified via CLI
  selectedDomain = domain
  p.log.info(`Domain: ${selectedDomain}`)
}
else {
  // Prompt for domain selection
  const existingDomains = getDomains()
  const choices = [
    ...existingDomains.map(d => ({ value: d, label: d })),
    { value: '__none__', label: 'None (no domain)' },
    { value: '__new__', label: 'New domain...' },
  ]

  const selected = await p.select({
    message: 'Select domain:',
    options: choices,
  })

  if (p.isCancel(selected)) {
    p.cancel('Cancelled')
    process.exit(0)
  }

  if (selected === '__new__') {
    const newDomain = await p.text({
      message: 'Enter new domain name (kebab-case):',
      validate: (v) => {
        if (!v?.trim())
          return 'Domain name cannot be empty'
        if (!kebabCaseRegex.test(v))
          return 'Domain name must be kebab-case'
        return undefined
      },
    })

    if (p.isCancel(newDomain)) {
      p.cancel('Cancelled')
      process.exit(0)
    }

    selectedDomain = newDomain as string
  }
  else if (selected !== '__none__') {
    selectedDomain = selected as string
  }
}

// ── Normalize source URL ────────────────────────────────────────────────────

let normalizedSource: string | undefined
if (sourceUrl) {
  normalizedSource = normalizeUrl(sourceUrl)
}

// ── Create skill folder and files ───────────────────────────────────────────

const spinner = p.spinner()

try {
  spinner.start(`Creating skill "${skillName}"...`)

  // Create skills folder
  mkdirSync(skillPath, { recursive: true })

  // Write meta.json
  const skillMeta: SkillMeta = {
    type: 'authored',
    ...(selectedDomain && { domain: selectedDomain }),
    ...(normalizedSource && { sourceUrl: normalizedSource }),
  }

  // Use SkillMetaStore to add and save the skill
  const skillStore = new SkillMetaStore(skillsDir)
  skillStore.addSkill(skillName, skillMeta)
  const saveResult = skillStore.saveSkill(skillName)
  if (!saveResult.ok) {
    errors.push(`Failed to save skill metadata: ${saveResult.error}`)
    throw new Error(saveResult.error)
  }

  // Write SKILL.md with template
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
  writeFileSync(join(skillPath, 'SKILL.md'), skillMdContent)

  spinner.stop(`Created skill: ${skillName}`)

  // ── Link skill in authored/ directory ───────────────────────────────────

  if (selectedDomain) {
    const collected = [{ name: skillName, meta: skillMeta }]
    const linkResult = linkAuthoredSkills(
      collected,
      skillsDir,
      authoredDir,
    )
    if (!linkResult.ok) {
      errors.push(`Failed to link skill in authored directory: ${linkResult.error}`)
      p.log.warn(linkResult.error)
    }
    else {
      for (const msg of linkResult.data) {
        p.log.success(msg)
      }
    }
  }

  // ── Print summary ───────────────────────────────────────────────────────

  p.log.info(`Next steps:`)
  p.log.info(`  1. Edit skills/${skillName}/SKILL.md to add your skill content`)
  p.log.info(`  2. Fill in the description in the frontmatter`)
  p.log.info(`  3. Commit the new skill to git`)
  if (normalizedSource) {
    p.log.info(`Source: ${normalizedSource}`)
  }

  if (errors.length > 0) {
    p.log.warn(`${errors.length} error(s) occurred:`)
    for (const err of errors) {
      p.log.warn(`  - ${err}`)
    }
    p.outro('Skill created with errors')
    process.exit(1)
  }

  p.outro('Done')
}
catch (e) {
  const msg = e instanceof Error ? e.message : String(e)
  if (!errors.includes(msg)) {
    errors.push(msg)
  }
  p.outro(`Failed: ${msg}`)
  process.exit(1)
}
