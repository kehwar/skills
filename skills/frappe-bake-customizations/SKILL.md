---
name: frappe-bake-customizations
description: Identify live database Custom Fields and Property Setters that are not yet persisted in the codebase, then bake them in — either into the owning doctype's .json schema (same-app) or into a sync_on_migrate custom/ JSON file (different-app). Generates cleanup patches for any now-redundant DB records. Use when a user says "bake in customizations", "persist customizations", "ensure fields are defined in code", or wants to move ad-hoc form customizations into source control. Requires frappe-doctype-schema and frappe-customizations-writer skills.
---

# Frappe — Bake Customizations

**Goal:** Move live-database Custom Fields and Property Setters into the codebase so they survive `bench migrate` on fresh installs, are version-controlled, and no longer depend on ad-hoc DB state.

---

## Mental Model

Every customization row in the DB has two pieces of identity:

| Attribute | What it tells you |
|---|---|
| `doctype_app` (derived) | Which app *owns the DocType* being customized |
| `customization_app` (derived) | Which app *registered* the customization (via its `module` field) |

The bake-in target depends on the relationship:

| Relationship | Bake target | Skill to use |
|---|---|---|
| `customization_app == doctype_app` | Edit the DocType's own `.json` schema — the field becomes a native field | **frappe-doctype-schema** |
| `customization_app != doctype_app` | Write/merge into `apps/<app>/<app>/<module>/custom/<dt_scrubbed>.json` — field stays a Custom Field but is code-controlled | **frappe-customizations-writer** |

After baking, any now-redundant DB Custom Field or Property Setter record must be deleted via a patch.

---

## Workflow

### Step 0 — Clarify scope (ask user only when ambiguous)

Ask the user which **baking app** (the app doing the baking) if it cannot be inferred. Ambiguous situations:
- The workspace contains multiple custom apps and the user said "bake all" without specifying.
- A customization's `module` field maps to an app not open in the workspace (cannot write files there) → ask how to handle.
- A customization would overwrite an existing field definition in the same-app JSON with a net property change → confirm before proceeding.

