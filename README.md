# Skills

A personal aggregator of AI agent skills. Pulls skills from upstream repos and keeps them available under `skills/` for AI coding agents to consume.

## Layout

```
skills/          ← flat directory of all skills (agents read from here)
upstream/        ← Upstream submodules (read-only, never edited)
authored/        ← symlinks to Authored skills, organized by domain (authored/{domain}/*)
                 ← each skill may have AUTHORING.md alongside SKILL.md
                 ← domains may have authored/<domain>/AUTHORING.md
scripts/         ← sync, upstream, check, cleanup
meta.json        ← declared upstreams with url, branch, and skill selections
```

## Commands

| Command                                                  | Purpose                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| `pnpm upstream <url> [--branch <branch>] [--name <key>]` | Add or update an Upstream; optionally select which skills to sync |
| `pnpm sync`                                              | Pull latest submodules, copy selected skills into `skills/`       |
| `pnpm check`                                             | Report how many commits behind each submodule is upstream         |
| `pnpm cleanup [-y]`                                      | Detect (and with `-y`, remove) orphaned skills and submodules     |

## Skill types

- **Authored** — owned by this repo, never touched by `sync`. Optionally grouped by `domain` in `authored/` (e.g., `authored/frappe/`, `authored/sap/`)
- **Synced** — copied from an Upstream on every `sync`

## License

MIT
