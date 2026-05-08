# Skills

A personal aggregator of AI agent skills. Pulls skills from upstream repos and keeps them available for AI coding agents to consume.

## Layout

```
authored/        ← Authored skills, organized by domain (authored/{domain}/*)
                 ← each skill may have AUTHORING.md alongside SKILL.md
                 ← domains may have authored/<domain>/AUTHORING.md
skills/          ← flat directory of synced skills from upstreams
upstream/        ← Upstream submodules (read-only, never edited)
scripts/         ← sync, upstream, check, cleanup
meta.json        ← declared upstreams with url, branch, and skill selections
.claude-plugin/  ← plugin manifest for skill discovery via npx skills
  └─ plugin.json ← lists all authored skills for discovery
```

## Commands

| Command                                                  | Purpose                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| `pnpm upstream <url> [--branch <branch>] [--name <key>]` | Add or update an Upstream; optionally select which skills to sync |
| `pnpm sync`                                              | Pull latest submodules, copy selected skills into `skills/`       |
| `pnpm check`                                             | Report how many commits behind each submodule is upstream         |
| `pnpm cleanup [-y]`                                      | Detect (and with `-y`, remove) orphaned skills and submodules     |
| `npx @claudeai/skills --from-plugin .`                  | Discover authored skills via plugin.json                          |

## Skill types

- **Authored** — owned by this repo, never touched by `sync`. Located in `authored/` organized by domain (e.g., `authored/engineering/`, `authored/frappe/`, `authored/sap/`). Discoverable via `.claude-plugin/plugin.json`.
- **Synced** — copied from an Upstream on every `sync` run. Located in `skills/` directory.

## License

MIT
