/**
 * FileSystem — Effect-based wrappers around Node.js filesystem APIs.
 *
 * ## Dependency Injection Pattern
 *
 * This module demonstrates the DI pattern for effect-based services:
 * - **Service Interface**: Provides read/write operations compatible with Node's `fs` module
 * - **Error Handling**: Custom error types (NotFound, PermissionDenied, IOError) propagate via Effect's error channel
 * - **Testability**: Services use Effect for composable error handling; tests run with Effect.runSync
 *
 * Example:
 * ```typescript
 * // In an orchestrator:
 * const content = Effect.runSync(readFile('/path/to/file.txt'))
 *
 * // With error handling:
 * pipe(
 *   readFile('/path/to/file.txt'),
 *   Effect.catch(NotFound, () => 'default content'),
 *   Effect.runSync
 * )
 * ```
 *
 * ## Error Handling
 *
 * All operations return `Effect<T, E>` where:
 * - `T` is the success value (string, void, boolean, string[])
 * - `E` is the error type (NotFound, PermissionDenied, IOError, never)
 *
 * Errors are encoded in the Effect type; they propagate naturally through composition.
 */

import * as fs from 'node:fs'
import { Effect } from 'effect'

/**
 * NotFound — File or directory does not exist (ENOENT).
 */
export class NotFound extends Error {
  constructor(path: string) {
    super(`File not found: ${path}`)
    this.name = 'NotFound'
  }
}

/**
 * PermissionDenied — Access denied (EACCES, EPERM).
 */
export class PermissionDenied extends Error {
  constructor(path: string) {
    super(`Permission denied: ${path}`)
    this.name = 'PermissionDenied'
  }
}

/**
 * IOError — Other filesystem errors (EIO, EISDIR, etc.).
 */
export class IOError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IOError'
  }
}

/**
 * Read content from a file.
 *
 * @param path — File path to read
 * @param encoding — Text encoding (default: 'utf-8')
 * @returns Effect that reads the file and returns its content as string
 * @throws NotFound if file does not exist
 * @throws PermissionDenied if access denied
 * @throws IOError for other filesystem errors
 *
 * @example
 * ```typescript
 * // Success case
 * const content = Effect.runSync(readFile('/etc/hosts'))
 *
 * // With error handling
 * pipe(
 *   readFile('/nonexistent'),
 *   Effect.catch(NotFound, () => 'default content'),
 *   Effect.runSync
 * )
 * ```
 */
export function readFile(path: string, encoding: BufferEncoding = 'utf8'): Effect.Effect<string, NotFound | PermissionDenied | IOError> {
  return Effect.try({
    try: () => fs.readFileSync(path, encoding),
    catch: (error) => {
      if (error instanceof Error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'ENOENT') {
          return new NotFound(path)
        }
        if (code === 'EACCES' || code === 'EPERM') {
          return new PermissionDenied(path)
        }
      }
      return new IOError(`Failed to read file: ${path}`)
    },
  })
}

/**
 * Write content to a file.
 *
 * Creates the file if it doesn't exist; overwrites if it does.
 *
 * @param path — File path to write to
 * @param content — File content as string
 * @returns Effect that writes the file
 * @throws PermissionDenied if access denied
 * @throws IOError for other filesystem errors
 *
 * @example
 * ```typescript
 * // Write to file
 * Effect.runSync(writeFile('/tmp/config.json', JSON.stringify(config)))
 *
 * // With error handling
 * pipe(
 *   writeFile('/readonly/file.txt', 'data'),
 *   Effect.catch(PermissionDenied, () => console.log('Cannot write')),
 *   Effect.runSync
 * )
 * ```
 */
export function writeFile(path: string, content: string): Effect.Effect<void, PermissionDenied | IOError> {
  return Effect.try({
    try: () => {
      fs.writeFileSync(path, content, 'utf8')
    },
    catch: (error) => {
      if (error instanceof Error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'EACCES' || code === 'EPERM') {
          return new PermissionDenied(path)
        }
      }
      return new IOError(`Failed to write file: ${path}`)
    },
  })
}

/**
 * Create a directory.
 *
 * @param path — Directory path to create
 * @param recursive — If true, create parent directories as needed
 * @returns Effect that creates the directory
 * @throws PermissionDenied if access denied
 * @throws IOError for other filesystem errors
 *
 * @example
 * ```typescript
 * // Create single directory
 * Effect.runSync(mkdir('/tmp/mydir'))
 *
 * // Create nested directories
 * Effect.runSync(mkdir('/tmp/a/b/c', true))
 * ```
 */
