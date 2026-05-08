---
name: frappe-translations-writer
description: Helper utilities for finding, validating, and managing translations in Frappe apps. Includes commands for finding untranslated strings and translation file locations. Use when working with PO/POT files, finding untranslated strings, or validating translation completeness.
---

# Translation Helper

## File paths

| File | Path |
|---|---|
| POT template | `apps/<app>/<app>/locale/main.pot` |
| PO translations | `apps/<app>/<app>/locale/<locale>.po` |
| MO compiled | `sites/assets/locale/<locale>/LC_MESSAGES/<app>.mo` |

## Workflow

```bash
PYTHON=/workspace/development/frappe-bench/env/bin/python
SCRIPTS=<skill_dir>/scripts
PO=apps/<app>/<app>/locale/es_PE.po
```

```bash
cd /workspace/development/frappe-bench

# 1. Extract strings from code → update POT
bench generate-pot-file --app <app>

# 2. Merge new strings into PO
bench update-po-files --app <app> --locale es_PE

# 3. Query strings → save to <po_dir>/drafts/es_PE.review.po
$PYTHON $SCRIPTS/po_query.py --po $PO --out es_PE.review.po
#   Filter by module:   add --path "<module>/**" --out es_PE.module.po
#   Only untranslated:  add --untranslated --out es_PE.untranslated.po
#   Only fuzzy:         add --fuzzy --out es_PE.fuzzy.po

# 4. Edit the partial PO — fill in msgstr values

# 5. Merge partial PO back into the full file
$PYTHON $SCRIPTS/po_merge.py --main $PO --patch locale/drafts/es_PE.review.po --dry-run
$PYTHON $SCRIPTS/po_merge.py --main $PO --patch locale/drafts/es_PE.review.po

# 6. Compile PO → MO binary
bench compile-po-to-mo --app <app> --locale es_PE

# 7. Clear cache
bench clear-cache
```

> `--site` is only required when `--app` is omitted.

## Command options

| Command | Key options |
|---|---|
| `generate-pot-file` | `--app` |
| `update-po-files` | `--app`, `--locale` |
| `compile-po-to-mo` | `--app`, `--locale`, `--force` |
| `po_query.py` | `--path GLOB` (repeatable), `--format po\|tsv\|json`, `--out` (relative → `<po_dir>/drafts/`, absolute → as-is, omit → stdout); filters: `--untranslated`, `--fuzzy` (omit both = all entries) |
| `po_merge.py` | `--dry-run`, `--clear-fuzzy`, `--out` |

See [scripts/po_query.py](scripts/po_query.py) and [scripts/po_merge.py](scripts/po_merge.py) for full usage.

## Key rules

- Locale format: `es_PE` (underscore), not `es-PE`
- Always regenerate POT before updating PO when code has changed
- Context syntax: `_("text", context="Name")` in Python, `__("text", { context: "Name" })` in JS

## Common issues

See [REFERENCE.md](REFERENCE.md) for validation commands, fuzzy entries, and migration from CSV.
