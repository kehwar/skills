import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export function isCalledDirectly(importMetaUrl: string): boolean {
  const __filename = fileURLToPath(importMetaUrl)
  const mainModule = process.argv[1]
  return mainModule !== undefined && path.resolve(__filename) === path.resolve(mainModule)
}
