---
name: frappe-customizations-writer
description: Add Custom Fields and Property Setters for a DocType owned by another app, writing into the correct sync_on_migrate JSON file. Use when one app needs to extend the schema of a DocType it does not own. Runs a script (bundled in this skill, not in the target app) to normalise structure and merge with deduplication. NOT for editing a DocType owned by the same app — do that by editing the doctype .json schema.
---

# Frappe Customizations — Writer

**Scope:** Customisations are needed when an app must change the schema of a DocType that belongs to a different app. They work by creating `Custom Field` and `Property Setter` documents that Frappe syncs on `bench migrate`. This skill handles writing those definitions into the correct JSON file.

---

## Workflow

1. **Collect the spec** — interview if anything is missing (see checklist below)
2. **Locate the target file**
   `apps/{app}/{app}/{module_scrubbed}/custom/{dt_scrubbed}.json`
   Infer `module` from existing `custom/` files in the app, or ask the user.
3. **Write a minimal spec** to a temp file (`/tmp/spec.json`) — only the fields that matter
4. **Run the skill script** to merge the spec into the target file:
   ```bash
   # Run from the bench root; script location is discovered automatically
   BENCH_DIR=$(pwd)
   PYTHON="$BENCH_DIR/env/bin/python"
   SCRIPT=$(find "$BENCH_DIR" -path "*/frappe-customizations-writer/scripts/add_customization.py" 2>/dev/null | head -1)
   "$PYTHON" "$SCRIPT" \
     apps/{app}/{app}/{module_scrubbed}/custom/{dt_scrubbed}.json \
     /tmp/spec.json
   ```
5. **Verify** the output file looks correct; delete `/tmp/spec.json`

The script creates the target file if it does not exist. No patch is ever needed — the JSON re-applies on every `bench migrate`.

---

## Interview Checklist

Ask if not already provided:

1. Which **DocType** is being customised? Which **app** is adding the customisation?
2. Which **module** in that app? (for the file path)
3. For each **Custom Field**: `fieldname`, `fieldtype`, `label`, `insert_after`
   - Optional: `reqd`, `hidden`, `read_only`, `bold`, `in_list_view`, `in_standard_filter`, `options`, `depends_on`, `mandatory_depends_on`, `default`, `description`, `fetch_from`, `fetch_if_empty`
4. For each **Property Setter**: `field_name` (or omit / `null` for DocType-level), `property`, `value`, `property_type`

**Layout fields** (`Section Break`, `Column Break`, `Tab Break`) — confirm explicitly before including.

---

## Spec JSON Formats

Write only the fields that matter. The script fills in all remaining fields with correct defaults.

**Envelope (multiple entries, preferred):**
```json
{
  "doctype": "Contact",
  "custom_fields": [
    {
      "dt": "Contact",
      "fieldname": "is_billing_contact",
      "fieldtype": "Check",
      "label": "Is Billing Contact",
      "insert_after": "is_primary_contact"
    }
  ],
  "property_setters": [
    {
      "doc_type": "Contact",
      "field_name": "phone",
      "property": "reqd",
      "value": "1",
      "property_type": "Check"
    }
  ]
}
```

**Single Custom Field:**
```json
{
  "dt": "Address",
  "fieldname": "tax_category",
  "fieldtype": "Link",
  "label": "Tax Category",
  "insert_after": "fax",
  "options": "Tax Category"
}
```

**Single Property Setter:**
```json
{
  "doc_type": "Address",
  "field_name": "fax",
  "property": "hidden",
  "value": "1",
  "property_type": "Check"
}
```

---

## Script: `add_customization.py`

Bundled inside this skill folder at `scripts/add_customization.py`. Its exact location in the file system varies — discover it at runtime:

```bash
SCRIPT=$(find "$BENCH_DIR" -path "*/frappe-customizations-writer/scripts/add_customization.py" 2>/dev/null | head -1)
```

The script is **not bundled inside individual apps** — it lives alongside this SKILL.md, wherever the skill is installed.

**What it does:**
- Loads `<target.json>` if present, or creates a new file with the correct top-level structure
- Normalises each entry to the **full Frappe export format** — all schema fields, computed `name`, timestamps
- **Sets `module`** on every Custom Field and Property Setter — inferred automatically from the target path (`apps/{app}/{app}/{module_dir}/custom/…`) and converterd to title-case (e.g. `selling` → `Selling`). Override by adding `"module": "My Module"` to the spec envelope.
- Deduplicates: Custom Fields by `fieldname`; Property Setters by `(doc_type, field_name, property)`
- Saves with `indent=1, sort_keys=True` — identical to `frappe.as_json` output

**Example (erpnext app, Contacts module, Contact DocType):**
```bash
# Run from bench root
BENCH_DIR=$(pwd)
PYTHON="$BENCH_DIR/env/bin/python"
SCRIPT=$(find "$BENCH_DIR" -path "*/frappe-customizations-writer/scripts/add_customization.py" 2>/dev/null | head -1)
"$PYTHON" "$SCRIPT" \
  apps/erpnext/erpnext/contacts/custom/contact.json \
  /tmp/spec.json
```

---

## Patches and `sync_on_migrate` timing

`sync_customizations()` runs in **`post_schema_updates`** — after **all** patches (both `pre_model_sync` and `post_model_sync`). This means the DB columns added by your custom fields **do not exist yet** when any patch executes.

**If a patch needs to read or write a column backed by a `sync_on_migrate` custom field**, call `sync_customizations` manually at the top of the patch before touching those columns:

```python
# myapp/patches/2025/2025_06_01__my_patch.py
import frappe
from frappe.modules.utils import sync_customizations


def execute():
    # Ensure the custom fields for this app are present before using them
    sync_customizations(app="myapp")

    # Now the columns exist and can be queried/written
    frappe.db.sql("UPDATE `tabEmployee` SET custom_my_field = 1 WHERE ...")
```

`sync_customizations(app=…)` is idempotent — safe to call multiple times. Pass the specific `app` name to limit the scope and avoid re-syncing unrelated apps.

---

## Reference

Full JSON schema, Custom Field defaults, Property Setter defaults, file path convention, ownership detection → [REFERENCE.md](REFERENCE.md)
