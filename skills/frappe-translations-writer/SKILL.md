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
cd /workspace/development/frappe-bench

# 1. Extract strings from code → update POT
bench generate-pot-file --app <app>

# 2. Merge new strings into PO
bench update-po-files --app <app> --locale es_PE

# 3. Edit PO file — add translations
# apps/<app>/<app>/locale/es_PE.po

# 4. Compile PO → MO binary
bench compile-po-to-mo --app <app> --locale es_PE

# 5. Clear cache
bench clear-cache
```

> `--site` is only required when `--app` is omitted (Frappe needs it to discover installed apps).

## Command options

| Command | Options |
|---|---|
| `generate-pot-file` | `--app` |
| `update-po-files` | `--app`, `--locale` |
| `compile-po-to-mo` | `--app`, `--locale`, `--force` |

## Find untranslated strings

```bash
cd apps/<app>

# All untranslated
grep -B 1 'msgstr ""$' <app>/locale/es_PE.po | grep msgid

# Count untranslated
grep -c 'msgstr ""$' <app>/locale/es_PE.po

# Untranslated for a specific context
awk '/msgctxt "ContextName"/{getline; msgid=$0; getline; if($0 ~ /msgstr ""$/) print msgid}' <app>/locale/es_PE.po
```

## Key rules

- Locale format: `es_PE` (underscore), not `es-PE`
- Always regenerate POT before updating PO when code has changed
- Context syntax: `_("text", context="Name")` in Python, `__("text", { context: "Name" })` in JS

## Common issues

See [REFERENCE.md](REFERENCE.md) for validation commands, fuzzy entries, and migration from CSV.
