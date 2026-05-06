import type { Result } from '../types.ts'

/**
 * Custom error class for URL parsing failures.
 * Provides structured error handling with context about what failed and why.
 */
export class URLParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'URLParseError'
  }
}

/**
 * Branded type representing a validated, normalized GitHub URL.
 * Callers can pass NormalizedURL to functions that require valid URLs,
 * preventing accidental use of un-validated user input.
 */
export type NormalizedURL = string & { readonly __brand: 'NormalizedURL' }

/**
 * Metadata about a parsed and normalized GitHub URL.
 * Extracted from the URL to avoid re-parsing in call sites.
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
  /** How the URL was provided (https or ssh) */
  format: 'https' | 'ssh'
}

/**
 * Parse and normalize a GitHub URL in a single operation.
 * Supports multiple formats:
 * - Full HTTPS: https://github.com/owner/repo
 * - Shorthand: owner/repo
 * - SSH: git@github.com:owner/repo
 * - With .git suffix: any of the above with .git at the end
 *
 * All formats are normalized to canonical HTTPS form:
 * https://github.com/owner/repo (lowercase domain)
 *
 * Returns a strong NormalizedURL type to prevent accidental use of invalid URLs.
 */
export function parseAndNormalizeUrl(raw: string): Result<URLInfo> {
  const input = raw.trim()

  // Reject empty input
  if (!input) {
    return {
      ok: false,
      error: 'URL cannot be empty. Supported formats: https://github.com/owner/repo, owner/repo, git@github.com:owner/repo',
    }
  }

  // Remove trailing .git suffix if present
  const withoutGit = input.endsWith('.git') ? input.slice(0, -4) : input

  // Remove trailing slashes
  const normalized = withoutGit.replace(/\/$/, '')

  // Case 1: SSH format (git@github.com:owner/repo)
  if (normalized.startsWith('git@')) {
    return parseSshUrl(normalized)
  }

  // Case 2: HTTPS format (https://github.com/owner/repo)
  if (normalized.startsWith('https://')) {
    return parseHttpsUrl(normalized)
  }

  // Case 3: Shorthand (owner/repo)
  if (!normalized.includes('://')) {
    return parseShorthand(normalized)
  }

  // Unsupported format
  return {
    ok: false,
    error: `Invalid URL format "${input}". Supported: https://github.com/owner/repo, owner/repo, git@github.com:owner/repo`,
  }
}

/**
 * Parse HTTPS URL format: https://github.com/owner/repo
 */
function parseHttpsUrl(url: string): Result<URLInfo> {
  // Check for HTTPS specifically (not HTTP)
  if (!url.startsWith('https://')) {
    return {
      ok: false,
      error: `URL must use https (not http). Got: ${url}`,
    }
  }

  // Lowercase the domain part, preserve case in path
  const afterProtocol = url.slice(8) // 'https://'.length
  const slashIndex = afterProtocol.indexOf('/')

  if (slashIndex === -1) {
    return {
      ok: false,
      error: `URL must have org/repo structure. Got: ${url}`,
    }
  }

  const domain = afterProtocol.slice(0, slashIndex).toLowerCase()
  const path = afterProtocol.slice(slashIndex + 1)

  // Only GitHub is supported
  if (domain !== 'github.com') {
    return {
      ok: false,
      error: `Only GitHub URLs are supported. Got domain: ${domain}`,
    }
  }

  // Parse owner/repo
  const parts = path.split('/').filter(p => p.length > 0)
  if (parts.length < 2) {
    return {
      ok: false,
      error: `URL must have org/repo structure. Got: ${url}`,
    }
  }

  const owner = parts[0]
  const repo = parts[1]

  const canonicalUrl = `https://github.com/${owner}/${repo}` as NormalizedURL

  return {
    ok: true,
    data: {
      raw: url,
      normalized: canonicalUrl,
      owner,
      repo,
      format: 'https',
    },
  }
}

/**
 * Parse SSH format: git@github.com:owner/repo
 */
function parseSshUrl(url: string): Result<URLInfo> {
  // Format: git@HOST:OWNER/REPO
  const atIndex = url.indexOf('@')
  const colonIndex = url.indexOf(':')

  if (atIndex === -1 || colonIndex === -1 || colonIndex < atIndex) {
    return {
      ok: false,
      error: `Invalid SSH URL format. Expected: git@github.com:owner/repo, got: ${url}`,
    }
  }

  const host = url.slice(atIndex + 1, colonIndex).toLowerCase()
  const path = url.slice(colonIndex + 1)

  // Only GitHub is supported
  if (host !== 'github.com') {
    return {
      ok: false,
      error: `Only GitHub URLs are supported. Got host: ${host}`,
    }
  }

  // Parse owner/repo
  const parts = path.split('/').filter(p => p.length > 0)
  if (parts.length < 2) {
    return {
      ok: false,
      error: `URL must have org/repo structure. Got: ${url}`,
    }
  }

  const owner = parts[0]
  const repo = parts[1]

  const canonicalUrl = `https://github.com/${owner}/${repo}` as NormalizedURL

  return {
    ok: true,
    data: {
      raw: url,
      normalized: canonicalUrl,
      owner,
      repo,
      format: 'ssh',
    },
  }
}

/**
 * Parse shorthand format: owner/repo
 */
function parseShorthand(url: string): Result<URLInfo> {
  const parts = url.split('/').filter(p => p.length > 0)

  if (parts.length !== 2) {
    return {
      ok: false,
      error: `Shorthand format must be "owner/repo". Got: ${url}`,
    }
  }

  const owner = parts[0]
  const repo = parts[1]

  const canonicalUrl = `https://github.com/${owner}/${repo}` as NormalizedURL

  return {
    ok: true,
    data: {
      raw: url,
      normalized: canonicalUrl,
      owner,
      repo,
      format: 'https', // Shorthand expands to HTTPS
    },
  }
}