export function mkdir(path: string, recursive = false): Effect.Effect<void, PermissionDenied | IOError> {
  return Effect.try({
    try: () => {
      fs.mkdirSync(path, { recursive })
    },
    catch: (error) => {
      if (error instanceof Error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'EACCES' || code === 'EPERM') {
          return new PermissionDenied(path)
        }
      }
      return new IOError(`Failed to create directory: ${path}`)
    },
  })
}

/**
 * Check if a file or directory exists.
 *
 * @param path — Path to check
 * @returns Effect that returns true if path exists, false otherwise
 *
 * @example
 * ```typescript
 * const fileExists = Effect.runSync(exists('/etc/hosts'))
 * ```
 */
export function exists(path: string): Effect.Effect<boolean, never> {
  return Effect.sync(() => {
    try {
      fs.accessSync(path)
      return true
    }
    catch {
      return false
    }
  })
}

/**
 * Read directory contents.
 *
 * Returns an array of filenames and directory names in the given directory.
 *
 * @param path — Directory path to read
 * @returns Effect that returns array of entry names
 * @throws NotFound if directory does not exist
 * @throws IOError for other filesystem errors
 *
 * @example
 * ```typescript
 * const entries = Effect.runSync(readDirectory('/tmp'))
 * // entries: ['file1.txt', 'subdir', ...]
 * ```
 */
export function readDirectory(path: string): Effect.Effect<string[], NotFound | IOError> {
  return Effect.try({
    try: () => fs.readdirSync(path),
    catch: (error) => {
      if (error instanceof Error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'ENOENT') {
          return new NotFound(path)
        }
      }
      return new IOError(`Failed to read directory: ${path}`)
    },
  })
}

/**
 * Remove a file or directory.
 *
 * @param path — Path to remove
 * @param recursive — If true, remove directory and its contents recursively
 * @returns Effect that removes the path
 * @throws IOError if removal fails
 *
 * @example
 * ```typescript
 * // Remove file
 * Effect.runSync(remove('/tmp/file.txt'))
 *
 * // Remove directory recursively
 * Effect.runSync(remove('/tmp/mydir', true))
 * ```
 */
export function remove(path: string, recursive = false): Effect.Effect<void, IOError> {
  return Effect.try({
    try: () => {
      const stat = fs.statSync(path)
      if (stat.isDirectory()) {
        fs.rmSync(path, { recursive })
      }
      else {
        fs.unlinkSync(path)
      }
    },
    catch: () => {
      return new IOError(`Failed to remove: ${path}`)
    },
  })
}

/**
 * Copy a file from source to destination.
 *
 * @param source — Source file path
 * @param destination — Destination file path
 * @returns Effect that copies the file
 * @throws NotFound if source does not exist
 * @throws IOError for other filesystem errors
 *
 * @example
 * ```typescript
 * Effect.runSync(copy('/tmp/source.txt', '/tmp/dest.txt'))
 * ```
 */
export function copy(
  source: string,
  destination: string,
): Effect.Effect<void, NotFound | IOError> {
  return Effect.try({
    try: () => {
      fs.copyFileSync(source, destination)
    },
    catch: (error) => {
      if (error instanceof Error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'ENOENT') {
          return new NotFound(source)
        }
      }
      return new IOError(`Failed to copy file from ${source} to ${destination}`)
    },
  })
}

/**
 * Create a symbolic link.
 *
 * @param target — Target path (what the link points to)
 * @param path — Link path to create
 * @returns Effect that creates the symlink
 * @throws IOError if symlink creation fails
 *
 * @example
 * ```typescript
 * Effect.runSync(symlink('/real/path', '/link/path'))
 * ```
 */
export function symlink(target: string, path: string): Effect.Effect<void, IOError> {
  return Effect.try({
    try: () => {
      fs.symlinkSync(target, path)
    },
    catch: () => {
      return new IOError(`Failed to create symlink: ${path}`)
    },
  })
}

/**
 * Copy a directory recursively from source to destination.
 *
 * @param source — Source directory path
 * @param destination — Destination directory path
 * @param options — Optional configuration object
 * @param options.force — If true, overwrite existing destination (default: false)
 * @returns Effect that copies the directory recursively
 * @throws IOError if copy fails
 *
 * @example
 * ```typescript
 * Effect.runSync(recursiveCopy('/tmp/source', '/tmp/destination', { force: true }))
 * ```
 */
export function recursiveCopy(
  source: string,
  destination: string,
  options: { force?: boolean } = {},
): Effect.Effect<void, IOError> {
  return Effect.try({
    try: () => {
      fs.cpSync(source, destination, { recursive: true, force: options.force ?? false })
    },
    catch: () => {
      return new IOError(`Failed to recursively copy from ${source} to ${destination}`)
    },
  })
}
