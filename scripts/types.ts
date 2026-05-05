export interface UpstreamMeta {
  /** GitHub HTTPS clone URL */
  url: string
  /** Branch to track. Omit to use the repo default. */
  branch?: string
  /**
   * Selected skills to copy into skills/: path-within-submodule → output skill name.
   * Omit or leave empty for reference-only upstreams.
   */
  skills?: Record<string, string>
  /**
   * All skills found in the upstream at last sync.
   * Maps path-within-submodule → sha256 content hash (first 12 chars).
   * Updated on every sync regardless of selection.
   */
  available?: Record<string, string>
  /** Commit SHA of the upstream at last sync. */
  gitSha?: string
}

export interface Meta {
  /** All tracked upstream repos. Submoduled under upstream/<key>. */
  upstreams: Record<string, UpstreamMeta>
}

/** Written as meta.json inside each skill folder. */
export type SkillMeta
  = | { type: 'authored', domain?: string, sourceUrl?: string }
    | {
      type: 'synced'
      upstream: string
      sourceUrl: string
      branch?: string
      skillPath: string
      gitSha: string
      contentHash: string
      syncedAt: string
    }

/**
 * Result type for git command execution.
 * Simplifies error handling in lib functions.
 */
export type ExecResult
  = { ok: true, output: string }
    | { ok: false, error: string, code?: number }

/**
 * Generic result type for lib operations.
 * Allows functions to return structured success/failure info.
 */
export interface OperationResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
  count?: number
  skipped?: number
}
