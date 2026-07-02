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

## Patches and Hooks — When `sync_on_migrate` Is Not Enough

> **Preferred approach: `sync_on_migrate` JSON files.** They re-apply on every `bench migrate`, require no code, and are idempotent by default. Only reach for patches or hooks when you need logic that a JSON declaration cannot express.

### When to use each mechanism

| Situation | Recommended mechanism |
|---|---|
| Standard field / property setter addition | `sync_on_migrate` JSON **(default)** |
| Backfill data into a new custom field | Patch (call `sync_customizations` first, then write data) |
| Apply a customization conditionally | `after_migrate` hook |
| Dynamically adjust properties on every migration | `after_migrate` hook |
| One-time setup only on the very first install | `after_install` hook |

> **Critical:** Patches **do not run on fresh installs** — they are skipped entirely when an app is installed for the first time (the site is treated as already up to date). Similarly, `after_install` runs **only once**, on the first `bench install-app` for that app, and never again. Neither mechanism is reliable for ensuring a customization is always present. Use `sync_on_migrate` JSON or `after_migrate` for anything that must exist on every site, whether newly installed or migrated.

---

### Timing reference

```
bench migrate
  └─ pre_model_sync patches
  └─ schema updates (ALTER TABLE …)
  └─ post_model_sync patches
  └─ post_schema_updates          ← sync_customizations() runs here
  └─ after_migrate hooks          ← custom field columns are available here
```

---

### Calling `sync_customizations` from a patch

`sync_customizations()` runs in `post_schema_updates` — **after all patches**. DB columns for `sync_on_migrate` custom fields **do not exist yet** when any patch runs.

If a patch needs to read or write a column backed by a custom field, call `sync_customizations` manually at the top before touching those columns:

```python
# myapp/patches/2025/2025_06_01__backfill_my_field.py
import frappe
from frappe.modules.utils import sync_customizations


def execute():
    # Pull the custom field columns into the DB before writing to them
    sync_customizations(app="myapp")

    frappe.db.sql("UPDATE `tabEmployee` SET custom_my_field = 1 WHERE ...")
```

`sync_customizations(app=…)` is idempotent — safe to call multiple times. Pass the specific `app` name to limit scope and avoid re-syncing unrelated apps.

---

### Applying customizations programmatically in a patch

Use Frappe helpers when conditional logic is needed:

```python
# myapp/patches/2025/2025_06_01__conditional_field.py
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field
from frappe.custom.doctype.property_setter.property_setter import make_property_setter


def execute():
    # Only add the field when a feature flag is active
    if frappe.db.get_single_value("System Settings", "enable_my_feature"):
        create_custom_field("Contact", {
            "fieldname": "custom_my_field",
            "fieldtype": "Data",
            "label": "My Field",
            "insert_after": "phone",
        })

    # Or modify a property conditionally
    make_property_setter("Sales Invoice", "customer_name", "reqd", "1", "Check")
```

> These helpers write to the DB immediately; no explicit `frappe.db.commit()` is needed.

---

### `after_install` hook — one-time first-install logic

> **Warning:** `after_install` runs **only once**, on the very first `bench install-app`. It does **not** run on subsequent `bench migrate` calls, and it does **not** run for sites that already have the app installed. Any customization created here will be absent on pre-existing sites until they run a patch or migrate hook that re-creates it. Use `after_install` only for logic that truly must happen once (e.g. seeding default records), never for schema customizations that need to survive on existing sites.

```python
# myapp/hooks.py
after_install = "myapp.setup.install.after_install"
```

```python
# myapp/setup/install.py
import frappe
from frappe.modules.utils import sync_customizations


def after_install():
    # sync_on_migrate files are applied automatically at install.
    # Only add logic here that cannot live in JSON AND is truly install-only.
    _seed_default_records()
```

---

### `after_migrate` hook — the safe home for imperative customizations

`after_migrate` runs on **every** `bench migrate` — including fresh installs. It is therefore the correct place for any imperative logic that must be present on all sites:

```python
# myapp/hooks.py
after_migrate = ["myapp.setup.migrate.after_migrate"]
```

```python
# myapp/setup/migrate.py
from frappe.modules.utils import sync_customizations


def after_migrate():
    # Runs on every bench migrate, including fresh installs.
    # sync_customizations has already fired, so all sync_on_migrate columns exist.
    _apply_dynamic_property_setters()
```

> `after_migrate` fires **after** `sync_customizations`, so all `sync_on_migrate` columns are guaranteed to exist.

**Prefer `after_migrate` over `after_install` for any customization that must be present on every site**, not just newly installed ones.

---

## Reference

Full JSON schema, Custom Field defaults, Property Setter defaults, file path convention, ownership detection → [REFERENCE.md](REFERENCE.md)
