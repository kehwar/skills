---
name: setup-workflow-skills
description: Scaffolds AGENTS.md, docs/glossary.md, docs/adr/, docs/issue-tracker.md, and Beads issue tracking in a fresh repo.
disable-model-invocation: true
---

# Setup Workflow Skills

Scaffold the per-repo configuration:

- **Agent instructions** — creates or updates `AGENTS.md` / `CLAUDE.md` with sections for glossary, ADRs, issue tracker, vocabulary conventions, and file structure.
- **Glossary & ADRs** — creates `docs/glossary.md` (stub) and `docs/adr/` directory.
- **Issue tracker** — creates `docs/issue-tracker.md` and initialises Beads if needed.

This is a prompt-driven skill, not a deterministic script. Explore, check state, present findings, confirm with the user, then write.

## Process

### 1. Explore

Look at the current repo to understand its starting state. Don't assume anything:

- **Beads CLI**: `command -v bd`
- **Beads markers in repo**: `beads.config.json`, `beads/` directory, `.beads/` configuration
- **Git exclude**: `cat .git/info/exclude` — does it already track `.beads/issues.jsonl`?
- **Agent instructions**: does `AGENTS.md` or `CLAUDE.md` exist at root? Does either already have sections for glossary, issue tracker, ADR flags, file structure?
- **docs/ directory**: does `docs/glossary.md`, `docs/adr/`, `docs/issue-tracker.md` exist?

### 2. Present findings

Summarise what's present and what's missing. Include:

- **Beads status**: CLI available + project initialised? CLI available but not initialised? Not installed?
- **Agent instructions**: which file exists (`AGENTS.md` / `CLAUDE.md` / neither)? Which sections are present and which are missing?
- **docs/ layout**: which files exist and which need creating?

### 3. Draft and confirm

Show the user the proposed `## Agent orientation` block (or whatever sections will go in the chosen file). The content comes from [instructions-template.md](./instructions-template.md).

Let them edit before writing.

**Pick the file to edit:**
- If `CLAUDE.md` exists, edit it.
- Else if `AGENTS.md` exists, edit it.
- If neither exists, ask the user which one to create.

Never create `AGENTS.md` when `CLAUDE.md` already exists (or vice versa). If an `## Agent orientation` block (or the individual sections like `## Before exploring, read these`) already exist in the chosen file, update them in-place rather than appending duplicates. Don't overwrite user edits to surrounding sections.

### 4. Write

**Agent instructions**: Write/update the chosen file with the template sections + a `## File structure & key locations` section. For the file structure section:

Write a `## File structure & key locations` section with a placeholder ASCII tree:

```
/
├── ...  # fill in per-project
```

After writing, leave it up to the user to customise the ASCII tree.

**docs/ layout**: Create the following if they don't exist:
- `docs/glossary.md` — write a stub:
  ```markdown
  # Glossary

  _(Define domain terms here as the project evolves.)_
  ```
- `docs/adr/` — empty directory
- `docs/issue-tracker.md` — copy from [issue-tracker.md](./issue-tracker.md)

**Beads setup**:

If CLI is not available:
```bash
curl -fsSL https://raw.githubusercontent.com/gastownhall/beads/main/scripts/install.sh | bash
```

If project not initialised:
```bash
bd init --stealth --non-interactive
```

### 5. Done

Tell the user:
- Which files were created or updated
- Whether Beads CLI was installed and/or project initialised
- That the file structure section needs manual customisation
- That `docs/glossary.md` is a stub and should be populated as the project grows
