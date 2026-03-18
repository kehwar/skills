---
name: frappe-standard-script-report-schema
description: Create and edit Frappe Script Report `.json` schema files through Frappe's document engine. Use when scaffolding new standard Script Reports, adding/modifying report metadata, roles, or permissions in an existing report's JSON schema. Result is identical to a developer saving a Report via the Frappe UI in developer mode — canonical JSON exported, `.py`/`.js` scaffolded for new reports only.
---

# Frappe Standard Script Report Schema

Companion to `frappe-standard-script-report-controller` (`.py`) and `frappe-standard-script-report-view` (`.js`). This skill covers the `.json` schema only.

Manipulate Script Report schemas through Frappe's document engine. Output is identical to a developer saving a Report in the Frappe UI in developer mode: Frappe exports canonical JSON and scaffolds missing `.py`/`.js` controller files.

## Quick Start

```bash
# From frappe-bench root
env/bin/python <skill_dir>/scripts/save_report.py <path/to/report.json>
```

`<skill_dir>` = `/workspace/development/frappe-bench/skills/.agents/skills/frappe-standard-script-report-schema`

**No `bench migrate` required** — reports do not change database schema.

## Workflow

### New Report
1. Write desired-state JSON (see skeleton below) at any writable path
2. Run `save_report.py` — Frappe inserts the doc, exports canonical JSON, scaffolds `.py` and `.js`
3. The `.py` stub (`execute(filters=None)`) and `.js` stub (`frappe.query_reports["Name"] = { filters: [] }`) are written only if they do not already exist

Canonical output directory (printed by script):
```
apps/<app>/<app>/<module_scrubbed>/report/<report_name_scrubbed>/
```

### Editing an Existing Report
1. Read the existing `.json` with `read_file` to get current state
2. Build **complete desired-state JSON** (full replace — every field must be present)
3. Run `save_report.py` — Frappe updates the doc and re-exports JSON
4. Existing `.py` and `.js` are **not touched** — only missing files are scaffolded

## Minimal Valid JSON

```json
{
  "doctype": "Report",
  "report_name": "My Sales Summary",
  "ref_doctype": "Sales Invoice",
  "report_type": "Script Report",
  "is_standard": "Yes",
  "module": "Accounts",
  "add_total_row": 0,
  "disabled": 0,
  "prepared_report": 1,
  "roles": [
    { "role": "System Manager" }
  ]
}
```

> `name` is auto-derived from `report_name` (autoname rule: `field:report_name`). You may include `"name": "My Sales Summary"` for clarity — it must match `report_name`.

## Key Fields

| Field | Type | Notes |
|---|---|---|
| `report_name` | Data | **Primary key.** Must be unique. |
| `ref_doctype` | Link → DocType | **Required.** The doctype this report is "about". Drives default roles. |
| `module` | Link → Module Def | **Always specify.** Determines where files are exported. |
| `is_standard` | `"Yes"` | **Required** for file-backed reports. `"No"` = custom report stored only in DB. |
| `report_type` | `"Script Report"` | Fixed for this skill. |
| `add_total_row` | 0 / 1 | Adds a totals row at the bottom. |
| `disabled` | 0 / 1 | Hides the report from menus. |
| `prepared_report` | 0 / 1 | **Preferred: always set to `1`.** Runs the report async and caches results; prevents timeouts on heavy queries. |
| `timeout` | Int | Custom timeout in seconds (only meaningful when `prepared_report = 1`). |
| `roles` | Table (see below) | Who can run the report. Empty = all users. |

## `roles` Child Table

Each entry is a `Has Role` row:

```json
"roles": [
  { "role": "Accounts User" },
  { "role": "Stock User" }
]
```

## Filters → always in `.js`, never in JSON

**Do not add a `filters` child table to Script Report JSON.** Frappe reads filter definitions from `frappe.query_reports["Name"].filters` in the on-disk `.js` file at runtime. Define all filters there.

## Columns → always returned from `.py`, never in JSON

**Do not add a `columns` child table to Script Report JSON.** Script Reports always return columns dynamically from `execute()`. Declare them in the Python return value, not in the schema.

## DO NOT Set in Agent-Authored JSON

- `creation`, `modified`, `modified_by`, `owner` — managed by Frappe on save
- `filters` — **always in the `.js` file**, never in the JSON schema
- `columns` — **always returned from `execute()` in `.py`**, never in the JSON schema
- `query` — only for `"report_type": "Query Report"`
- `report_script` — only for non-standard (`is_standard: "No"`) Script Reports stored in DB
- `javascript` — only for non-standard Script Reports stored in DB; for standard reports, the JS lives in the on-disk `.js` file, not in the schema

## On-Disk File Layout

After running `save_report.py`, the report folder contains:

```
apps/<app>/<app>/<module_scrubbed>/report/<name_scrubbed>/
├── <name_scrubbed>.json   ← canonical schema (managed by Frappe, do not hand-edit)
├── <name_scrubbed>.py     ← execute() implementation (scaffolded once, then yours to edit)
└── <name_scrubbed>.js     ← frappe.query_reports["…"] filter definitions (scaffolded once)
```

The `.py` and `.js` are only written when the file is **absent**. Re-running `save_report.py` on an existing report never overwrites them.

## `.py` Stub (auto-scaffolded)

```python
# Copyright (c) {year}, {publisher} and contributors
# For license information, please see license.txt

# import frappe


def execute(filters=None):
    columns, data = [], []
    return columns, data
```

`execute()` must return `(columns, data)`:
- `columns` — list of column dicts or `"fieldname:Label:width"` strings
- `data` — list of row dicts (keys matching column `fieldname` values)

## `.js` Stub (auto-scaffolded)

```js
// Copyright (c) {year}, {publisher} and contributors
// For license information, please see license.txt

frappe.query_reports["My Sales Summary"] = {
    "filters": [
        // add filter objects here
    ]
};
```

Filter objects use the same shape as standard Frappe filter field dicts (same fields as `Report Filter` child table).
