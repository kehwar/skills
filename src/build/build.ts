import type { Dirent } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { Effect } from 'effect'

export interface BuildInput {
  root: string
}

export interface BuildOutput {
  exitCode: number
  message?: string
}

interface PluginEntry {
  source: string
  name: string
  skills: string[]
}

interface MarketplaceManifest {
  plugins: PluginEntry[]
}

async function scanAuthored(root: string): Promise<MarketplaceManifest> {
  const authoredDirectory = path.join(root, 'authored')
  const plugins: PluginEntry[] = []

  let domainEntries: Dirent[]
  try {
    domainEntries = await fs.readdir(authoredDirectory, { withFileTypes: true })
  }
  catch {
    return { plugins: [] }
  }

  const domains = domainEntries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .toSorted((a, b) => a.localeCompare(b))

  for (const domain of domains) {
    const domainPath = path.join(authoredDirectory, domain)
    const skillEntries = await fs.readdir(domainPath, { withFileTypes: true })
    const skills = skillEntries
      .filter(entry => entry.isDirectory())
      .map(entry => `./${entry.name}`)
      .toSorted((a, b) => a.localeCompare(b))

    if (skills.length > 0) {
      plugins.push({
        source: `./authored/${domain}`,
        name: domain,
        skills,
      })
    }
  }

  return { plugins }
}

async function ensureClaudePluginDirectory(root: string): Promise<void> {
  const directory = path.join(root, '.claude-plugin')
  await fs.mkdir(directory, { recursive: true })
}

async function writeManifest(root: string, manifest: MarketplaceManifest): Promise<void> {
  await ensureClaudePluginDirectory(root)
  const manifestPath = path.join(root, '.claude-plugin', 'marketplace.json')
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`)
}

export function build(input: BuildInput): Effect.Effect<BuildOutput, never> {
  return Effect.tryPromise(async () => {
    const manifest = await scanAuthored(input.root)
    await writeManifest(input.root, manifest)
    return { exitCode: 0, message: 'Manifest generated' }
  }).pipe(
    Effect.catchAll((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      return Effect.succeed({ exitCode: 1, message: `Build failed: ${message}` })
    }),
  )
}
