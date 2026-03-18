---
name: frappe-standard-script-report-schema
description: Guidance for scaffolding and maintaining Frappe standard Script Reports in code, with emphasis on report .json metadata shape and file-based behavior. Use when creating/editing standard Script Report folders, structuring report .json metadata, and defining filters/columns via .js and .py.
---

# Frappe Standard Script Report Schema

Use this skill when the task is about standard Script Report scaffolding and metadata structure in Frappe.

## Scope

- Scaffolding standard Script Reports through Desk UI in `developer_mode`.
- Manually creating or editing standard Script Report files on disk.
- Structuring `report_name.json` for standard Script Report metadata.
- Defining columns in Python `execute(filters=None)`.
- Defining UI filters in report JavaScript (`frappe.query_reports[...]`).
- Troubleshooting common file-scaffolding mismatches.

This skill is intentionally narrow. It does not cover deep report business logic design.

## Canonical Scaffolding Flow

For standard Script Reports created from UI in development mode, Frappe writes files automatically:

1. Save Report document.
2. `Report.on_update()` calls `export_doc()`.
3. `export_doc()` calls `export_to_files(...)` when `is_standard == "Yes"` and `developer_mode == 1`.
4. For Script Reports only, `create_report_py()` calls `make_boilerplate()` for `.py` and `.js`.

Authoritative sources:
- `apps/frappe/frappe/core/doctype/report/report.py`
- `apps/frappe/frappe/modules/export_file.py`
- `apps/frappe/frappe/modules/utils.py`

## Standard Report Rules

- Standard Script Report generation: `is_standard = "Yes"`, `report_type = "Script Report"`, and `developer_mode = 1`
- Report JSON is exported to module path.
- Script Report gets `.py` and `.js` boilerplate when missing.

- For standard Script Reports:
- Columns are defined in Python return values from `execute(filters=None)`.
- Filters shown in the UI are defined in report `.js` (`frappe.query_reports["Report Name"].filters`).
- Do not treat `columns` and `filters` in report `.json` as the canonical source for standard Script Reports.

Out of scope: Query Reports and Report Builder behavior.

No dedicated bench command exists for report scaffolding. Use Desk UI or direct file authoring.

## Direct File Scaffolding Workflow

When creating/editing reports manually, keep this folder structure:

```text
{app}/{module}/report/{scrubbed_report_name}/
  __init__.py
  {scrubbed_report_name}.json
  {scrubbed_report_name}.py   # Script Report only
  {scrubbed_report_name}.js   # Script Report only
```

Rules:
- Folder and filenames must use scrubbed report name (spaces to underscores, lowercase).
- `report_name` inside JSON remains display name, not scrubbed file name.
- Keep `module` aligned with the app module directory where files live.
- Ensure `is_standard` is `"Yes"` for file-based reports.
- Define columns in `.py` and filters in `.js` for standard Script Reports.

## What To Load Next

- Read `references/scaffolding-workflow.md` when implementing UI/manual scaffolding or troubleshooting missing files.
- Read `references/report-json-schema.md` when authoring or validating `report_name.json`.
- Use `assets/report.template.json` as the metadata base template.
- Use `assets/report.template.py` as the Script Report execution template.
- Use `assets/report.template.js` as the Script Report filter UI template.
