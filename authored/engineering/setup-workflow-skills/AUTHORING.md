# setup-workflow-skills

Sourced from: `upstream/mattpocock/skills/engineering/setup-matt-pocock-skills/`

## Customizations for this repo

**Simplified workflow:**
- Issue tracker doc lives at repo root as `ISSUE_TRACKER.md` (from `issue-tracker.md` template)
- Domain guidance (context reading rules) is inlined directly into `AGENTS.md`/`CLAUDE.md` as the `## Agent orientation` block
- No `docs/agents/` directory needed

**Agent orientation templates:**
- Two templates: `domain-single-context.md` and `domain-multi-context.md`
- Each is a complete `## Agent orientation` block (with subsections like "Before exploring" and "File structure")
- Skill detects whether repo is single or multi-context, then copies the appropriate template directly to `AGENTS.md`/`CLAUDE.md`

**Beads integration:**
- Auto-detects Beads CLI; installs it if missing; runs `bd init` if project not initialized
- All three happen in the write phase—no manual setup needed
- `issue-tracker.md` seed template documents Beads-focused conventions

**When syncing from upstream:**
If the upstream skill changes, preserve these customizations:
- Keep the simplified approach (ISSUE_TRACKER.md at root, domain guidance inlined in AGENTS.md)
- Keep the two domain template files (not in `docs/agents/`)
- Preserve auto-detection and auto-install/init logic in write phase
- Keep Beads-only approach (don't re-add issue tracker selection)
