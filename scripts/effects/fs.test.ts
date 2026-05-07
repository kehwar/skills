import * as fs from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'
import { Effect, pipe } from 'effect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  copy,
  exists,
  mkdir,
  NotFound,
  readDir, // eslint-disable-line unicorn/prevent-abbreviations -- readDir is the standard name
  readFile,
  remove,
  symlink,
  writeFile,
} from './fs.js'

describe('fs.readFile', () => {
  // eslint-disable-next-line unicorn/prevent-abbreviations -- tempDir is standard naming for temporary directories
  let tempDir: string

  beforeEach(() => {
    // Create a temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-test-'))
  })

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('should read content from an existing file', () => {
    // Arrange: write test file
    const testFile = path.join(tempDir, 'test.txt')
    const testContent = 'Hello, Effect!'
    fs.writeFileSync(testFile, testContent)

    // Act: call readFile as Effect
    const effect = readFile(testFile)
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBe(testContent)
  })

  it('should return NotFound error when file does not exist', () => {
    // Arrange
    const nonexistentFile = path.join(tempDir, 'nonexistent.txt')

    // Act & Assert: catch the error
    const effect = pipe(
      readFile(nonexistentFile),
      Effect.match({
        onSuccess: () => 'unexpected success',
        onFailure: error => error,
      }),
    )
    const result = Effect.runSync(effect)

    // Assert: error is NotFound
    expect(result).toBeInstanceOf(NotFound)
    if (result instanceof NotFound) {
      expect(result.message).toContain('File not found')
    }
  })

  it('should read file with custom encoding', () => {
    // Arrange: write test file
    const testFile = path.join(tempDir, 'utf8.txt')
    const testContent = 'こんにちは' // Japanese text
    fs.writeFileSync(testFile, testContent, 'utf8')

    // Act
    const effect = readFile(testFile, 'utf8')
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBe(testContent)
  })
})

describe('fs.writeFile', () => {
  // eslint-disable-next-line unicorn/prevent-abbreviations -- tempDir is standard naming for temporary directories
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('should write content to a file', () => {
    // Arrange
    const testFile = path.join(tempDir, 'write-test.txt')
    const testContent = 'Hello, writeFile!'

    // Act
    const effect = writeFile(testFile, testContent)
    Effect.runSync(effect)

    // Assert: file exists and has correct content
    const result = fs.readFileSync(testFile, 'utf8')
    expect(result).toBe(testContent)
  })

  it('should overwrite existing file', () => {
    // Arrange
    const testFile = path.join(tempDir, 'overwrite.txt')
    fs.writeFileSync(testFile, 'original')

    // Act
    const newContent = 'overwritten'
    const effect = writeFile(testFile, newContent)
    Effect.runSync(effect)

    // Assert
    const result = fs.readFileSync(testFile, 'utf8')
    expect(result).toBe(newContent)
  })
})

describe('fs.mkdir', () => {
  // eslint-disable-next-line unicorn/prevent-abbreviations -- tempDir is standard naming for temporary directories
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('should create a directory', () => {
    // Arrange
    // eslint-disable-next-line unicorn/prevent-abbreviations -- testDir is standard naming for test directories
    const testDir = path.join(tempDir, 'newdir')

    // Act
    const effect = mkdir(testDir)
    Effect.runSync(effect)

    // Assert
    expect(fs.existsSync(testDir)).toBe(true)
    expect(fs.statSync(testDir).isDirectory()).toBe(true)
  })

  it('should create nested directories with recursive option', () => {
    // Arrange
    // eslint-disable-next-line unicorn/prevent-abbreviations -- testDir is standard naming for test directories
    const testDir = path.join(tempDir, 'a', 'b', 'c')

    // Act
    const effect = mkdir(testDir, true)
    Effect.runSync(effect)

    // Assert
    expect(fs.existsSync(testDir)).toBe(true)
    expect(fs.statSync(testDir).isDirectory()).toBe(true)
  })
})

describe('fs.exists', () => {
  // eslint-disable-next-line unicorn/prevent-abbreviations -- tempDir is standard naming for temporary directories
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('should return true if file exists', () => {
    // Arrange
    const testFile = path.join(tempDir, 'exists.txt')
    fs.writeFileSync(testFile, 'content')

    // Act
    const effect = exists(testFile)
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBe(true)
  })

  it('should return false if file does not exist', () => {
    // Arrange
    const testFile = path.join(tempDir, 'nonexistent.txt')

    // Act
    const effect = exists(testFile)
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toBe(false)
  })
})

