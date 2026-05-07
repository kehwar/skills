/**
 * URL Parsing — Effect-based GitHub URL parsing and normalization.
 *
 * ## Dependency Injection Pattern
 *
 * This module demonstrates pure parsing logic using Effect:
 * - **No side effects**: Pure functions that parse and validate URLs
 * - **Error Handling**: Custom error type (URLParseError) propagates via Effect's error channel
 * - **Testability**: All operations return Effect; easily tested with Effect.runSync
 *
 * Example:
 * ```typescript
 * // Parse a GitHub URL
 * const info = Effect.runSync(parseGitHubUrl('vuejs-ai/awesome-vue'))
 *
 * // With error handling
 * const effect = Effect.match(parseGitHubUrl(url), {
 *   onSuccess: info => info.normalized,
 *   onFailure: error => console.error(error.message)
 * })
 * ```
 */

import { Effect } from 'effect'

/**
 * URLParseError — GitHub URL does not match expected formats.
 */
export class URLParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'URLParseError'
  }
}

/**
 * Branded type representing a validated, normalized GitHub URL.
 */
export type NormalizedURL = string & { readonly __brand: 'NormalizedURL' }

/**
 * Metadata about a parsed and normalized GitHub URL.
 */
export interface URLInfo {
  /** The original URL as provided by the user */
  raw: string
  /** Normalized GitHub HTTPS URL (lowercase domain, no .git suffix, no trailing slash) */
  normalized: NormalizedURL
  /** GitHub organization or user name */
  owner: string
  /** Repository name */
  repo: string
  /** How the URL was provided (https, ssh, or shorthand) */
  format: 'https' | 'ssh' | 'shorthand'
}

/**
 * Parse and normalize a GitHub URL in a single operation.
 *
 * Supports multiple formats:
 * - Full HTTPS: https://github.com/owner/repo
 * - Shorthand: owner/repo
 * - SSH: git@github.com:owner/repo
 * - With .git suffix: any of the above with .git at the end
 *
 * All formats are normalized to canonical HTTPS form:
 * https://github.com/owner/repo (lowercase domain)
 *
 * @param raw — GitHub URL in any supported format
 * @returns Effect that succeeds with URLInfo if valid, fails with URLParseError if invalid
 *
 * @example
 * ```typescript
 * // Success case
 * const info = Effect.runSync(parseGitHubUrl('vuejs-ai/awesome-vue'))
 * // info.normalized === 'https://github.com/vuejs-ai/awesome-vue'
 *
 * // Error case
 * const effect = Effect.match(parseGitHubUrl('invalid'), {
 *   onSuccess: () => 'ok',
 *   onFailure: error => error.message
 * })
 * ```
 */
export function parseGitHubUrl(raw: string): Effect.Effect<URLInfo, URLParseError> {
  const input = raw.trim()

  // Reject empty input
  if (!input) {
    return Effect.fail(new URLParseError('URL cannot be empty. Supported formats: https://github.com/owner/repo, owner/repo, git@github.com:owner/repo'))
  }

  // Remove trailing .git suffix if present
  const withoutGit = input.endsWith('.git') ? input.slice(0, -4) : input

  // Remove trailing slashes
  const normalized = withoutGit.replace(/\/$/, '')

  // Case 1: SSH format (git@github.com:owner/repo)
  if (normalized.startsWith('git@')) {
    return parseSshUrl(raw, normalized)
  }

  // Case 2: HTTPS format (https://github.com/owner/repo)
  if (normalized.toLowerCase().startsWith('https://') || normalized.toLowerCase().startsWith('http://')) {
    return parseHttpsUrl(raw, normalized)
  }

  // Case 3: Shorthand (owner/repo)
  if (!normalized.includes('://')) {
    return parseShorthand(raw, normalized)
  }

  return Effect.fail(new URLParseError(`Unable to parse URL: ${raw}`))
}

/**
 * Parse SSH format: git@github.com:owner/repo
 */
