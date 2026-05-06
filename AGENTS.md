## Agent orientation

Always read `CONTEXT.md` for domain language before making changes.
Always read `ISSUE_TRACKER.md` when working on a feature or bug fix.

### Key locations

- `meta.json` — declared Upstreams (url, branch, optional skill selections). The authoritative config.
- `skills/` — flat directory of all skills consumed by agents. Each subfolder has a `meta.json` with `type: "authored" | "synced"`.
- `upstream/` — read-only Upstream submodules. Never edit files here.
- `authored/` — symlinks to Authored and Source-Derived skills for navigation only.
- `scripts/` — all automation: `sync.ts`, `upstream.ts`, `check.ts`, `cleanup.ts`.

### Creating Authored Skills

To scaffold a new authored skill:

1. **Gather context** (optional but encouraged):
   - Determine the skill's domain (e.g., `frappe`, `sap`) if any. Flat skills have no domain.
   - Identify the upstream source or webpage the skill draws from.

2. **Scaffold with write-skill**:
   ```bash
   pnpm write-skill <skill-name> [--domain <domain>]
   ```
   This bootstraps the skill structure (SKILL.md, meta.json, etc.).

3. **Use `write-a-skill-with-instructions` skill** for development.

### Updating Authored Skills

Check its `skills/<name>/meta.json`:
- `type: "authored"` → safe to edit, will never be overwritten. Optional `domain` field groups skills by domain (e.g., `frappe`, `sap`) in `authored/{domain}/ `; skills without domain remain flat in `authored/`.
- `type: "synced"` → managed by Sync; edits will be lost on next `pnpm sync`

### After making code changes

Run both checks before considering work done:

```
pnpm typecheck  # verify TypeScript types
pnpm lint:fix   # auto-fix style issues
```

Fix any remaining errors that `lint:fix` could not auto-resolve.
