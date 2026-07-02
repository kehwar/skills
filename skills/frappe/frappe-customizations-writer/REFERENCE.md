# Frappe Customizations Write — Reference

## File Path Convention

`apps/{app}/{app}/{module_scrubbed}/custom/{dt_scrubbed}.json`

- `module_scrubbed`: lowercase, spaces → underscores (`Contacts` → `contacts`)
- `dt_scrubbed`: same rule (`Sales Invoice` → `sales_invoice`, `Address` → `address`)

## Determining DocType Ownership

Use this to confirm the DocType is owned by a *different* app (confirming cross-app scope):

```python
import frappe

def get_doctype_app(doctype: str) -> str:
    module = frappe.get_meta(doctype).module        # e.g. "Contacts" for Contact
    return frappe.local.module_app[frappe.scrub(module)]  # e.g. "frappe"
```

Or check in the bench shell:
```bash
bench --site development.localhost execute \
  "frappe.get_meta('Contact').module"
# → Contacts  (owned by frappe)

bench --site development.localhost execute \
  "frappe.get_meta('Address').module"
# → Contacts  (owned by frappe)
```

---

## Top-Level JSON Structure

Mirrors the output of `frappe.modules.utils.export_customizations` exactly.
File is written with `json.dumps(indent=1, sort_keys=True, separators=(',', ': '))`.

```json
{
 "custom_fields": [ ... ],
 "custom_perms": [],
 "doctype": "DocType Name",
 "links": [],
 "property_setters": [ ... ],
 "sync_on_migrate": 1
}
```

---

## Custom Field — Full Schema

All fields that `export_customizations` includes (via `frappe.get_all("Custom Field", fields="*")`). The `add_customization.py` script fills in these defaults for any field not provided in the spec.

```json
{
 "_assign": null,
 "_comments": null,
 "_liked_by": null,
 "_user_tags": null,
 "allow_on_submit": 0,
 "bold": 0,
 "collapsible": 0,
 "collapsible_depends_on": null,
 "columns": 0,
 "creation": "<timestamp>",
 "default": null,
 "depends_on": null,
 "description": null,
 "docstatus": 0,
 "dt": "DocType Name",
 "fetch_from": null,
 "fetch_if_empty": 0,
 "fieldname": "my_field",
 "fieldtype": "Data",
 "hidden": 0,
 "idx": 0,
 "ignore_user_permissions": 0,
 "ignore_xss_filter": 0,
 "in_global_search": 0,
 "in_list_view": 0,
 "in_standard_filter": 0,
 "insert_after": "existing_field",
 "label": "My Field",
 "length": 0,
 "modified": "<timestamp>",
 "modified_by": "Administrator",
 "name": "DocType Name-my_field",
 "no_copy": 0,
 "options": null,
 "owner": "Administrator",
 "parent": null,
 "parentfield": null,
 "parenttype": null,
 "permlevel": 0,
 "precision": "",
 "print_hide": 0,
 "print_hide_if_no_value": 0,
 "print_width": null,
 "read_only": 0,
 "report_hide": 0,
 "reqd": 0,
 "search_index": 0,
 "translatable": 0,
 "unique": 0,
 "width": null
}
```

**Required spec fields:** `dt`, `fieldname`, `fieldtype`, `label`, `insert_after`  
**Computed by script:** `name` (`"{dt}-{fieldname}"`), `creation`, `modified`

---

## Property Setter — Full Schema

```json
{
 "_assign": null,
 "_comments": null,
 "_liked_by": null,
 "_user_tags": null,
 "creation": "<timestamp>",
 "doc_type": "DocType Name",
 "docstatus": 0,
 "doctype_or_field": "DocField",
 "field_name": "existing_field",
 "is_system_generated": 0,
 "modified": "<timestamp>",
 "modified_by": "Administrator",
 "module": null,
 "name": "DocType Name-existing_field-reqd",
 "owner": "Administrator",
 "parent": null,
 "parentfield": null,
 "parenttype": null,
 "property": "reqd",
 "property_type": "Check",
 "row_name": null,
 "value": "1"
}
```

**Required spec fields:** `doc_type`, `property`, `value`, `property_type`  
**Optional:** `field_name` (omit or `null` for DocType-level; script sets `doctype_or_field: "DocType"` automatically)  
**Computed by script:** `name` (`"{doc_type}-{field_name or 'main'}-{property}"`), `creation`, `modified`

---

## Common `property_type` Values

| Property | `property_type` |
|---|---|
| `reqd`, `hidden`, `bold`, `read_only`, `in_list_view`, `in_standard_filter`, `allow_on_submit`, `search_index` | `Check` |
| `label`, `description`, `default`, `options`, `fetch_from` | `Data` |
| `fieldtype` | `Data` |
| `permlevel` | `Int` |
| `depends_on`, `mandatory_depends_on`, `read_only_depends_on` | `Code` |

---

## Layout Fieldtypes (exclude by default)

`Section Break`, `Column Break`, `Tab Break`
