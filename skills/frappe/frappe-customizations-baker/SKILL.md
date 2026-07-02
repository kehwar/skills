---
name: frappe-customizations-baker
description: Bake live database Custom Fields and Property Setters into source code, and reconcile feature-required DocType fields against code definitions and dev DB customizations. Use when user says "bake in customizations", "persist customizations", "ensure all necessary fields are baked in", or asks to harden feature fields for fresh installs.
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

### Feature workflow: Ensure all necessary fields are baked in

**Context:** User is developing a feature and asks to ensure all required fields are baked in.

**Steps:**
1. Build a feature field map by reading code and listing `(DocType, fieldname, usage location)`.
2. Check whether each field is already defined in code (`doctype/*.json` or `custom/*.json`).
3. For missing fields only, run a targeted search in dev DB customizations and continue with the bake plan.
4. If missing fields exist in DB customizations, continue from the detailed workflow (analysis -> bake -> cleanup patch).
5. If no matching DB customizations exist, proceed only with Step 3 of the detailed workflow (define fields in code), then continue the feature plan.

## Advanced features

See [REFERENCE.md](REFERENCE.md) for:
- Mental model: `doctype_app` vs `customization_app` distinction
- Detailed step-by-step workflow with edge cases
- Feature field-map workflow for feature development
- Decision tree for filtering candidates
- Common pitfalls (blank modules, Property Setter quirks, `default_print_format`)
