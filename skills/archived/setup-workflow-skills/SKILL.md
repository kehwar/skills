---
name: setup-workflow-skills
description: Detects and fixes deviations from the prescribed repo workflow configuration — AGENTS.md, docs layout, and Beads issue tracking.
disable-model-invocation: true
---

# Setup Workflow Skills

Reconciles a repo against the following **desired state**:

| # | Goal | Check |
|---|------|-------|
| 1 | `AGENTS.md` exists with 4 prescribed blocks (Before exploring, Issue tracker, Glossary vocabulary, Flag ADRs), contiguous and verbatim | File present, block matches canonical |
| 2 | `docs/glossary.md` exists | File present |
| 3 | `docs/adr/` directory exists | Dir present |
| 4 | `docs/issue-tracker.md` content matches canonical | File present, exact match |
| 5 | `bd` CLI installed | `command -v bd` succeeds |
| 6 | Beads project initialised | `bd list` succeeds |
| 7 | Beads config: no hooks, stealth mode, `.beads/` in `.git/info/exclude` | Config correct, exclude entry present |
| 8 | Prescribed skills are available: `break-issue`, `grill-with-docs`, `handoff`, `improve-codebase-architecture`, `prototype`, `setup-workflow-skills`, `tdd`, `write-a-skill`, `write-issue`, `zoom-out` | Each skill has an entry in `skills-lock.json` AND a directory under `.agents/skills/<skill>/` with `SKILL.md` |

The fix is always **plan-then-execute**: detect all deviations, report them, get user confirmation, then apply.

## Process

### 1. Explore

Check each goal against the current repo state:

- **Goal 1**: Read [instructions.md](./instructions.md) for canonical content. Read `AGENTS.md` (if it exists). Find the contiguous block from `## Before exploring, read these` through end of `## Flag ADR conflicts`. Compare exact string match.
- **Goals 2-3**: Check file/dir existence.
- **Goal 4**: Read `docs/issue-tracker.md` (if it exists) and compare full content against [issue-tracker.md](./issue-tracker.md).
- **Goal 5**: `command -v bd`
- **Goal 6**: `bd list` (or `bd --version` / equivalent non-mutating command)
- **Goal 7**: Check for hooks config (beads.config.json or `.beads/` hooks), check stealth flag, check `.git/info/exclude` for `.beads/issues.jsonl`.
- **Goal 8**: For each prescribed skill, check `skills-lock.json` for an entry keyed by the skill name, and check `.agents/skills/<skill>/SKILL.md` exists. Prescribed skills: `break-issue`, `grill-with-docs`, `handoff`, `improve-codebase-architecture`, `prototype`, `setup-workflow-skills`, `tdd`, `write-a-skill`, `write-issue`, `zoom-out`.

### 2. Report

Present a summary:

```
Found [n]/8 goals satisfied.

Deviations:
- [Goal 1] ...
- [Goal 3] ...
...
```

### 3. Confirm

Show the planned fixes. Wait for user approval before applying.

### 4. Fix

**Goal 1 (AGENTS.md):**
- If the prescribed block is missing or drifted, replace the entire contiguous range (`## Before exploring, read these` through end of `## Flag ADR conflicts`) with canonical content from [instructions.md](./instructions.md). Preserve everything outside that range.
- If `AGENTS.md` doesn't exist, create it with the canonical content.

**Goal 2 (glossary):** Create `docs/glossary.md` with a stub if missing. Never overwrite existing content.

**Goal 3 (adr):** Create `docs/adr/` if missing.

**Goal 4 (issue tracker):** Write/overwrite `docs/issue-tracker.md` with canonical content from [issue-tracker.md](./issue-tracker.md).

**Goal 5 (CLI):** If `bd` not found:
```bash
curl -fsSL https://raw.githubusercontent.com/gastownhall/beads/main/scripts/install.sh | bash
```

**Goal 6 (init):** If project not initialised:
```bash
bd init --stealth --non-interactive
```

**Goal 7 (config):**
- Ensure no beads hooks are configured (check `beads.config.json` or `.beads/`).
- Ensure `.beads/issues.jsonl` is listed in `.git/info/exclude`. Append if missing.

**Goal 8 (prescribed skills):**
For each missing skill:
```bash
npx skills add kehwar/skills --skill <skillname> -y
```

If `npx skills` is not available, flag it as requiring manual setup.

### 5. Done

Report which fixes were applied. Note any goals that couldn't be auto-fixed.