function parseSshUrl(raw: string, normalized: string): Effect.Effect<URLInfo, URLParseError> {
  // Match: git@github.com:owner/repo
  const match = normalized.match(/^git@github\.com:([^/]+)\/([^/]+)$/)

  if (!match) {
    return Effect.fail(new URLParseError(`Invalid SSH format: ${raw}. Expected: git@github.com:owner/repo`))
  }

  const owner = match[1]
  const repo = match[2]

  if (!isValidOwnerOrRepo(owner) || !isValidOwnerOrRepo(repo)) {
    return Effect.fail(new URLParseError(`Invalid owner or repo name in: ${raw}`))
  }

  return Effect.succeed({
    raw,
    normalized: `https://github.com/${owner}/${repo}` as NormalizedURL,
    owner,
    repo,
    format: 'ssh',
  })
}

/**
 * Parse HTTPS format: https://github.com/owner/repo
 */
function parseHttpsUrl(raw: string, normalized: string): Effect.Effect<URLInfo, URLParseError> {
  // Normalize to lowercase for domain matching
  const lowerNormalized = normalized.toLowerCase()

  // Match: https://github.com/owner/repo (case-insensitive domain)
  const match = lowerNormalized.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/)

  if (!match) {
    return Effect.fail(new URLParseError(`Invalid HTTPS format: ${raw}. Expected: https://github.com/owner/repo`))
  }

  const owner = match[1]
  const repo = match[2]

  if (!isValidOwnerOrRepo(owner) || !isValidOwnerOrRepo(repo)) {
    return Effect.fail(new URLParseError(`Invalid owner or repo name in: ${raw}`))
  }

  return Effect.succeed({
    raw,
    normalized: `https://github.com/${owner}/${repo}` as NormalizedURL,
    owner,
    repo,
    format: 'https',
  })
}

/**
 * Parse shorthand format: owner/repo
 */
function parseShorthand(raw: string, normalized: string): Effect.Effect<URLInfo, URLParseError> {
  const parts = normalized.split('/')

  if (parts.length !== 2) {
    return Effect.fail(new URLParseError(`Invalid shorthand format: ${raw}. Expected: owner/repo`))
  }

  const [owner, repo] = parts

  if (!isValidOwnerOrRepo(owner) || !isValidOwnerOrRepo(repo)) {
    return Effect.fail(new URLParseError(`Invalid owner or repo name in: ${raw}`))
  }

  return Effect.succeed({
    raw,
    normalized: `https://github.com/${owner}/${repo}` as NormalizedURL,
    owner,
    repo,
    format: 'shorthand',
  })
}

/**
 * Validate GitHub owner or repo name: alphanumerics, hyphens and dots, no leading/trailing hyphens or dots.
 */
function isValidOwnerOrRepo(name: string): boolean {
  if (!name || name.length === 0) {
    return false
  }

  // Must not start or end with hyphen or dot
  if (name.startsWith('-') || name.startsWith('.') || name.endsWith('-') || name.endsWith('.')) {
    return false
  }

  // Can contain alphanumerics, hyphens, dots
  if (!/^[\d.a-z-]+$/i.test(name)) {
    return false
  }

  return true
}

/**
 * Derive upstream key from a parsed GitHub URL (owner name).
 *
 * Example: https://github.com/vuejs-ai/awesome-vue → 'vuejs-ai'
 *
 * @param url — Normalized GitHub URL
 * @returns Effect that succeeds with owner name, fails if URL is invalid
 *
 * @example
 * ```typescript
 * const key = Effect.runSync(deriveUpstreamKey('https://github.com/vuejs-ai/awesome-vue'))
 * // key === 'vuejs-ai'
 * ```
 */
export function deriveUpstreamKey(url: string): Effect.Effect<string, URLParseError> {
  const normalized = url.trim().toLowerCase().replace(/\/$/, '')

  // Match: https://github.com/owner/repo
  const match = normalized.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/)

  if (!match) {
    return Effect.fail(new URLParseError(`Unable to derive upstream key from: ${url}`))
  }

  const owner = match[1]

  if (!isValidOwnerOrRepo(owner)) {
    return Effect.fail(new URLParseError(`Invalid owner name: ${owner}`))
  }

  return Effect.succeed(owner)
}
