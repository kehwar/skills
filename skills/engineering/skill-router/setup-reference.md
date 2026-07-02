# Setup Reference

One-time per-repo configuration for the engineering skills. Run this when starting work on a new repo.

## 1. Issue tracker

The issue tracker is where issues live. Skills like `to-issues`, `triage`, and `to-prd` read from and write to it.

**Default: GitHub** — uses `gh` CLI (pre-authenticated via Hermes). Pick the one that matches where you track work:

- **GitHub** — issues live in GitHub Issues (`gh issue`)
- **GitLab** — issues live in GitLab Issues (`glab`)
- **Local markdown** — issues as files under `.scratch/<feature>/`
- **Other** (Jira, Linear, etc.) — describe the workflow in one paragraph

## 2. Triage labels

The `triage` skill moves issues through five canonical states. Map them to your repo's actual label names:

| Role | Default label | Purpose |
|---|---|---|
| `needs-triage` | `needs-triage` | Maintainer needs to evaluate |
| `needs-info` | `needs-info` | Waiting on reporter |
| `ready-for-agent` | `ready-for-agent` | Fully specified, AFK-ready |
| `ready-for-human` | `ready-for-human` | Needs human implementation |
| `wontfix` | `wontfix` | Will not be actioned |

Defaults work if your repo has no existing labels.

## 3. Domain docs

Some skills (`improve-codebase-architecture`, `diagnosing-bugs`, `tdd`) read `CONTEXT.md` for domain language and `docs/adr/` for past decisions.

- **Single-context** — one `CONTEXT.md` + `docs/adr/` at repo root (most repos)
- **Multi-context** — `CONTEXT-MAP.md` at root pointing to per-context files (monorepos)

## Output

After answering the three questions, write:

- `docs/agents/issue-tracker.md` — where issues live + PR-as-surface flag (use the seed in `issue-tracker-github.md`, `issue-tracker-gitlab.md`, or `issue-tracker-local.md`)
- `docs/agents/triage-labels.md` — the label string mapping (use `triage-labels.md`)
- `docs/agents/domain.md` — context layout rules (use `domain.md`)
