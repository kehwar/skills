import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { validateBranchName, validateDomainName, validateSkillName, ValidationError } from './validation.js'

describe('validateSkillName', () => {
  it('should accept valid skill names (lowercase alphanumeric with hyphens)', () => {
    // Arrange
    const validNames = [
      'vue',
      'frappe-app',
      'sap-di-api-expert',
      'dev-log',
      'tdd',
      'my-cool-skill-123',
    ]

    // Act & Assert: each should succeed
    for (const name of validNames) {
      const effect = validateSkillName(name)
      const result = Effect.runSync(effect)
      expect(result).toBeUndefined() // Success is void
    }
  })

  it('should reject uppercase letters', () => {
    // Arrange
    const invalidName = 'MySkill'

    // Act
    const effect = Effect.match(validateSkillName(invalidName), {
      onSuccess: () => 'success',
      onFailure: error => error,
    })
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBeInstanceOf(ValidationError)
    if (result instanceof ValidationError) {
      expect(result.message).toContain('lowercase')
    }
  })

  it('should reject names with spaces or special characters', () => {
    // Arrange
    const invalidNames = ['my skill', 'skill@123', 'skill_name', 'skill.name']

    // Act & Assert
    for (const name of invalidNames) {
      const effect = Effect.match(validateSkillName(name), {
        onSuccess: () => 'success',
        onFailure: error => error,
      })
      const result = Effect.runSync(effect)

      expect(result).toBeInstanceOf(ValidationError)
    }
  })

  it('should reject names that start or end with hyphens', () => {
    // Arrange
    const invalidNames = ['-skill', 'skill-', '-skill-']

    // Act & Assert
    for (const name of invalidNames) {
      const effect = Effect.match(validateSkillName(name), {
        onSuccess: () => 'success',
        onFailure: error => error,
      })
      const result = Effect.runSync(effect)

      expect(result).toBeInstanceOf(ValidationError)
    }
  })

  it('should reject empty names', () => {
    // Arrange
    const invalidName = ''

    // Act
    const effect = Effect.match(validateSkillName(invalidName), {
      onSuccess: () => 'success',
      onFailure: error => error,
    })
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBeInstanceOf(ValidationError)
  })

  it('should reject names with consecutive hyphens', () => {
    // Arrange
    const invalidName = 'my--skill'

    // Act
    const effect = Effect.match(validateSkillName(invalidName), {
      onSuccess: () => 'success',
      onFailure: error => error,
    })
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBeInstanceOf(ValidationError)
  })
})

describe('validateDomainName', () => {
  it('should accept valid domain names (same rules as skill names)', () => {
    // Arrange
    const validNames = ['frappe', 'sap', 'engineering', 'acme-corp']

    // Act & Assert
    for (const name of validNames) {
      const effect = validateDomainName(name)
      const result = Effect.runSync(effect)
      expect(result).toBeUndefined()
    }
  })

  it('should reject uppercase letters', () => {
    // Arrange
    const invalidName = 'Frappe'

    // Act
    const effect = Effect.match(validateDomainName(invalidName), {
      onSuccess: () => 'success',
      onFailure: error => error,
    })
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBeInstanceOf(ValidationError)
  })

  it('should reject empty names', () => {
    // Arrange
    const invalidName = ''

    // Act
    const effect = Effect.match(validateDomainName(invalidName), {
      onSuccess: () => 'success',
      onFailure: error => error,
    })
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBeInstanceOf(ValidationError)
  })
})

describe('validateBranchName', () => {
  it('should accept valid git branch names', () => {
    // Arrange
    const validNames = [
      'main',
      'develop',
      'feature/my-feature',
      'bugfix/issue-123',
      'release-1.0.0',
      'v1.0',
      'feature_underscore',
    ]

    // Act & Assert
    for (const name of validNames) {
      const effect = validateBranchName(name)
      const result = Effect.runSync(effect)
      expect(result).toBeUndefined()
    }
  })

  it('should reject names starting with hyphen or dot', () => {
    // Arrange
    const invalidNames = ['-branch', '.branch']

    // Act & Assert
    for (const name of invalidNames) {
      const effect = Effect.match(validateBranchName(name), {
        onSuccess: () => 'success',
        onFailure: error => error,
      })
      const result = Effect.runSync(effect)

      expect(result).toBeInstanceOf(ValidationError)
    }
  })

  it('should reject names with consecutive dots', () => {
    // Arrange
    const invalidName = 'feature..name'

    // Act
    const effect = Effect.match(validateBranchName(invalidName), {
      onSuccess: () => 'success',
      onFailure: error => error,
    })
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBeInstanceOf(ValidationError)
  })

  it('should reject names ending with .lock', () => {
    // Arrange
    const invalidName = 'feature.lock'

    // Act
    const effect = Effect.match(validateBranchName(invalidName), {
      onSuccess: () => 'success',
      onFailure: error => error,
    })
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBeInstanceOf(ValidationError)
  })

  it('should reject empty names', () => {
    // Arrange
    const invalidName = ''

    // Act
    const effect = Effect.match(validateBranchName(invalidName), {
      onSuccess: () => 'success',
      onFailure: error => error,
    })
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBeInstanceOf(ValidationError)
  })
})
