/**
 * Tracer Bullet: Write Skill Orchestrator Tests
 *
 * Tests the full skill creation workflow using Effect orchestration:
 * - Validate skill name and domain
 * - Create skill folder
 * - Write meta.json with proper structure
 * - Create SKILL.md template
 * - Link to authored/{domain}/ directory via symlink
 */

import type { SkillMeta } from '../types.js'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'
import { writeSkillOrchestrator } from './write-skill.js'

let testCounter = 0

describe('writeSkillOrchestrator', () => {
  let tempDir: string

  // Create a temp directory for testing
  const createTempDir = (): string => {
    testCounter += 1
    const temp = path.join('/tmp', `write-skill-test-${Date.now()}-${testCounter}`)
    return temp
  }

  // Clean up after each test
  const cleanup = () => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  }

  afterEach(cleanup)

  it('should create a skill with domain in authored/ directory (tracer bullet)', async () => {
    // Arrange
    tempDir = createTempDir()
    const skillsDir = path.join(tempDir, 'skills')
    const authoredDir = path.join(tempDir, 'authored')

    const input = {
      skillName: 'test-skill',
      domain: 'testing',
      sourceUrl: undefined,
      root: tempDir,
    }

    // Act: Run orchestrator
    const effect = writeSkillOrchestrator(input)
    const result = await Effect.runPromise(effect)

    // Assert: Output structure correct
    expect(result).toBeDefined()
    expect(result.skillName).toBe('test-skill')
    expect(result.domain).toBe('testing')
    expect(result.symlinked).toBe(true)

    // Assert: Skill folder created
    const skillPath = path.join(skillsDir, 'test-skill')
    expect(existsSync(skillPath)).toBe(true)

    // Assert: meta.json written with correct structure
    const metaPath = path.join(skillPath, 'meta.json')
    expect(existsSync(metaPath)).toBe(true)
    const metaContent = JSON.parse(readFileSync(metaPath, 'utf8')) as SkillMeta
    expect(metaContent.type).toBe('authored')
    if (metaContent.type === 'authored') {
      expect(metaContent.domain).toBe('testing')
    }

    // Assert: SKILL.md template created
    const skillMdPath = path.join(skillPath, 'SKILL.md')
    expect(existsSync(skillMdPath)).toBe(true)
    const skillMdContent = readFileSync(skillMdPath, 'utf8')
    expect(skillMdContent).toContain('name: test-skill')

    // Assert: Symlink created in authored/testing/
    const symlinkPath = path.join(authoredDir, 'testing', 'test-skill')
    expect(existsSync(symlinkPath)).toBe(true)
  })

  it('should reject invalid skill names', async () => {
    // Arrange
    tempDir = createTempDir()

    const invalidNames = ['MySkill', 'my skill', 'skill@123', '-invalid', 'invalid-']
    for (const invalidName of invalidNames) {
      // Act
      const effect = writeSkillOrchestrator({
        skillName: invalidName,
        domain: undefined,
        sourceUrl: undefined,
        root: tempDir,
      })

      // Assert: Should fail with ValidationError
      const result = await Effect.runPromise(
        Effect.match(effect, {
          onSuccess: () => 'success',
          onFailure: (error: unknown) => error,
        }),
      )

      expect(result).not.toBe('success')
      expect(result).toBeInstanceOf(Error)
    }
  })

  it('should reject when skill already exists', async () => {
    // Arrange
    tempDir = createTempDir()
    const skillsDir = path.join(tempDir, 'skills')

    // Pre-create skill folder
    const skillPath = path.join(skillsDir, 'existing-skill')
    const fs = await import('node:fs')
    fs.mkdirSync(skillPath, { recursive: true })

    // Act: Try to create same skill
    const effect = writeSkillOrchestrator({
      skillName: 'existing-skill',
      domain: undefined,
      sourceUrl: undefined,
      root: tempDir,
    })

    // Assert: Should fail
    const result = await Effect.runPromise(
      Effect.match(effect, {
        onSuccess: () => 'success',
        onFailure: (error: unknown) => error,
      }),
    )

    expect(result).not.toBe('success')
    expect(result).toBeInstanceOf(Error)
    if (result instanceof Error) {
      expect(result.message).toContain('exists')
    }
  })

  it('should reject invalid domain names', async () => {
    // Arrange
    tempDir = createTempDir()

    const invalidDomains = ['MyDomain', 'domain name', 'domain@123', '-domain', 'domain-']
    for (const invalidDomain of invalidDomains) {
      // Act
      const effect = writeSkillOrchestrator({
        skillName: 'my-skill',
        domain: invalidDomain,
        sourceUrl: undefined,
        root: tempDir,
      })

      // Assert: Should fail with ValidationError
      const result = await Effect.runPromise(
        Effect.match(effect, {
          onSuccess: () => 'success',
          onFailure: (error: unknown) => error,
        }),
      )

      expect(result).not.toBe('success')
    }
  })

  it('should create skill without domain (flat structure)', async () => {
    // Arrange
    tempDir = createTempDir()
    const skillsDir = path.join(tempDir, 'skills')

    const input = {
      skillName: 'flat-skill',
      domain: undefined,
      sourceUrl: undefined,
      root: tempDir,
    }

    // Act
    const effect = writeSkillOrchestrator(input)
    const result = await Effect.runPromise(effect)

    // Assert
    expect(result.skillName).toBe('flat-skill')
    expect(result.domain).toBeUndefined()
    expect(result.symlinked).toBe(false)

    // Skill folder created
    const skillPath = path.join(skillsDir, 'flat-skill')
    expect(existsSync(skillPath)).toBe(true)

    // No symlink created
    const authoredDir = path.join(tempDir, 'authored')
    const shouldNotExist = path.join(authoredDir, 'flat-skill')
    expect(existsSync(shouldNotExist)).toBe(false)
  })

  it('should include sourceUrl in meta.json when provided', async () => {
    // Arrange
    tempDir = createTempDir()
    const skillsDir = path.join(tempDir, 'skills')

    const input = {
      skillName: 'sourced-skill',
      domain: 'external',
      sourceUrl: 'https://github.com/user/repo/path/to/skill',
      root: tempDir,
    }

    // Act
    const effect = writeSkillOrchestrator(input)
    await Effect.runPromise(effect)

    // Assert: meta.json contains sourceUrl
    const metaPath = path.join(skillsDir, 'sourced-skill', 'meta.json')
    const metaContent = JSON.parse(readFileSync(metaPath, 'utf8')) as SkillMeta
    if (metaContent.type === 'authored') {
      expect(metaContent.sourceUrl).toBe('https://github.com/user/repo/path/to/skill')
    }
  })
})
