## Agent orientation

Read `CONTEXT.md` for domain language before making changes.

### Key locations

- `meta.json` — declared Upstreams (url, branch, optional skill selections). The authoritative config.
- `skills/` — flat directory of all skills consumed by agents. Each subfolder has a `meta.json` with `type: "authored" | "synced"`.
- `upstream/` — read-only Upstream submodules. Never edit files here.
- `authored/` — symlinks to Authored and Source-Derived skills for navigation only.
- `scripts/` — all automation: `sync.ts`, `upstream.ts`, `check.ts`, `cleanup.ts`.
- `instructions/` — optional authoring guidance organized by domain or skill name. Agents read these when scaffolding new skills.

### Before touching a skill

Check its `skills/<name>/meta.json`:
- `type: "authored"` → safe to edit, will never be overwritten. Optional `domain` field groups skills by domain (e.g., `frappe`, `sap`) in `authored/{domain}/ `; skills without domain remain flat in `authored/`.
- `type: "synced"` → managed by Sync; edits will be lost on next `pnpm sync`

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

### After making code changes

Run both checks before considering work done:

```
pnpm typecheck  # verify TypeScript types
pnpm lint:fix   # auto-fix style issues
```

Fix any remaining errors that `lint:fix` could not auto-resolve.

### Domain docs

Single-context — `CONTEXT.md` at repo root.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