describe('fs.readDir', () => {
  // eslint-disable-next-line unicorn/prevent-abbreviations -- tempDir is standard naming for temporary directories
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('should read directory contents', () => {
    // Arrange
    fs.writeFileSync(path.join(tempDir, 'file1.txt'), 'a')
    fs.writeFileSync(path.join(tempDir, 'file2.txt'), 'b')
    fs.mkdirSync(path.join(tempDir, 'subdir'))

    // Act
    const effect = readDir(tempDir)
    const result = Effect.runSync(effect)

    // Assert
    expect(result.sort()).toEqual(['file1.txt', 'file2.txt', 'subdir'].sort())
  })

  it('should return empty array for empty directory', () => {
    // Act
    const effect = readDir(tempDir)
    const result = Effect.runSync(effect)

    // Assert
    expect(result).toEqual([])
  })

  it('should return NotFound error for nonexistent directory', () => {
    // Arrange
    // eslint-disable-next-line unicorn/prevent-abbreviations -- nonexistentDir is standard naming for test directories
    const nonexistentDir = path.join(tempDir, 'nonexistent')

    // Act & Assert
    const effect = pipe(
      readDir(nonexistentDir),
      Effect.match({
        onSuccess: () => 'unexpected success',
        onFailure: error => error,
      }),
    )
    const result = Effect.runSync(effect)

    expect(result).toBeInstanceOf(NotFound)
  })
})

describe('fs.remove', () => {
  // eslint-disable-next-line unicorn/prevent-abbreviations -- tempDir is standard naming for temporary directories
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('should remove a file', () => {
    // Arrange
    const testFile = path.join(tempDir, 'remove.txt')
    fs.writeFileSync(testFile, 'content')

    // Act
    const effect = remove(testFile)
    Effect.runSync(effect)

    // Assert
    expect(fs.existsSync(testFile)).toBe(false)
  })

  it('should remove a directory recursively', () => {
    // Arrange
    // eslint-disable-next-line unicorn/prevent-abbreviations -- testDir is standard naming for test directories
    const testDir = path.join(tempDir, 'removedir')
    fs.mkdirSync(testDir)
    fs.writeFileSync(path.join(testDir, 'file.txt'), 'content')

    // Act
    const effect = remove(testDir, true)
    Effect.runSync(effect)

    // Assert
    expect(fs.existsSync(testDir)).toBe(false)
  })
})

describe('fs.copy', () => {
  // eslint-disable-next-line unicorn/prevent-abbreviations -- tempDir is standard naming for temporary directories
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('should copy a file', () => {
    // Arrange
    const source = path.join(tempDir, 'source.txt')
    const destination = path.join(tempDir, 'dest.txt')
    const content = 'copied content'
    fs.writeFileSync(source, content)

    // Act
    const effect = copy(source, destination)
    Effect.runSync(effect)

    // Assert
    expect(fs.existsSync(destination)).toBe(true)
    expect(fs.readFileSync(destination, 'utf8')).toBe(content)
  })

  it('should return NotFound when source does not exist', () => {
    // Arrange
    const source = path.join(tempDir, 'nonexistent.txt')
    const destination = path.join(tempDir, 'dest.txt')

    // Act & Assert
    const effect = pipe(
      copy(source, destination),
      Effect.match({
        onSuccess: () => 'unexpected',
        onFailure: error => error,
      }),
    )
    const result = Effect.runSync(effect)

    expect(result).toBeInstanceOf(NotFound)
  })
})

describe('fs.symlink', () => {
  // eslint-disable-next-line unicorn/prevent-abbreviations -- tempDir is standard naming for temporary directories
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('should create a symbolic link', () => {
    // Arrange
    const target = path.join(tempDir, 'target.txt')
    const link = path.join(tempDir, 'link.txt')
    fs.writeFileSync(target, 'target content')

    // Act
    const effect = symlink(target, link)
    Effect.runSync(effect)

    // Assert
    expect(fs.existsSync(link)).toBe(true)
    expect(fs.readFileSync(link, 'utf8')).toBe('target content')
  })
})
