import type { Result, UpstreamMeta } from '../types.ts'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { discoverSkills } from './skill-discovery.ts'
import { copySkillsFromUpstream, hashSkillDirectory } from './skill-ops.ts'
import { ensureSubmodule } from './submodule-ops.ts'

/**
 * Orchestration input for syncing one upstream.
 * Scripts (sync.ts, upstream.ts) are responsible for:
 * - Validating/normalizing URLs
 * - Determining which skills to sync (from user input or config)
 * - Handling authored/ symlinks and other side effects
 *
 * The orchestrator only cares about: ensure upstream exists, discover what's
 * there, compute what changed, and copy selected skills.
 */
export interface SyncOrchestratorInput {
  root: string
  upstreamName: string
  upstreamConfig: UpstreamMeta
  /** skillPath → outputName (from config.skills or user selection) */
  selectedSkills: Record<string, string>
  /** Allow re-copying even if skills unchanged */
  force?: boolean
}

/**
 * Orchestration output: detailed results for each phase.
 * Scripts use this to log progress and decisions.
 */
export interface SyncOrchestratorOutput {
  upstreamName: string
  submoduleEnsured: boolean
  discoveredSkills: Array<{ path: string, hash: string }>
  syncResult: {
    synced: Array<{ skillPath: string, outputName: string }>
    skipped: Array<{ skillPath: string, outputName: string, reason: string }>
    errors: Array<{ skillPath: string, outputName: string, error: string }>
  }
}

/**
 * Internal context threaded through all phases.
 * Each phase reads what it needs, writes what it changes.
 */
