---
name: frappe-customizations-baker
description: Identify live database Custom Fields and Property Setters that are not yet persisted in the codebase, then bake them in — either into the owning doctype's .json schema (same-app) or into a sync_on_migrate custom/ JSON file (different-app). Generates cleanup patches for any now-redundant DB records. Use when a user says "bake in customizations", "persist customizations", "ensure fields are defined in code", or wants to move ad-hoc form customizations into source control. Requires frappe-doctype-schema and frappe-customizations-writer skills.
---

# Frappe — Bake Customizations

Move live-database Custom Fields and Property Setters into the codebase so they survive `bench migrate` on fresh installs, are version-controlled, and no longer depend on ad-hoc DB state.

## Quick start

1. **Fetch customizations:**
   ```bash
   BENCH=$(pwd)
   PYTHON="$BENCH/env/bin/python"
   SCRIPT=$(find "$BENCH" -path "*/frappe-customizations-baker/scripts/fetch_customizations.py" | head -1)
   "$PYTHON" "$SCRIPT" --app <app_name>
   ```

2. **Choose baking target** based on app ownership:
   - Same-app → Use `frappe-doctype-schema` (native field)
   - Different-app → Use `frappe-customizations-writer` (sync_on_migrate custom/ file)

3. **Generate cleanup patch** to delete DB records after baking

## Workflows

### Primary workflow: Bake customizations

**Context:** User requests customizations from DB → code (e.g. "persist field customizations", "bake in Employee fields").

**Steps:**
1. Fetch customizations via bundled script
2. Filter/validate candidates (skip custom doctypes, handle duplicates)
3. Initiate `frappe-doctype-schema` or `frappe-customizations-writer` for each DocType group
4. Draft cleanup patches (one per app) to delete now-redundant DB records
5. Run `bench migrate` to apply DB changes

## Advanced features

See [REFERENCE.md](REFERENCE.md) for:
- Mental model: `doctype_app` vs `customization_app` distinction
- Detailed step-by-step workflow with edge cases
- Decision tree for filtering candidates
- Common pitfalls (blank modules, Property Setter quirks, `default_print_format`)
