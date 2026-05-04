export interface VendorSkillMeta {
  /** GitHub HTTPS clone URL */
  source: string
  /** Map of path-within-submodule to output skill name in skills/ */
  skills: Record<string, string>
}

export interface Meta {
  /** Raw documentation repos. Submoduled under sources/<name>. */
  sources: Record<string, string>
  /** Pre-built skill repos. Submoduled under vendor/<name>. */
  vendors: Record<string, VendorSkillMeta>
  /** Manually authored skills in skills/. Never overwritten by sync. */
  manual: string[]
}
