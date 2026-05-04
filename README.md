# Skills

A personal aggregator of AI agent skills. Pulls skills from upstream repos and keeps them available under `skills/` for AI coding agents to consume.

## Layout

```
skills/          ← flat directory of all skills (agents read from here)
upstream/        ← Upstream submodules (read-only, never edited)
instructions/    ← companion notes for reference-only upstreams
authored/        ← symlinks to Authored and Source-Derived skills
scripts/         ← sync, upstream, check, cleanup
meta.json        ← declared upstreams with url, branch, and skill selections
```

## Commands

| Command | Purpose |
|---|---|
| `pnpm upstream <url> [--branch <branch>] [--name <key>]` | Add or update an Upstream; optionally select which skills to sync |
| `pnpm sync` | Pull latest submodules, copy selected skills into `skills/` |
| `pnpm check` | Report how many commits behind each submodule is upstream |
| `pnpm cleanup [-y]` | Detect (and with `-y`, remove) orphaned skills and submodules |

## Skill types

- **Authored** — owned by this repo, never touched by `sync`
- **Source-Derived** — authored using an Upstream as reference
- **Synced** — copied from an Upstream on every `sync`

## License

MIT
