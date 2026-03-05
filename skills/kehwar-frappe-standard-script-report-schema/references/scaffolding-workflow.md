# Scaffolding Workflow

## Source of Truth

Implementation behavior comes from:
- `apps/frappe/frappe/core/doctype/report/report.py`
- `apps/frappe/frappe/modules/export_file.py`
- `apps/frappe/frappe/modules/utils.py`

## UI-Driven Scaffolding (Canonical)

Use this when creating a new standard Script Report from Desk.

1. Open Report list and create a new Report.
2. Set `report_name`, `ref_doctype`, `report_type = "Script Report"`, `module`, and `is_standard = "Yes"`.
3. Save as `Administrator` while `developer_mode = 1`.
4. Verify files are generated under `{module}/report/{scrubbed_name}/`.

Expected output:
- `{scrubbed_name}.json`
- `{scrubbed_name}.py` (if missing)
- `{scrubbed_name}.js` (if missing)

## Manual Scaffolding (Direct File Creation)

Use this when you want deterministic file control without relying on UI generation.

1. Create path:
`{app}/{module}/report/{scrubbed_name}/`
2. Add empty `__init__.py`.
3. Add `{scrubbed_name}.json` using `assets/report.template.json` as base.
4. Add `{scrubbed_name}.py` using `assets/report.template.py` as base.
5. Add `{scrubbed_name}.js` using `assets/report.template.js` as base.
6. Run migration/reload flow used by your project to sync metadata.

Standard Script Report ownership:
- Columns are defined in Python (`.py`).
- Filters are defined in JavaScript (`.js`).
- Report `.json` stays metadata-focused.

## Naming and Path Rules

- File and folder use scrubbed name.
- JSON `name` and `report_name` use human display name.
- `module` in JSON must match module path on disk.
- Place files in the correct app package for that module.

## How To Use Template Assets

1. Copy templates into the target report folder and rename by scrubbed report name:

```bash
cp assets/report.template.json {target_path}/{scrubbed_name}.json
cp assets/report.template.py {target_path}/{scrubbed_name}.py
cp assets/report.template.js {target_path}/{scrubbed_name}.js
```

2. Replace placeholders:
- In `.json`: `__REPORT_NAME__`, `__REF_DOCTYPE__`, `__MODULE__`
- In `.py`: `__YEAR__`, `__APP_PUBLISHER__` (optional), then implement real columns/data logic
- In `.js`: `__REPORT_NAME__`, `__YEAR__`, `__APP_PUBLISHER__` (optional), then define real filters

3. Keep naming consistent:
- `.js` key must match the display report name exactly.
- File/folder names must remain scrubbed.
- JSON `module` must match the module path.

## Troubleshooting Checklist

1. Files not generated after save:
- Check `developer_mode` is enabled.
- Check `is_standard` is `"Yes"`.
- Check save user is `Administrator`.
2. Script files missing for Script Report:
- Confirm `report_type` is exactly `"Script Report"`.
- Confirm files were not already present with different scrubbed name.
3. Report not loading script:
- Confirm `{scrubbed_name}.py` exports `execute(filters=None)`.
- Confirm `.py` returns columns and data in valid format.
- Confirm `{scrubbed_name}.js` declares key with exact report display name.
- Confirm JSON `module` and file path point to same module.

## CLI Note

There is no dedicated `bench create-report` scaffolding command. Primary creation path is UI save in development mode, or direct file authoring.
