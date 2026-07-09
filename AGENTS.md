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

## Engineering skill adaptation

Engineering skills are adapted from `upstream/mattpocock/`. The adaptation is defined declaratively in **`scripts/adapt-engineering.py`** — a manifest that copies upstream directories, renames skills (e.g. `productivity/handoff` → `engineering/handoff`), and applies text replacements. The script **is** the provenance; no metadata blocks in the output files.

### Update workflow

```bash
# 1. Pull latest upstream submodule
./scripts/upstreams.py --update mattpocock

# 2. Rebuild adapted skills
./scripts/adapt-engineering.py

# 3. Review changes
git diff

# 4. If replacements/patches apply cleanly (no warnings), commit
```

The script reads `scripts/adapt-engineering.yaml` — the build manifest. Only skills listed there are rebuilt from upstream. Skills not listed (custom originals like `skill-router`, `issue-tracker`) are left untouched.

### Beware false positives

`adapt-engineering.py` does **not** warn when a replacement succeeds on changed text that still *looks* right. Always review `git diff` semantically after an update.

## Other workflow

The main flow is documented in `/skill-router`. Key tools:

- **`scripts/upstreams.py`** — manage upstream submodules
  - `--yaml` — refresh `upstream.yaml` from current submodule state
  - `--add <name> <url>` — add a new upstream (detects default branch)
  - `--remove <name>` — remove an upstream
  - `--update <name>` — update a single upstream
  - no args — update all upstreams
