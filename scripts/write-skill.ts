#!/usr/bin/env node
/**
 * Create a new authored skill interactively.
 * Usage: pnpm write-skill <name> [--domain <domain>] [--source <url>]
 *
 * Workflow:
 * 1. Validates skill name (kebab-case)
 * 2. Prompts for domain if not specified
 * 3. Normalizes source URL (if provided)
 * 4. Calls handler to create skill folder, meta.json, SKILL.md, and symlink
 */

import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import { handleWriteSkill } from './lib/cli-handlers-write-skill.ts'
import { promptForDomain } from './lib/cli-prompts.ts'
import { getDomains, skillExists, validateDomainName, validateSkillName } from './lib/cli-validators.ts'
import { parseAndNormalizeUrl } from './lib/url.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const skillsDirectory = path.join(root, 'skills')
const authoredDirectory = path.join(root, 'authored')

// ── Parse CLI arguments ─────────────────────────────────────────────────────

const arguments_ = process.argv.slice(2)
const domainFlagIndex = arguments_.findIndex(a => a === '--domain' || a === '-d')
const domain: string | undefined = domainFlagIndex === -1 ? undefined : arguments_[domainFlagIndex + 1]
const sourceFlagIndex = arguments_.findIndex(a => a === '--source' || a === '-s')
const sourceUrl: string | undefined = sourceFlagIndex === -1 ? undefined : arguments_[sourceFlagIndex + 1]
const positional = arguments_.find((_, index) => {
  if (domainFlagIndex !== -1 && (index === domainFlagIndex || index === domainFlagIndex + 1))
    return false
  if (sourceFlagIndex !== -1 && (index === sourceFlagIndex || index === sourceFlagIndex + 1))
    return false
  return true
})
const skillName = positional

p.intro('Write Skill')

// ── Validate skill name ─────────────────────────────────────────────────────

if (!skillName) {
  p.log.error('Usage: pnpm write-skill <name> [--domain <domain>] [--source <url>]')
  process.exit(1)
}

const nameValidation = validateSkillName(skillName)
if (!nameValidation.ok) {
  p.log.error(nameValidation.error)
  process.exit(1)
}

if (skillExists(skillName, skillsDirectory)) {
  p.log.error(`Skill already exists: ${skillName}`)
  process.exit(1)
}

// ── Determine domain ────────────────────────────────────────────────────────

let selectedDomain: string | undefined

if (domain) {
  // Domain specified via CLI — validate it
  const domainValidation = validateDomainName(domain)
  if (!domainValidation.ok) {
    p.log.error(domainValidation.error)
    process.exit(1)
  }
  selectedDomain = domain
  p.log.info(`Domain: ${selectedDomain}`)
}
else {
  // Prompt for domain selection
  const promptedDomain = await promptForDomain(authoredDirectory)

  if (promptedDomain === undefined) {
    p.cancel('Cancelled')
    process.exit(0)
  }

  // If promptedDomain is a new domain name (user selected "New domain..."),
  // validate it before using it
  if (promptedDomain && !getDomains(authoredDirectory).includes(promptedDomain)) {
    const newDomainValidation = validateDomainName(promptedDomain)
    if (!newDomainValidation.ok) {
      p.log.error(newDomainValidation.error)
      process.exit(1)
    }
  }

  selectedDomain = promptedDomain
}

// ── Normalize source URL ────────────────────────────────────────────────────

let normalizedSource: string | undefined
if (sourceUrl) {
  const parseResult = parseAndNormalizeUrl(sourceUrl)
  if (parseResult.ok) {
    normalizedSource = parseResult.data.normalized
  }
  else {
    p.log.error(`Invalid source URL: ${parseResult.error}`)
    process.exit(1)
  }
}

// ── Create skill via handler ────────────────────────────────────────────────

const spinner = p.spinner()
spinner.start(`Creating skill "${skillName}"...`)

const result = handleWriteSkill({
  skillName,
  domain: selectedDomain,
  sourceUrl: normalizedSource,
  root,
})

if (!result.ok) {
  spinner.stop(`Failed: ${result.error}`)
  p.log.error(result.error)
  process.exit(1)
}

const output = result.data
spinner.stop(output.message)

// ── Print next steps ────────────────────────────────────────────────────────

p.log.info(`Next steps:`)
p.log.info(`  1. Edit skills/${skillName}/SKILL.md to add your skill content`)
p.log.info(`  2. Fill in the description in the frontmatter`)
p.log.info(`  3. Commit the new skill to git`)
if (normalizedSource) {
  p.log.info(`Source: ${normalizedSource}`)
}

p.outro('Done')
