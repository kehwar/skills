---
name: frappe-live-code-extractor
description: Extract all live Frappe code into plain files under `<app>/live/` so they can be searched with grep and read by AI assistants. Use when you need to refresh the live code snapshot before a refactor, search across the full codebase, understand DB-resident script context, or register a new custom doctype for extraction.
---

# frappe-live-code-extractor

Queries the live Frappe database (**read-only**) and writes each artifact's code into source files and `meta.json` under `<app>/live/<type>/`. Makes all DB-resident code visible to grep, LSP, and AI assistants. Safe to run at any time.

## Quick start

**`--app` is required.** The agent must determine the app before calling the script.

### Agent: inferring the app

If the user has not specified an app, determine it from context:

1. **From the open file / workspace folder** — if the user is editing a file under `apps/<app>/`, use that `<app>`.
2. **From the conversation** — if the user has mentioned an app name, use it.
3. **From installed apps** — as a last resort, query the DB and pick the first non-framework app:

```bash
cd /workspace/development/frappe-bench
./env/bin/python - <<'EOF'
import os; os.environ['FRAPPE_STREAM_LOGGING'] = '1'
import frappe
frappe.init(site='development.localhost', sites_path='sites'); frappe.connect()
FRAMEWORK = {'frappe', 'erpnext', 'payments', 'hrms'}
apps = [a for a in frappe.get_installed_apps() if a not in FRAMEWORK]
print(apps[0] if apps else '')
frappe.destroy()
EOF
```

Once the app is known, run:

```bash
cd /workspace/development/frappe-bench
./env/bin/python skills/.agents/skills/frappe-live-code-extractor/scripts/extract.py \
  --app myapp --site development.localhost
```

To extract **a single DocType** (faster, useful after editing one doctype):

```bash
./env/bin/python skills/.agents/skills/frappe-live-code-extractor/scripts/extract.py \
  --app myapp --doctype "Report"
```

`--doctype` accepts the exact DocType name (case-insensitive). Works for both standard Frappe DocTypes (`Server Script`, `Report`, …) and custom ones registered via `config.json`.

## Workflows

### Refresh before a refactor

When the user says "refresh the live code snapshot":

1. Run the extraction command above
2. Grep across `apps/<app>/<app>/` — the `live/` subtree is included automatically
3. Proceed with the refactor

### Register a custom DocType

When the user asks to "mirror" or "extract" a DocType:

1. **Discover fields** — query the schema for Code/Text/HTML fields:
   ```bash
   cd /workspace/development/frappe-bench
   ./env/bin/python -c "
   import os; os.environ['FRAPPE_STREAM_LOGGING'] = '1'
   import frappe
   frappe.init(site='development.localhost', sites_path='sites'); frappe.connect()
   meta = frappe.get_meta('Your DocType Name')
   for f in meta.fields:
       if f.fieldtype in ['Code','Text','Long Text','Small Text','HTML','HTML Editor','Markdown Editor']:
           print(f.fieldname, f.fieldtype, f.label)
   frappe.destroy()
   "
   ```
2. **Create `config.json`** in `<app>/live/doctype/<doctype-slug>/config.json` — see [REFERENCE.md](REFERENCE.md#configjson-format) for schema and examples
3. **Run extraction** — the file is auto-discovered and processed
4. **Commit** `config.json` and extracted files

## Advanced features

See [REFERENCE.md](REFERENCE.md) for:

- Supported artifact types table
- Output directory structure and `meta.json` format
- `config.json` schema (all fields, advanced options)
- Config examples (dynamic extensions, mutual exclusion, per-group filtering)
- Integration with git, multi-app extraction, troubleshooting