interface OrchestratorContext extends SyncOrchestratorInput {
  upstreamPath: string
  discoveredSkills: Array<{ path: string, hash?: string }>
  syncResult?: {
    synced: Array<{ skillPath: string, outputName: string }>
    skipped: Array<{ skillPath: string, outputName: string, reason: string }>
    errors: Array<{ skillPath: string, outputName: string, error: string }>
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 1: Ensure Submodule
// ─────────────────────────────────────────────────────────────────────────

function ensureSubmodulePhase(context: OrchestratorContext): Result<OrchestratorContext> {
  const submodulePath = path.join('upstream', context.upstreamName)
  const result = ensureSubmodule(context.root, submodulePath, context.upstreamConfig.url, context.upstreamConfig.branch)

  if (!result.ok) {
    return {
      ok: false,
      error: `Failed to ensure submodule ${context.upstreamName}: ${result.error}`,
    }
  }

  const upstreamPath = path.join(context.root, submodulePath)
  if (!existsSync(upstreamPath)) {
    return {
      ok: false,
      error: `Submodule directory does not exist after ensure: ${upstreamPath}`,
    }
  }

  return {
    ok: true,
    data: { ...context, upstreamPath },
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 2: Discover Skills
// ─────────────────────────────────────────────────────────────────────────

function discoverSkillsPhase(context: OrchestratorContext): Result<OrchestratorContext> {
  if (!existsSync(context.upstreamPath)) {
    return {
      ok: false,
      error: `Upstream path does not exist: ${context.upstreamPath}`,
    }
  }

  const discoverResult = discoverSkills(context.upstreamPath)
  if (!discoverResult.ok) {
    return {
      ok: false,
      error: `Failed to discover skills in ${context.upstreamName}: ${discoverResult.error}`,
    }
  }

  // Convert Skill[] to { path, hash? }[] (hashes added in next phase)
  const discovered = discoverResult.data.map(skill => ({ path: skill.path }))

  return {
    ok: true,
    data: { ...context, discoveredSkills: discovered },
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 3: Compute Hashes for Discovered Skills
// ─────────────────────────────────────────────────────────────────────────

function hashSkillsPhase(context: OrchestratorContext): Result<OrchestratorContext> {
  const discovered = context.discoveredSkills.map(skill => ({
    path: skill.path,
    hash: hashSkillDirectory(
      skill.path === '.'
        ? context.upstreamPath
        : path.join(context.upstreamPath, skill.path),
    ),
  }))

  return {
    ok: true,
    data: { ...context, discoveredSkills: discovered },
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 4: Copy Selected Skills
// ─────────────────────────────────────────────────────────────────────────

function copySelectedSkillsPhase(context: OrchestratorContext): Result<OrchestratorContext> {
  const copyResult = copySkillsFromUpstream(
    context.upstreamName,
    context.upstreamPath,
    context.upstreamConfig,
    context.root,
    context.force,
  )

  if (!copyResult.ok) {
    return {
      ok: false,
      error: `Failed to copy skills from ${context.upstreamName}: ${copyResult.error}`,
    }
  }

  return {
    ok: true,
    data: {
      ...context,
      syncResult: copyResult.data,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Orchestrator Runner
// ─────────────────────────────────────────────────────────────────────────

interface RunOptions {
  /** Called after each phase succeeds. For logging, CI hooks, etc. */
  onPhaseSuccess?: (phaseName: string, result: OrchestratorContext) => void
  /** Called if a phase fails. Orchestration stops. */
  onPhaseFailed?: (phaseName: string, error: string) => void
}

type Phase = (context: OrchestratorContext) => Result<OrchestratorContext>

const PHASES: Array<{ name: string, fn: Phase }> = [
  { name: 'ensure-submodule', fn: ensureSubmodulePhase },
  { name: 'discover-skills', fn: discoverSkillsPhase },
  { name: 'hash-skills', fn: hashSkillsPhase },
  { name: 'copy-selected', fn: copySelectedSkillsPhase },
]

/**
 * Run the full sync orchestration for one upstream.
 *
 * @param input Upstream config, selected skills, root path
 * @param options Hooks for progress reporting
 * @returns Final output with discovered skills and sync results
 */
export function runSyncOrchestrator(
  input: SyncOrchestratorInput,
  options?: RunOptions,
): Result<SyncOrchestratorOutput> {
  let context: OrchestratorContext = {
    ...input,
    upstreamPath: '', // will be set by phase 1
    discoveredSkills: [],
  }

  for (const { name, fn } of PHASES) {
    const result = fn(context)

    if (!result.ok) {
      options?.onPhaseFailed?.(name, result.error)
      return { ok: false, error: result.error }
    }

    context = result.data
    options?.onPhaseSuccess?.(name, context)
  }

  // Ensure syncResult is populated (it should be after phase 4, but be defensive)
  if (!context.syncResult) {
    return {
      ok: false,
      error: 'Internal error: sync result not populated',
    }
  }

  // All skills should have hashes after phase 3 (hash-skills)
  const discoveredWithHashes = context.discoveredSkills.map(s => ({
    path: s.path,
    hash: s.hash ?? '',
  }))

  return {
    ok: true,
    data: {
      upstreamName: context.upstreamName,
      submoduleEnsured: true,
      discoveredSkills: discoveredWithHashes,
      syncResult: context.syncResult,
    },
  }
}

/**
 * Partial runner: execute orchestration up to a specific phase.
 * Useful for dry-runs, testing, or conditional workflows.
 *
 * @param input Upstream config, selected skills, root path
 * @param upToPhase Execute phases up to and including this name
 * @param options Hooks for progress reporting
 */
export function runSyncOrchestratorPartial(
  input: SyncOrchestratorInput,
  upToPhase: string,
  options?: RunOptions,
): Result<SyncOrchestratorOutput> {
  let context: OrchestratorContext = {
    ...input,
    upstreamPath: '',
    discoveredSkills: [],
  }

  let lastPhaseName = ''

  for (const { name, fn } of PHASES) {
    const result = fn(context)

    if (!result.ok) {
      options?.onPhaseFailed?.(name, result.error)
      return { ok: false, error: result.error }
    }

    context = result.data
    options?.onPhaseSuccess?.(name, context)
    lastPhaseName = name

    if (name === upToPhase) {
      break
    }
  }

  // Cast to required hashes (may be undefined if stopped before hash phase)
  const discoveredWithHashes = context.discoveredSkills.map(s => ({
    path: s.path,
    hash: s.hash ?? '',
  }))

  return {
    ok: true,
    data: {
      upstreamName: context.upstreamName,
      submoduleEnsured: lastPhaseName !== 'ensure-submodule' || context.upstreamPath !== '',
      discoveredSkills: discoveredWithHashes,
      syncResult: context.syncResult ?? { synced: [], skipped: [], errors: [] },
    },
  }
}
