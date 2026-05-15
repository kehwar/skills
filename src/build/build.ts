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
  warnings: string[]
}

interface PluginManifest {
  name: string
  skills: string[]
}

interface SkillEntry {
  relativePath: string
  name: string
}

async function scanAuthored(root: string): Promise<SkillEntry[]> {
  const authoredDirectory = path.join(root, 'authored')
  const entries: SkillEntry[] = []

  let domainEntries: Dirent[]
  try {
    domainEntries = await fs.readdir(authoredDirectory, { withFileTypes: true })
  }
  catch {
    return entries
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
      .map(entry => entry.name)
      .toSorted((a, b) => a.localeCompare(b))

    for (const skill of skills) {
      entries.push({
        relativePath: `./authored/${domain}/${skill}`,
        name: skill,
      })
    }
  }

  return entries
}

async function scanSynced(root: string): Promise<SkillEntry[]> {
  const syncedDirectory = path.join(root, 'synced')
  const entries: SkillEntry[] = []

  let skillEntries: Dirent[]
  try {
    skillEntries = await fs.readdir(syncedDirectory, { withFileTypes: true })
  }
  catch {
    return entries
  }

  const skills = skillEntries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .toSorted((a, b) => a.localeCompare(b))

  for (const skill of skills) {
    entries.push({
      relativePath: `./synced/${skill}`,
      name: skill,
    })
  }

  return entries
}

function deduplicateWithWarning(authored: SkillEntry[], synced: SkillEntry[]): { skills: SkillEntry[], warnings: string[] } {
  const seen = new Map<string, SkillEntry>()
  const warnings: string[] = []

  for (const entry of authored) {
    seen.set(entry.name, entry)
  }

  for (const entry of synced) {
    if (seen.has(entry.name)) {
      const existing = seen.get(entry.name)!
      warnings.push(`Name collision: "${entry.name}" exists in both "${existing.relativePath}" and "${entry.relativePath}". Taking "${existing.relativePath}".`)
    }
    else {
      seen.set(entry.name, entry)
    }
  }

  const skills = [...seen.values()].toSorted((a, b) => {
    const nameCompare = a.name.localeCompare(b.name)
    if (nameCompare !== 0) {
      return nameCompare
    }
    return a.relativePath.localeCompare(b.relativePath)
  })

  return { skills, warnings }
}

async function writeManifest(root: string, manifest: PluginManifest): Promise<void> {
  const directory = path.join(root, '.claude-plugin')
  await fs.mkdir(directory, { recursive: true })
  const manifestPath = path.join(directory, 'plugin.json')
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`)
}

export function build(input: BuildInput): Effect.Effect<BuildOutput, never> {
  return Effect.tryPromise(async () => {
    const authored = await scanAuthored(input.root)
    const synced = await scanSynced(input.root)
    const { skills, warnings } = deduplicateWithWarning(authored, synced)

    const manifest: PluginManifest = {
      name: 'kehwar-skills',
      skills: skills.map(s => s.relativePath),
    }

    await writeManifest(input.root, manifest)

    const message = `Generated plugin.json with ${skills.length} skill(s)`
    return { exitCode: 0, message, warnings }
  }).pipe(
    Effect.catchAll((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      return Effect.succeed({ exitCode: 1, message: `Build failed: ${message}`, warnings: [] })
    }),
  )
}
