#!/usr/bin/env node
/**
 * Create a new authored skill interactively.
 * Usage: pnpm write-skill <name> [--domain <domain>] [--source <url>]
 *
 * Workflow:
 * 1. Validates skill name (kebab-case)
 * 2. Prompts for domain if not specified
 * 3. Normalizes source URL (if provided)
 * 4. Calls orchestrator to create skill folder, meta.json, SKILL.md, and symlink
 */

import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import { Effect } from 'effect'
import { promptForDomain } from './lib/cli-prompts.ts'
import { parseAndNormalizeUrl } from './lib/url.ts'
import { writeSkillOrchestrator } from './orchestrators/write-skill.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const authoredDirectory = path.join(root, 'authored')

async function main() {
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

  // ── Validate skill name was provided ────────────────────────────────────────

  if (!skillName) {
    p.log.error('Usage: pnpm write-skill <name> [--domain <domain>] [--source <url>]')
    process.exit(1)
  }

  // ── Determine domain ───────────────────────────────────────────────────────

  let selectedDomain: string | undefined

  if (domain) {
    // Domain specified via CLI
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

    selectedDomain = promptedDomain
  }

  // ── Normalize source URL ───────────────────────────────────────────────────

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

  // ── Create skill via orchestrator ──────────────────────────────────────────

  const spinner = p.spinner()
  spinner.start(`Creating skill "${skillName}"...`)

  try {
    const result = await Effect.runPromise(
      writeSkillOrchestrator({
        skillName,
        domain: selectedDomain,
        sourceUrl: normalizedSource,
        root,
      }),
    )

    spinner.stop(result.message)

    // ── Print next steps ───────────────────────────────────────────────────────

    p.log.info(`Next steps:`)
    p.log.info(`  1. Edit skills/${skillName}/SKILL.md to add your skill content`)
    p.log.info(`  2. Fill in the description in the frontmatter`)
    p.log.info(`  3. Commit the new skill to git`)
    if (normalizedSource) {
      p.log.info(`Source: ${normalizedSource}`)
    }

    p.outro('Done')
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    spinner.stop(`Failed: ${message}`)
    p.log.error(message)
    process.exit(1)
  }
}

main().catch((error) => {
  p.log.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
