# setup-workflow-skills

Sourced from: `upstream/mattpocock/skills/engineering/setup-matt-pocock-skills/`

## Customizations for this repo

**Beads-only workflow:**
- Removed "Which issue tracker?" decision (Section A). Always uses Beads.
- Removed triage label vocabulary (Section B). No triage labels in this workflow.
- Auto-detects Beads CLI; installs it if missing; runs `bd init` if project not initialized.
- All three happen in the write phase—no manual setup needed.

**Domain docs templates:**
- Split domain consumer rules into two templates: single-context and multi-context
- Seeds are in `domain-single-context.md` and `domain-multi-context.md`
- Agent copies the appropriate template to `docs/agents/domain.md` based on user choice

**Beads integration:**
- Seed template: `issue-tracker-beads.md`
- Replaces GitHub-focused conventions with Beads CLI (`bd create`, `bd show`, `bd list`, etc.)

**When syncing from upstream:**
If the upstream skill changes, preserve these customizations:
- Keep Beads-only (don't re-add issue tracker selection)
- Keep triage-labels removal
- Preserve auto-detection and auto-install/init logic in write phase
- Keep the split domain templates approach
