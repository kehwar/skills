/**
 * Validation — Effect-based validation for skill names, domain names, and git branch names.
 *
 * ## Dependency Injection Pattern
 *
 * This module demonstrates pure validation logic using Effect:
 * - **No side effects**: Pure functions that validate inputs
 * - **Error Handling**: Custom error type (ValidationError) propagates via Effect's error channel
 * - **Testability**: All operations return Effect; easily tested with Effect.runSync
 *
 * Example:
 * ```typescript
 * // Success case
 * const result = Effect.runSync(validateSkillName('my-skill'))
 * // result is undefined (void)
 *
 * // Error case
 * const effect = Effect.match(validateSkillName('MY-SKILL'), {
 *   onSuccess: () => 'valid',
 *   onFailure: error => error.message
 * })
 * const message = Effect.runSync(effect)
 * ```
 */

import { Effect } from 'effect'

/**
 * ValidationError — Input does not meet validation rules.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

/**
 * Validate skill name: lowercase alphanumeric with hyphens, no leading/trailing/consecutive hyphens.
 *
 * Rules:
 * - Must be non-empty
 * - Only lowercase letters, numbers, and hyphens
 * - Must not start or end with hyphen
 * - Must not have consecutive hyphens
 *
 * Valid examples: 'vue', 'frappe-app', 'dev-log-123'
 *
 * @param name — Skill name to validate
 * @returns Effect that succeeds (void) if valid, fails with ValidationError if invalid
 *
 * @example
 * ```typescript
 * // Success
 * Effect.runSync(validateSkillName('my-skill')) // void
 *
 * // Failure
 * Effect.match(validateSkillName('MY-SKILL'), {
 *   onSuccess: () => 'ok',
 *   onFailure: error => error.message // "Skill name must be lowercase..."
 * })
 * ```
 */
export function validateSkillName(name: string): Effect.Effect<void, ValidationError> {
  // Check non-empty
  if (!name || name.length === 0) {
    return Effect.fail(new ValidationError('Skill name cannot be empty'))
  }

  // Check lowercase only
  if (name !== name.toLowerCase()) {
    return Effect.fail(new ValidationError('Skill name must be lowercase letters, numbers, and hyphens only'))
  }

  // Check valid characters (lowercase letters, numbers, hyphens)
  if (!/^[\da-z-]+$/.test(name)) {
    return Effect.fail(new ValidationError('Skill name must contain only lowercase letters, numbers, and hyphens'))
  }

  // Check doesn't start or end with hyphen
  if (name.startsWith('-') || name.endsWith('-')) {
    return Effect.fail(new ValidationError('Skill name must not start or end with a hyphen'))
  }

  // Check no consecutive hyphens
  if (name.includes('--')) {
    return Effect.fail(new ValidationError('Skill name must not contain consecutive hyphens'))
  }

  // All checks passed
  return Effect.void
}

/**
 * Validate domain name: same rules as skill name.
 *
 * Rules:
 * - Must be non-empty
 * - Only lowercase letters, numbers, and hyphens
 * - Must not start or end with hyphen
 * - Must not have consecutive hyphens
 *
 * Valid examples: 'frappe', 'sap', 'engineering'
 *
 * @param name — Domain name to validate
 * @returns Effect that succeeds (void) if valid, fails with ValidationError if invalid
 */
export function validateDomainName(name: string): Effect.Effect<void, ValidationError> {
  // Check non-empty
  if (!name || name.length === 0) {
    return Effect.fail(new ValidationError('Domain name cannot be empty'))
  }

  // Check lowercase only
  if (name !== name.toLowerCase()) {
    return Effect.fail(new ValidationError('Domain name must be lowercase letters, numbers, and hyphens only'))
  }

  // Check valid characters (lowercase letters, numbers, hyphens)
  if (!/^[\da-z-]+$/.test(name)) {
    return Effect.fail(new ValidationError('Domain name must contain only lowercase letters, numbers, and hyphens'))
  }

  // Check doesn't start or end with hyphen
  if (name.startsWith('-') || name.endsWith('-')) {
    return Effect.fail(new ValidationError('Domain name must not start or end with a hyphen'))
  }

  // Check no consecutive hyphens
  if (name.includes('--')) {
    return Effect.fail(new ValidationError('Domain name must not contain consecutive hyphens'))
  }

  // All checks passed
  return Effect.void
}

/**
 * Validate git branch name according to git naming rules.
 *
 * Rules:
 * - Must be non-empty
 * - Must not start with hyphen or dot
 * - Must not contain consecutive dots (..)
 * - Must not end with .lock
 * - Can contain alphanumerics, hyphens, underscores, dots, slashes
 *
 * Valid examples: 'main', 'develop', 'feature/my-feature', 'release-1.0'
 *
 * @param name — Branch name to validate
 * @returns Effect that succeeds (void) if valid, fails with ValidationError if invalid
 */
export function validateBranchName(name: string): Effect.Effect<void, ValidationError> {
  // Check non-empty
  if (!name || name.length === 0) {
    return Effect.fail(new ValidationError('Branch name cannot be empty'))
  }

  // Check doesn't start with hyphen or dot
  if (name.startsWith('-') || name.startsWith('.')) {
    return Effect.fail(new ValidationError('Branch name must not start with hyphen or dot'))
  }

  // Check no consecutive dots
  if (name.includes('..')) {
    return Effect.fail(new ValidationError('Branch name must not contain consecutive dots'))
  }

  // Check doesn't end with .lock
  if (name.endsWith('.lock')) {
    return Effect.fail(new ValidationError('Branch name must not end with .lock'))
  }

  // Check valid characters (alphanumerics, hyphens, underscores, dots, slashes)
  if (!/^[\w./-]+$/.test(name)) {
    return Effect.fail(new ValidationError('Branch name contains invalid characters'))
  }

  // All checks passed
  return Effect.void
}
