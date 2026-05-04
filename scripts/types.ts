export interface VendorSkillMeta {
  /** GitHub HTTPS clone URL */
  source: string
  /** Selected skills: path-within-submodule → output skill name in skills/ */
  skills: Record<string, string>
  /**
   * All skills found in the vendor repo at last sync.
   * Maps path-within-submodule → sha256 of folder contents (first 12 chars).
   * Updated on every sync regardless of selection. Used to detect upstream changes.
   */
  available: Record<string, string>
}

export interface Meta {
  /** Raw documentation repos. Submoduled under sources/<name>. */
  sources: Record<string, string>
  /** Pre-built skill repos. Submoduled under vendor/<name>. */
  vendors: Record<string, VendorSkillMeta>
  /** Manually authored skills in skills/. Never overwritten by sync. */
  manual: string[]
}
