import { describe, expect, it } from 'vitest'
import { MockFileSystem } from './mock-fs.js'

describe('mockFileSystem', () => {
  it('should read back data that was written', () => {
    const fs = new MockFileSystem()
    const testPath = '/test/file.txt'
    const testContent = 'Hello, World!'

    fs.writeFileSync(testPath, testContent)
    const result = fs.readFileSync(testPath, 'utf8')

    expect(result).toBe(testContent)
  })
})
