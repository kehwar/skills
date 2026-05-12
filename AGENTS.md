## Agent orientation

### Before exploring, read these

- **`CONTEXT.md`** at the repo root — the shared domain glossary and language for this project
- **`docs/adr/`** — read ADRs that touch the area you're about to work in
- **`ISSUE_TRACKER.md`** — read the issue tracker guidelines before creating or working on issues

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront.

### File structure

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-first-decision.md
│   └── 0002-another-decision.md
└── src/
```

### Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

### Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_

## Key locations

- `meta.json` — declared Upstreams (url, branch, optional skill selections). The authoritative config.
- `authored/` — Authored skills organized by domain (e.g., `authored/engineering/`, `authored/frappe/`, `authored/sap/`). Each skill has a `meta.json` with `type: "authored"`.
- `skills/` — flat directory of synced skills from upstreams. Each subfolder has a `meta.json` with `type: "synced"`.
- `upstream/` — read-only Upstream submodules. Never edit files here.
- `scripts/` — **⚠️ DEPRECATED — Dead code**. Do not reference or add new functionality here.

## Creating Authored Skills

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

## Updating Authored Skills

Check the skill's `authored/<domain>/<skill-name>/meta.json`:

- `type: "authored"` → safe to edit, will never be overwritten. The skill is located in `authored/{domain}/` where domain can be `engineering`, `frappe`, `sap`, `typst`, or other project-specific domains.
- `type: "synced"` → managed by Sync; edits will be lost on next `pnpm sync` run.

## After making code changes

Run both checks before considering work done:

```
pnpm typecheck  # verify TypeScript types
pnpm lint:fix   # auto-fix style issues
```

Fix any remaining errors that `lint:fix` could not auto-resolve.
