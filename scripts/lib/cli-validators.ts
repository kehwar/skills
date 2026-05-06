/**
 * CLI Validators — Pure validation functions with no side effects.
 * Return { ok: true } or { ok: false, error: "message" }
 */

import type { Result } from '../types.ts'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

const KEBAB_CASE_REGEX = /^[\da-z](?:[\da-z-]*[\da-z])?$/

/**
 * Validate a skill name (kebab-case, 1-63 chars).
 */
export function validateSkillName(name: string): Result<string> {
  if (!name || !name.trim()) {
    return { ok: false, error: 'Skill name cannot be empty' }
  }

  if (name.length > 63) {
    return { ok: false, error: 'Skill name must be 63 characters or less' }
  }

  if (!KEBAB_CASE_REGEX.test(name)) {
    return {
      ok: false,
      error: 'Skill name must be kebab-case (lowercase, hyphens, no spaces)',
    }
  }

  return { ok: true, data: name }
}

/**
 * Validate a domain name (kebab-case, 1-63 chars).
 */
export function validateDomainName(name: string): Result<string> {
  if (!name || !name.trim()) {
    return { ok: false, error: 'Domain name cannot be empty' }
  }

  if (name.length > 63) {
    return { ok: false, error: 'Domain name must be 63 characters or less' }
  }

  if (!KEBAB_CASE_REGEX.test(name)) {
    return {
      ok: false,
      error: 'Domain name must be kebab-case (lowercase, hyphens, no spaces)',
    }
  }

  return { ok: true, data: name }
}

/**
 * Validate an upstream URL (must be https GitHub URL or similar).
 */
export function validateUpstreamUrl(url: string): Result<string> {
  if (!url || !url.trim()) {
    return { ok: false, error: 'URL cannot be empty' }
  }

  const trimmed = url.trim().replace(/\.git$/, '')

  // Accept https:// GitHub URLs and similar
  if (!trimmed.startsWith('https://')) {
    return {
      ok: false,
      error: 'URL must start with https:// (e.g., https://github.com/user/repo)',
    }
  }

  // Remove protocol: https:// → rest
  const afterProtocol = trimmed.slice(8) // 'https://'.length === 8

  // Split by / and filter empties
  const parts = afterProtocol.split('/').filter(p => p.length > 0)

  // Should have at least domain + org + repo
  // e.g., github.com, user, repo
  if (parts.length < 3) {
    return {
      ok: false,
      error: 'URL must have org/repo structure (e.g., https://github.com/user/repo)',
    }
  }

  return { ok: true, data: trimmed }
}

/**
 * Validate a git branch name.
 */
export function validateBranchName(name: string): Result<string> {
  if (!name || !name.trim()) {
    return { ok: false, error: 'Branch name cannot be empty' }
  }

  // Basic git branch naming rules
  if (name.includes('..') || name.includes('//') || name.includes(' ')) {
    return {
      ok: false,
      error: 'Branch name contains invalid characters',
    }
  }

  return { ok: true, data: name.trim() }
}

/**
 * Check if a skill already exists in skills directory.
 */
export function skillExists(skillName: string, skillsDirectory: string): boolean {
  const skillPath = path.join(skillsDirectory, skillName)
  return existsSync(skillPath)
}

/**
 * Check if a domain already exists in authored directory.
 */
export function domainExists(domainName: string, authoredDirectory: string): boolean {
  const domainPath = path.join(authoredDirectory, domainName)
  return existsSync(domainPath)
}

/**
 * Get all existing domains.
 */
export function getDomains(authoredDirectory: string): string[] {
  if (!existsSync(authoredDirectory)) {
    return []
  }

  return readdirSync(authoredDirectory, { withFileTypes: true })
    .filter(f => f.isDirectory() && !f.name.startsWith('.'))
    .map(f => f.name)
    .sort()
}
