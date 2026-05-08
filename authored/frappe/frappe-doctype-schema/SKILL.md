---
name: frappe-doctype-schema
description: Create and edit Frappe DocType `.json` schema files through Frappe's document engine. Use when scaffolding new doctypes, adding/modifying/removing fields in an existing doctype's JSON schema, or changing doctype properties (permissions, naming rules, flags, etc.). Result is identical to a developer saving a DocType via the Frappe UI in developer mode — canonical JSON exported, `.py`/`.js`/`test_.py` scaffolded for new doctypes.
---

# Frappe DocType Schema

Manipulate DocType schemas through Frappe's document engine. Output is identical to a developer saving a DocType via the UI in developer mode: Frappe exports canonical JSON and scaffolds missing controller files.

See [frappe-doctype-controller](../frappe-doctype-controller/SKILL.md) for implementing the `.py` controller class (hooks, lifecycle, Document API).
See [frappe-doctype-form-view](../frappe-doctype-form-view/SKILL.md) for the `.js` form controller.
See [frappe-doctype-list-view](../frappe-doctype-list-view/SKILL.md) for the `_list.js` list view controller.
See [frappe-doctype-tests](../frappe-doctype-tests/SKILL.md) for writing DocType controller Python tests.

## Quick Start

```bash
# From frappe-bench root
env/bin/python <skill_dir>/scripts/save_doctype.py <path/to/doctype.json>
bench migrate
```

`<skill_dir>` = absolute path to this skill folder (`/workspace/development/frappe-bench/skills/.agents/skills/frappe-doctype-schema`).

## Workflow

### New DocType
1. Write desired-state JSON (see skeleton below) at any writable path
2. Run `save_doctype.py` — Frappe inserts the doc, exports canonical JSON + scaffolds `.py`/`.js`/`test_.py`
3. Run `bench migrate`

Canonical output directory (printed by script):
`apps/<app>/<app>/<module_scrubbed>/doctype/<name_scrubbed>/`

### Editing an Existing DocType
1. Read the existing `.json` with `read_file` to get current state
2. Build **complete desired-state JSON** (full replace — every field must be present)
3. Run `save_doctype.py` — Frappe updates the doc and re-exports JSON
4. Run `bench migrate` only if DB schema changed (new columns, type changes, field removal)

## Minimal Valid JSON

```json
{
  "doctype": "DocType",
  "name": "My DocType",
  "module": "My Module",
  "fields": [
    {
      "fieldname": "my_field",
      "fieldtype": "Data",
      "label": "My Field"
    }
  ],
  "permissions": [
    {
      "role": "System Manager",
      "read": 1, "write": 1, "create": 1, "delete": 1,
      "email": 1, "print": 1, "report": 1, "export": 1, "share": 1
    }
  ]
}
```

For child tables (`"istable": 1`): omit `permissions` entirely.

## Key DocType Flags

| Flag | Purpose |
|------|---------|
| `"istable": 1` | Child table — no permissions, no standalone form |
| `"issingle": 1` | Singleton — no DB rows, one instance stored in `tabSingles` |
| `"is_submittable": 1` | Enables Submit/Cancel/Amend; auto-adds `amended_from` field |
| `"is_virtual": 1` | No DB table — controller provides data |
| `"editable_grid": 1` | Inline row editing in child table grid |
| `"track_changes": 1` | Tracks document history (version control) |
| `"title_field": "fieldname"` | Field used as display title |
| `"search_fields": "f1,f2"` | Fields shown in Link field search results |

## Naming

| `naming_rule` | `autoname` value | Behaviour |
|---|---|---|
| `"Set by user"` | *(omit)* | User types the name manually |
| `"By fieldname"` | `"field:fieldname"` | Name = value of that field |
| `"By script"` | `"naming_series:"` or custom | Controller sets `self.name` |
| `"Random"` | `"hash"` | Random 10-char hash (Frappe default when omitted) |
| `"Autoincrement"` | `"autoincrement"` | Auto-incrementing integer |

## DO NOT Set in Agent-Authored JSON

- `creation`, `modified`, `modified_by`, `owner` — managed by Frappe on save
- `field_order` — auto-derived from `fields` array order on save
- `migration_hash` — internal Frappe tracking field

## Full Reference

- [references/json-schema.md](references/json-schema.md) — field types, all field properties, all doctype properties, permissions
