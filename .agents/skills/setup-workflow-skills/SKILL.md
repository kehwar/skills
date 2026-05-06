---
name: setup-workflow-skills
description: Sets up an `## Agent skills` block in AGENTS.md/CLAUDE.md and `docs/agents/` so the engineering skills know this repo uses Beads for issue tracking and where to find domain docs. Run before first use of `to-issues`, `to-prd`, `tdd`, `improve-codebase-architecture`, or `zoom-out` — or if those skills appear to be missing context about the issue tracker or domain docs.
disable-model-invocation: true
---

# Setup Workflow Skills

Scaffold the per-repo configuration that the engineering skills assume:

- **Issue tracker** — this workflow uses Beads. Setup auto-detects if it exists and flags a todo if it doesn't.
- **Domain docs** — where `CONTEXT.md` and ADRs live, and the consumer rules for reading them

This is a prompt-driven skill, not a deterministic script. Explore, check for Beads, present findings, confirm with the user, then write.

## Process

### 1. Explore

Look at the current repo to understand its starting state. Read whatever exists; don't assume:

- Check if Beads CLI is available: `command -v bd`
- Look for Beads markers: `beads.config.json`, `beads/` directory, `.beads/` configuration
- `AGENTS.md` and `CLAUDE.md` at the repo root — does either exist? Is there already an `## Agent skills` section in either?
- `CONTEXT.md` and `CONTEXT-MAP.md` at the repo root
- `docs/adr/` and any `src/*/docs/adr/` directories
- `docs/agents/` — does this skill's prior output already exist?

### 2. Present findings

Summarise what's present and what's missing. **Include the Beads setup status:**

- **Beads CLI available + project initialized** — Beads is ready. Proceed to domain docs.
- **Beads CLI available + project not initialized** — Beads CLI is installed but `bd init` hasn't been run yet. The write phase will initialize it.
- **Beads CLI not available** — The Beads CLI needs to be installed. The write phase will install it and then initialize the project.

Then proceed to Section B (domain docs).

**Section B — Domain docs.**

> Explainer: Some skills (`improve-codebase-architecture`, `tdd`) read a `CONTEXT.md` file to learn the project's domain language, and `docs/adr/` for past architectural decisions. They need to know whether the repo has one global context or multiple (e.g. a monorepo with separate frontend/backend contexts) so they look in the right place.

Confirm the layout:

- **Single-context** — one `CONTEXT.md` + `docs/adr/` at the repo root. Most repos are this. The write phase will use the single-context seed template.
- **Multi-context** — `CONTEXT-MAP.md` at the root pointing to per-context `CONTEXT.md` files (typically a monorepo). The write phase will use the multi-context seed template.

### 3. Confirm and edit

Show the user a draft of:

- The `## Agent skills` block to add to whichever of `CLAUDE.md` / `AGENTS.md` is being edited (see step 4 for selection rules)
- The contents of `docs/agents/issue-tracker.md` (using the Beads seed)
- The contents of `docs/agents/domain.md` (using the appropriate seed based on their choice)

Let them edit before writing.

**Pick the file to edit:**

- If `CLAUDE.md` exists, edit it.
- Else if `AGENTS.md` exists, edit it.
- If neither exists, ask the user which one to create — don't pick for them.

Never create `AGENTS.md` when `CLAUDE.md` already exists (or vice versa) — always edit the one that's already there.

If an `## Agent skills` block already exists in the chosen file, update its contents in-place rather than appending a duplicate. Don't overwrite user edits to the surrounding sections.

**If Beads CLI is not available:**

Run the command:
```
curl -fsSL https://raw.githubusercontent.com/gastownhall/beads/main/scripts/install.sh | bash
```

This installs the Beads CLI system-wide.

**If Beads project initialization is needed:**

Run the command: `bd init --stealth --non-interactive`

This will create `beads.config.json` and the necessary Beads directory structure in this project.

Then copy the files into place:

```markdown
## Agent skills

### Issue tracker

Issues are tracked in Beads. See `docs/agents/issue-tracker.md`.

### Domain docs

[one-line summary of layout — "single-context" or "multi-context"]. See `docs/agents/domain.md`.
```

Copy the two docs file templates:

- Copy [issue-tracker-beads.md](./issue-tracker-beads.md) → `docs/agents/issue-tracker.md`
- Copy the appropriate seed template → `docs/agents/domain.md`:
  - For single-context repos: copy [domain-single-context.md](./domain-single-context.md)
  - For multi-context repos: copy [domain-multi-context.md](./domain-multi-context.md)

### 5. Done

Tell the user the setup is complete. If Beads CLI was installed or the project was initialized, confirm what ran successfully. Mention they can edit `docs/agents/*.md` directly later — re-running this skill is only necessary if they want to change the domain doc layout or restart from scratch.
