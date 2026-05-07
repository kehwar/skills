# ADR-0001: Use Git Submodules for Upstream Repositories

**Status**: Accepted
**Date**: 2026-05-05

## Context

The Skills repo tracks 13 upstream repositories (`frappe`, `erpnext`, `antfu`, etc.) that serve two purposes:

1. **Read-only references** for authoring new skills
2. **Skill copy sources** for the Sync process to pull selected skills into `skills/`

### Constraints

We must satisfy three competing requirements:

1. **IDE Visibility**: The `upstream/` folder cannot be gitignored because VS Code's `file_search` tool ignores gitignored files, breaking agent code navigation.

2. **Reproducibility**: The repo must be reproducible with `git clone && pnpm sync` — developers should land at known upstream commit states, not whatever `main` branch points to today.

3. **Clean Git History**: Upstream file changes must not pollute this repo's commit history. When frappe updates with hundreds of file changes, we must not see those as unstaged changes in `git status`.

These constraints are mutually exclusive without a mechanism to track working files separately from git-tracked changes.

## Decision

**Use Git submodules** to manage upstream repositories.

Submodules elegantly satisfy all three constraints:

- **IDE Visibility**: `upstream/` folders are present and searchable locally, not gitignored
- **Reproducibility**: `.gitmodules` and `.gitattributes` pin exact commits; `git clone` + `git submodule update` lands you at declared states
- **Clean History**: Submodule objects point to commits without tracking individual file changes; upstream updates appear as single-line commit references

## Alternatives Considered

### 1. Simple Git Clones + Meta.json Pinning

Pin upstream SHAs in `meta.json`, then script-driven `git checkout <sha>`:

- ✅ Simpler config (one source of truth)
- ✅ Full script control
- ❌ **Fails constraint #3**: Hundreds of upstream files would show as unstaged changes

### 2. Git `--skip-worktree`

Use `git update-index --skip-worktree upstream/*` to hide changes:

- ✅ Satisfies all constraints
- ❌ Less discoverable than submodules (no `.gitmodules` to document intent)
- ❌ Requires per-folder manual setup
- ❌ Lost if `.git/index` is reset

### 3. Gitignore `upstream/` + Alternative Search Tools

Use `semantic_search` or `grep_search --includeIgnoredFiles`:

- ❌ **Fails constraint #1**: Breaks IDE native file_search

## Consequences

### Positive

- Upstream repos tracked explicitly in `.gitmodules`
- Clear reproduction path: `git clone && git submodule update --recursive`
- CI/CD can reliably fetch known upstream states
- Each skill's source upstream is traceable in git history

### Negative

- Developers must understand `git submodule` semantics
- Potential for detached HEAD states if they check out other branches
- Merge conflicts in `.gitmodules` possible (rare, but unfamiliar to many)
- Shallow cloning (`--depth 1`) works with submodules but requires explicit configuration

### Mitigation

- Document common submodule workflows in README (clone, fetch, update)
- Sync script (`pnpm sync`) automates all updates; developers rarely interact directly
- Pre-commit hooks or documentation should warn against manual checkouts

## Implementation Notes

- Upstreams added with `--depth 1` for shallow clones (reduces clone time)
- Branch tracking configured in `.gitmodules` for version-pinned upstreams (e.g., `frappe:version-15`)
- `pnpm sync` handles all submodule operations; developers use `pnpm sync` not `git submodule`
- `.gitmodules` is committed; submodule SHAs float per commit
