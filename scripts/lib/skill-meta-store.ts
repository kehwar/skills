import type { Result, SkillMeta } from '../types.ts'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export interface SkillMetaStoreOptions {
  onWarning?: (message: string) => void
}

export class SkillMetaStore {
  private skillsDirectory: string
  private skills: Map<string, SkillMeta>
  private original: Map<string, SkillMeta>
  private onWarning: (message: string) => void

  constructor(skillsDirectory: string, options?: SkillMetaStoreOptions) {
    this.skillsDirectory = skillsDirectory
    this.onWarning = options?.onWarning ?? (() => {})
    this.skills = new Map()
    this.original = new Map()
    this.loadAllSkills()
  }

  private loadAllSkills(): void {
    if (!existsSync(this.skillsDirectory)) {
      return
    }

    const entries = readdirSync(this.skillsDirectory, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }

      const skillName = entry.name
      const metaPath = path.join(this.skillsDirectory, skillName, 'meta.json')

      if (!existsSync(metaPath)) {
        this.onWarning(`Skill '${skillName}' is missing meta.json`)
        continue
      }

      try {
        const content = readFileSync(metaPath, 'utf8')
        const meta = JSON.parse(content) as SkillMeta
        this.skills.set(skillName, meta)
        this.original.set(skillName, this.cloneMeta(meta))
      }
      catch (error) {
        this.onWarning(`Failed to load meta.json for skill '${skillName}': ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  private cloneMeta(meta: SkillMeta): SkillMeta {
    return structuredClone(meta)
  }

  readAllSkills(): Record<string, SkillMeta> {
    const result: Record<string, SkillMeta> = {}
    for (const [name, meta] of this.skills.entries()) {
      result[name] = meta
    }
    return result
  }

  getSkillMeta(skillName: string): SkillMeta | undefined {
    return this.skills.get(skillName)
  }

  addSkill(skillName: string, meta: SkillMeta): void {
    if (this.skills.has(skillName)) {
      throw new Error(`Skill already exists: ${skillName}`)
    }

    this.skills.set(skillName, meta)
  }

  updateSkill(skillName: string, partial: Partial<SkillMeta>): void {
    const existing = this.skills.get(skillName)
    if (!existing) {
      throw new Error(`Skill not found: ${skillName}`)
    }

    this.skills.set(skillName, {
      ...existing,
      ...partial,
    } as SkillMeta)
  }

  hasChanges(): boolean {
    if (this.skills.size !== this.original.size) {
      return true
    }

    for (const [name, meta] of this.skills.entries()) {
      const original = this.original.get(name)
      if (!original || JSON.stringify(meta) !== JSON.stringify(original)) {
        return true
      }
    }

    return false
  }

  saveSkill(skillName: string): Result<void> {
    const meta = this.skills.get(skillName)
    if (!meta) {
      return {
        ok: false,
        error: `Skill not found: ${skillName}`,
      }
    }

    try {
      const skillPath = path.join(this.skillsDirectory, skillName)
      mkdirSync(skillPath, { recursive: true })
      const metaPath = path.join(skillPath, 'meta.json')
      writeFileSync(metaPath, `${JSON.stringify(meta, undefined, 2)}\n`)
      this.original.set(skillName, this.cloneMeta(meta))
      return { ok: true, data: undefined }
    }
    catch (error) {
      return {
        ok: false,
        error: `Failed to save skill meta for '${skillName}': ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  saveAll(): Result<void> {
    try {
      for (const skillName of this.skills.keys()) {
        if (JSON.stringify(this.skills.get(skillName)) !== JSON.stringify(this.original.get(skillName))) {
          const result = this.saveSkill(skillName)
          if (!result.ok)
            return result
        }
      }
      return { ok: true, data: undefined }
    }
    catch (error) {
      return {
        ok: false,
        error: `Failed to save skills: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }
}
