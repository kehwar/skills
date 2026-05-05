/**
 * lib/ — Focused modules that power the scripts.
 *
 * Each module has a single responsibility and clear interface.
 * Import from ../index.ts facade instead of importing modules directly.
 *
 * Modules:
 * - gitOps.ts — Git plumbing (exec, getGitSha, submoduleExists)
 * - submoduleOps.ts — Git submodule lifecycle management
 * - metadataOps.ts — meta.json serialization
 * - skillOps.ts — Skill file operations (copying, hashing)
 * - skillDiscovery.ts — Discovering skills by SKILL.md presence
 * - urlOps.ts — URL normalization for GitHub repos
 *
 * Tests:
 * - skillDiscovery.test.ts — Comprehensive tests for skill discovery
 * - (other tests in ../index.test.ts for backward compatibility)
 */
