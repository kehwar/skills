## Agent orientation

Read `CONTEXT.md` for domain language before making changes.

### Key locations

- `meta.json` — declared Upstreams (url, branch, optional skill selections). The authoritative config.
- `skills/` — flat directory of all skills consumed by agents. Each subfolder has a `meta.json` with `type: "authored" | "authored-from-source" | "synced"`.
- `upstream/` — read-only Upstream submodules. Never edit files here.
- `authored/` — symlinks to Authored and Source-Derived skills for navigation only.
- `scripts/` — all automation: `sync.ts`, `upstream.ts`, `check.ts`, `cleanup.ts`.
- `instructions/` — one `.md` per reference-only Upstream; notes to guide skill authoring from that upstream.

### Before touching a skill

Check its `skills/<name>/meta.json`:
- `type: "authored"` or `type: "authored-from-source"` → safe to edit, will never be overwritten
- `type: "synced"` → managed by Sync; edits will be lost on next `pnpm sync`

### Domain docs

Single-context — `CONTEXT.md` at repo root.