Skip asking for:
- Customizations on **custom doctypes** (`is_custom_doctype == true`) — skip silently.
- `is_system_generated == true` customizations — bake them in (they represent intentional overrides declared in code, not Frappe's self-generated records).

### Step 1 — Fetch customizations from the DB

Run the bundled script from the bench root:

```bash
BENCH=$(pwd)
PYTHON="$BENCH/env/bin/python"
SCRIPT=$(find "$BENCH" -path "*/frappe-bake-customizations/scripts/fetch_customizations.py" | head -1)

# All customizations in the site:
"$PYTHON" "$SCRIPT" > /tmp/customizations.json

# Scoped to one app's modules only (recommended):
"$PYTHON" "$SCRIPT" --app <app_name> > /tmp/customizations.json
```

The script outputs JSON with four keys:
- `custom_fields[]` — enriched CF rows
- `property_setters[]` — enriched PS rows
- `doctype_app_map` — `{DocType: app_name}`
- `module_to_app` — `{module_lower: app_name}`

Each row has `doctype_app` (app that owns the target DocType) and `customization_app` (app that declared the customization).

### Step 2 — Analyse and filter candidates

From the fetched data, build a **candidate list** by applying these filters **in order**:

1. **Skip** rows where `is_custom_doctype == true` — custom doctypes live only in the DB; no file to bake into.
2. **Skip** rows where `doctype_app == ""` — DocType not found in any installed app; cannot safely bake.
3. **Check if already baked:**
   - For **same-app** (`customization_app == doctype_app`): open the DocType's `.json` schema and check if the field/property already exists with *the same value*. If it does, the customization row is redundant — skip baking the field, but still draft a patch to delete the DB record.
   - For **different-app**: open `apps/<customization_app>/<customization_app>/<module>/custom/<dt_scrubbed>.json` if it exists and check for the entry. If already present with the same value, same as above — skip bake, draft delete patch only.
4. Remaining rows are **candidates to bake**.

Present the candidate list to the user grouped by DocType before proceeding. Structure:

```
DocType: Employee (erpnext)
  Baking app: soldamundo  →  different-app → frappe-customizations-writer
  Candidates:
    [CF] sales_commissions_enabled (Check) — insert_after: ctc
    [PS] sales_commissions_enabled / reqd = 1

DocType: Item (erpnext)
  Baking app: tweaks  →  different-app → frappe-customizations-writer
  Candidates:
    [CF] custom_stock_group (Link → Item Group) — insert_after: item_group

DocType: Sales Person (soldamundo)
  Baking app: soldamundo  →  same-app → frappe-doctype-schema
  Candidates:
    [CF] external_code (Data) — insert_after: name
```

Ask for confirmation only if:
- A DocType's `customization_app` is not open in the workspace.
- A same-app bake would change an existing field definition (not just add a new one).

### Step 3 — Bake each candidate

Process each DocType's candidates as a group.

#### Same-app (frappe-doctype-schema skill)

1. Load the `frappe-doctype-schema` skill.
2. Read the existing DocType `.json` at `apps/<app>/<app>/<module>/doctype/<dt_scrubbed>/<dt_scrubbed>.json`.
3. Add/update fields and properties in the JSON.
4. Run `save_doctype.py` and `bench migrate`.

For **Property Setters** targeting the same-app doctype:
- Find the matching field in `fields[]` and set the property directly on the field dict (e.g. `"reqd": 1`).
- DocType-level Property Setters (e.g. `allow_import`, `search_fields`) are set as top-level keys in the JSON.

#### Different-app (frappe-customizations-writer skill)

1. Load the `frappe-customizations-writer` skill.
2. Build a spec JSON from the candidate rows (see spec format in that skill).
3. Run `add_customization.py` to merge into the target file.

Target file path:
```
apps/<customization_app>/<customization_app>/<module_scrubbed>/custom/<dt_scrubbed>.json
```

`module_scrubbed` = `customization.module.lower().replace(" ", "_")`
`dt_scrubbed` = `dt.lower().replace(" ", "_")`

### Step 4 — Draft the cleanup patch

For **every** customization row that was baked in (same-app or different-app), the corresponding DB record is now redundant and must be deleted on next migrate.

Draft one patch file per app, named with today's date:

**Patch file:** `apps/<app>/<app>/patches/<year>/<YYYYMMDD>_delete_baked_customizations.py`

```python
import frappe


def execute():
    # Custom Fields that are now defined natively or in sync_on_migrate
    custom_fields_to_delete = [
        # ("DocType", "fieldname"),
        ("Employee", "sales_commissions_enabled"),
    ]
    for dt, fieldname in custom_fields_to_delete:
        name = frappe.db.get_value("Custom Field", {"dt": dt, "fieldname": fieldname})
        if name:
            frappe.delete_doc("Custom Field", name, ignore_missing=True)

    # Property Setters baked into schema or customization file
    property_setters_to_delete = [
        # ("DocType", "field_name_or_null", "property"),
        ("Employee", "sales_commissions_enabled", "reqd"),
    ]
    for doc_type, field_name, property_name in property_setters_to_delete:
        filters = {"doc_type": doc_type, "property": property_name}
        if field_name:
            filters["field_name"] = field_name
        name = frappe.db.get_value("Property Setter", filters)
        if name:
            frappe.delete_doc("Property Setter", name, ignore_missing=True)
```

**Register the patch** at the end of `apps/<app>/<app>/patches.txt`:
```
<app>.patches.<year>.<YYYYMMDD>_delete_baked_customizations
```

---

## Module → App resolution

`fetch_customizations.py` builds this mapping from `apps/<app>/<app>/modules.txt`. When the `module` field on a customization is blank or maps to an unknown app, treat as "unknown" and ask the user.

App ownership of a DocType is determined by file presence:
```
apps/<app>/<app>/<any_module>/doctype/<dt_scrubbed>/<dt_scrubbed>.json
```

---

## Decision Tree (Quick Reference)

```
Customization row
  ├── is_custom_doctype == true  →  SKIP silently
  ├── doctype_app == ""          →  SKIP (unknown doctype, ask user)
  ├── already baked (same value) →  SKIP bake; DRAFT delete patch only
  └── needs baking
        ├── customization_app == doctype_app
        │     →  frappe-doctype-schema  (edit doctype .json)
        └── customization_app != doctype_app
              →  frappe-customizations-writer  (edit custom/ .json)
      + DRAFT delete patch for DB record
```

---

## Common Pitfalls

- **`module` field is blank on old customizations** — Frappe did not always require it. When blank, infer the app from `doctype_app` and ask the user to confirm which app should own the baking.
- **Same field, two modules** — if a CF and a PS for the same field have different `module` values, unify before baking. Ask the user which module/app is correct.
- **Property Setter with `doctype_or_field == "DocType"`** — this is a DocType-level property (e.g. `search_fields`). For same-app baking, set it as a top-level key in the DocType JSON, not on a field.
- **DO NOT** bake `default_print_format` as a same-app schema change — Frappe rejects it during migration. Leave it as a Property Setter in the custom/ file.
- **Run `bench migrate`** after any same-app schema change (`frappe-doctype-schema`). Not needed for `frappe-customizations-writer` only changes (sync_on_migrate handles it).
