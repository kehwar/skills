/**
 * CLI Prompt Helpers — User input functions using @clack/prompts.
 * Extracted so they can be mocked in tests.
 */

import * as p from '@clack/prompts'
import { getDomains, validateDomainName } from './cli-validators.ts'

/**
 * Prompt user to select or create a domain.
 * Returns domain name or undefined if user selects "none".
 */
export async function promptForDomain(authoredDirectory: string): Promise<string | undefined> {
  const existingDomains = getDomains(authoredDirectory)
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
    return undefined // Caller will handle cancellation
  }

  if (selected === '__new__') {
    const newDomain = await p.text({
      message: 'Enter new domain name (kebab-case):',
      validate: (v) => {
        const result = validateDomainName(v ?? '')
        return result.ok ? undefined : result.error
      },
    })

    if (p.isCancel(newDomain)) {
      return undefined // Caller will handle cancellation
    }

    return newDomain as string
  }

  if (selected === '__none__') {
    return undefined
  }

  return selected as string
}

/**
 * Prompt user to enter an upstream key (with collision detection).
 * If collision detected, offers to enter a new key.
 */
export async function promptForUpstreamKey(
  suggestedKey: string,
  isCollision: boolean,
  existingUrl: string,
): Promise<string | undefined> {
  if (!isCollision) {
    return suggestedKey
  }

  const answer = await p.text({
    message: `Key "${suggestedKey}" is already used by ${existingUrl}. Enter a different key:`,
    validate: v => (v?.trim() ? undefined : 'Key cannot be empty'),
  })

  if (p.isCancel(answer)) {
    return undefined // Caller will handle cancellation
  }

  return answer as string
}

/**
 * Prompt user to select skills from a list.
 * Returns array of selected skill paths.
 */
export async function promptForSkillSelection(
  skillPaths: string[],
  preSelectedPaths: string[],
  upstreamName: string,
): Promise<string[] | undefined> {
  const selected = await p.multiselect({
    message: `Select skills to sync from ${upstreamName} (${skillPaths.length} found, space to skip all)`,
    options: skillPaths.map(skillPath => ({
      value: skillPath,
      label: skillPath.split('/').pop() ?? skillPath,
      hint: skillPath === '.' ? '(repo root)' : skillPath,
    })),
    initialValues: skillPaths.filter(s => preSelectedPaths.includes(s)),
    required: false,
  })

  if (p.isCancel(selected)) {
    return undefined // Caller will handle cancellation
  }

  return (Array.isArray(selected) ? selected : []).filter(s => typeof s === 'string')
}

/**
 * Prompt user to confirm an action.
 */
export async function promptForConfirmation(message: string): Promise<boolean | undefined> {
  const confirmed = await p.confirm({ message })

  if (p.isCancel(confirmed)) {
    return undefined // Caller will handle cancellation
  }

  return confirmed
}
