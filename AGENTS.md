# Agent context for this repo

> **Glossary and domain vocabulary** for this repository are defined in [CONTEXT.md](./CONTEXT.md). Read it first for the shared language used here.

## File structure

```
/
├── scripts/upstreams.py       # Manage upstream submodules (update, add, remove)
├── upstream.yaml              # Metadata for all upstream repos (url, branch, commit, fetch time)
├── upstream/<key>/            # Git submodules — read-only, never edit directly
├── skills/engineering/        # Engineering skills (adapted from upstream)
│   ├── skill-router/          # Router — maps all skills and flows
│   └── .../
├── skills/archived/           # Old skills no longer in use
├── docs/                      # Documentation
└── .gitmodules                # Submodule definitions
```

## Skill conventions

When adapting a skill from an upstream source, always add a `metadata.adapted-from-upstream-skill` array to the frontmatter listing every upstream skill it derives from. Each entry must include the upstream submodule commit SHA (abbreviated) pinned with `@sha` — this captures the exact version the skill was adapted from. Keep both the paths and SHAs up to date whenever the adaptation evolves.

Example:
```yaml
metadata:
  adapted-from-upstream-skill:
    - upstream/mattpocock/skills/engineering/ask-matt@1445797d
    - upstream/mattpocock/skills/engineering/setup-matt-pocock-skills@1445797d
```

## Workflow

The main flow is documented in `/skill-router`. Key tools:

- **`scripts/upstreams.py`** — manage upstream submodules
  - `--yaml` — refresh `upstream.yaml` from current submodule state
  - `--add <name> <url>` — add a new upstream (detects default branch)
  - `--remove <name>` — remove an upstream
  - `--update <name>` — update a single upstream
  - no args — update all upstreams
