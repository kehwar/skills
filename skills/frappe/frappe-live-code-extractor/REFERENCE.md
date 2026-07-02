# frappe-live-code-extractor Reference

## Supported artifact types

All artifact types are config-driven. Every doctype — whether a built-in Frappe type or
a custom app type — uses a `config.json` that lives at `<app>/live/<doctype-slug>/config.json`.
Built-in defaults are bundled under `assets/` and are copied into the app tree automatically
on the first run.

| Artifact | Output directory | Code file(s) | Filter |
|---|---|---|---|
| Server Script (API) | `live/server-script/api/` | `script.py` | all |
| Server Script (DocType Event) | `live/server-script/doctype-event/` | `script.py` | all |
| Server Script (Scheduler Event) | `live/server-script/scheduler-event/` | `script.py` | all |
| Server Script (Permission Query) | `live/server-script/permission-query/` | `script.py` | all |
| Client Script | `live/client-script/` | `script.js` | all |
| Print Format (Jinja) | `live/print-format/` | `html.html`, `css.css`*, `raw_commands.txt`* | `standard != 'Yes'` |
| Print Format (Print Designer) | `live/print-format/` | `format_data.json`*, `print_designer_*.json`*, `css.css`*, `raw_commands.txt`* | `standard != 'Yes'` |
| Report (Query) | `live/report/query/` | `query.sql`, `javascript.js`*, `json.json`* | `is_standard = 'No'` |
| Report (Script) | `live/report/script/` | `report_script.py`, `javascript.js`*, `json.json`* | `is_standard = 'No'` |
| Report (Builder) | `live/report/builder/` | `json.json`* | `is_standard = 'No'` |
| Notification | `live/notification/` | `message.md` or `message.html`, `condition.py`* | all |
| Email Template | `live/email-template/` | `response_html.html`* | all |
| Letter Head | `live/letter-head/` | `content.html`*, `footer.html`*, `header_script.js`*, `footer_script.js`* | all |
| Terms and Conditions | `live/terms-and-conditions/` | `terms.html`* | all |
| Any other DocType | `live/<doctype-slug>/` | Configured via `config.json` | Configured via `filters` |

\* = skipped when the source field is empty. Print Designer fields (`print_designer_*`) are extracted unconditionally.

## Output location

```
apps/<app>/<app>/live/
  server-script/{api,doctype-event,scheduler-event,permission-query}/<slug>/
  client-script/<slug>/
  print-format/<slug>/
  report/{query,script,builder}/<slug>/
  notification/<slug>/
  email-template/<slug>/
  letter-head/<slug>/
  <any-doctype-slug>/<slug>/      # every doctype uses live/<doctype-slug>/
```

Each doctype directory also contains its `config.json` (copied from skill assets on first run
or written manually for custom doctypes).

`<slug>` = artifact `name` lowercased with non-alphanumeric chars replaced by hyphens.
Collisions get a numeric suffix (`my-script`, `my-script-2`, …), assigned alphabetically for stability.

## meta.json format

Every slug directory contains a `meta.json` with all non-code fields plus an `_extracted` map:

```json
{
  "name": "My API Script",
  "script_type": "API",
  "disabled": 0,
  "_extracted": {
    "script": "script.py"
  }
}
```

JSON code files (`.json`) are pretty-printed with `indent=2`.

## Idempotency and staleness

- Re-running produces an identical file tree (deterministic slugs, stable output)
- Directories for deleted DB records are removed on the next run
- `config.json` files are always preserved

## Error handling

One bad record doesn't abort the run. Errors are collected and reported at the end:

```
  server-script: 142
  client-script: 36
  ...
Total: 240 extracted, 0 deleted

⚠️  Extraction errors occurred:
  [Server Script] Corrupted API Script
    UnicodeDecodeError: 'utf-8' codec can't decode byte 0xff in position 42
```

Exits with code 1 if any errors occurred.

## Searching across both trees

```bash
# From the bench root — covers source + live tree
cd /workspace/development/frappe-bench
grep -r "some_function" apps/myapp/myapp/

# Narrow to Python only
grep -rn --include='*.py' "some_function" apps/myapp/myapp/

# Find all references to a DocType in scripts
grep -r "My DocType" apps/myapp/myapp/live/

# Find by Server Script content
grep -r "frappe.enqueue" apps/myapp/myapp/live/server-script/
```

## Advanced usage

**Extract from a specific site:**

```bash
./env/bin/python skills/.agents/skills/frappe-live-code-extractor/scripts/extract.py \
  --site production.localhost --app myapp
```

**Extract multiple apps** (run once per app):

```bash
./env/bin/python skills/.agents/skills/frappe-live-code-extractor/scripts/extract.py --app myapp
./env/bin/python skills/.agents/skills/frappe-live-code-extractor/scripts/extract.py --app myapp2
./env/bin/python skills/.agents/skills/frappe-live-code-extractor/scripts/extract.py --app myapp3
```

## Integration with git

The `live/` directory is inside the app's module directory and tracked by git:

```bash
# Refresh the snapshot
./env/bin/python skills/.agents/skills/frappe-live-code-extractor/scripts/extract.py --app myapp

# See what changed
cd apps/myapp && git diff myapp/live/

# Commit meaningful changes
git add myapp/live/
git commit -m "chore: refresh live code snapshot"
```

## Troubleshooting

| Problem | Solution |
|---|---|
| `ImportError: No module named frappe` | Use `./env/bin/python`, not system Python |
| `Error: could not infer app` | Pass `--app myapp` explicitly |
| `UnicodeDecodeError` | Extractor skips that record; fix data in DB or mark disabled |
| `live/` directory too large | Re-run; stale dirs for deleted records are removed automatically |

## config.json format

### Required fields

- `doctype` (string) — exact DocType name (case-sensitive)
- `code_fields` (array) — fields to extract (see schema below)

### Optional fields

- `group_by_field` (string | string[] | null) — field (or ordered list of fields) to group records into subdirectories; see [Multi-field grouping](#multi-field-grouping) below
- `group_by_map` (object) — maps field values to friendly dir names (`{"API": "api", "DocType Event": "doctype-event"}`)
- `filters` (object) — Frappe-style filters for `frappe.get_all()` (`{"standard": ["!=", "Yes"], "disabled": 0}`)
- `description` (string) — human-readable description of the doctype

### Multi-field grouping

When `group_by_field` is an array, each record is assigned to the **first field in the list that has a non-empty value**. The folder structure becomes:

```
live/my-custom-doctype/
  <field_name>/          ← raw field name (e.g. reference_doctype)
    <value_slug>/        ← slugified field value (e.g. user)
      <record_slug>/
        meta.json
        <code_files>
  _ungrouped/            ← no field in the list had a value
    <record_slug>/
```

Example: `["linked_doctype", "linked_report"]` — a record with `linked_doctype = "Customer"` lands in `linked_doctype/customer/`; a record with only `linked_report = "Sales Register"` lands in `linked_report/sales-register/`; a record with neither lands in `_ungrouped/`.

### code_fields schema

| Key | Required | Default | Description |
|---|---|---|---|
| `field` | yes | — | DocType field name to extract |
| `filename` | conditional | — | Output filename; required unless using `ext_from_field` |
| `skip_if_field_populated` | no | — | Skip if another field has content (mutual exclusion) |
| `skip_if_field_false` | no | — | Skip if a boolean/truthy field is false/empty |
| `only_for_groups` | no | — | Extract only for these group values (requires `group_by_field`) |
| `exclude_for_groups` | no | — | Skip for these group values (requires `group_by_field`) |
| `ext_from_field` | no | — | Field whose value determines the file extension |
| `ext_map` | no | — | Maps field values to extensions (e.g., `{"Python": ".py"}`) |
| `ext_default` | no | — | Default extension when value not in `ext_map` |

When using `ext_from_field`, omit `filename` — output is `<field><ext>` (e.g., `filters.py`).

## Config examples

### Example 1: Simple doctype

```json
{
  "doctype": "My Custom Script",
  "group_by_field": "category",
  "code_fields": [{ "field": "script", "filename": "script.py" }],
  "description": "Custom server-side scripts."
}
```

### Example 2: Dynamic extension + multi-field grouping (My Custom Rule)

```json
{
  "doctype": "My Custom Rule",
  "group_by_field": ["linked_doctype", "linked_report"],
  "code_fields": [
    {
      "field": "condition",
      "ext_from_field": "condition_type",
      "ext_map": { "Python": ".py", "JSON": ".json", "SQL": ".sql" },
      "ext_default": ".txt"
    }
  ],
  "description": "Custom rules. Grouped by first non-empty of linked_doctype / linked_report."
}
```

Output:
```
doctype/my-custom-rule/
  linked_doctype/customer/<record>/{meta.json, condition.json}
  linked_report/sales-register/<record>/{meta.json, condition.py}
  _ungrouped/<record>/…
```

### Example 3: Mutual exclusion (Print Format)

```json
{
  "doctype": "Print Format",
  "group_by_field": null,
  "code_fields": [
    { "field": "html", "filename": "html.html", "skip_if_field_populated": "format_data" },
    { "field": "format_data", "filename": "format_data.json", "skip_if_field_populated": "html" },
    { "field": "css", "filename": "css.css" }
  ],
  "filters": { "standard": ["!=", "Yes"] }
}
```

### Example 4: Per-group fields (Report)

```json
{
  "doctype": "Report",
  "group_by_field": "report_type",
  "group_by_map": { "Query Report": "query", "Script Report": "script", "Report Builder": "builder" },
  "code_fields": [
    { "field": "query", "filename": "query.sql", "only_for_groups": ["query"] },
    { "field": "report_script", "filename": "report_script.py", "only_for_groups": ["script"] },
    { "field": "javascript", "filename": "javascript.js", "exclude_for_groups": ["builder"] }
  ],
  "filters": { "is_standard": "No" }
}
```

## Standard doctype configs

Bundled default configs for all built-in Frappe / ERPNext artifact types live in:

```
skills/.agents/skills/frappe-live-code-extractor/assets/
  server_script.json
  client_script.json
  print_format.json
  report.json
  notification.json
  email_template.json
  letter_head.json
  terms_and_conditions.json
  assignment_rule.json
  workflow_transition.json
  ...
```

On the first run for a given app, each asset config is automatically copied to
`<app>/live/<doctype-slug>/config.json`. After that the app-side copy is used,
so you can customise it without affecting other apps.

## End-to-end example: adding My Custom Script

```bash
# 1. Discover fields
cd /workspace/development/frappe-bench
./env/bin/python -c "
import os; os.environ['FRAPPE_STREAM_LOGGING'] = '1'
import frappe
frappe.init(site='development.localhost', sites_path='sites'); frappe.connect()
meta = frappe.get_meta('My Custom Script')
for f in meta.fields:
    if f.fieldtype in ['Code','Text','Long Text','Select','Link']:
        print(f.fieldname, f.fieldtype, f.label)
frappe.destroy()
"
# → script (Code), category (Select: General/Utility)

# 2. Create config
mkdir -p apps/myapp/myapp/live/my-custom-script
cat > apps/myapp/myapp/live/my-custom-script/config.json << 'EOF'
{
  "doctype": "My Custom Script",
  "group_by_field": "category",
  "code_fields": [{ "field": "script", "filename": "script.py" }],
  "description": "Custom server-side scripts."
}
EOF

# 3. Run extraction
./env/bin/python skills/.agents/skills/frappe-live-code-extractor/scripts/extract.py --app myapp

# 4. Commit
cd apps/myapp
git add myapp/live/my-custom-script/
git commit -m "feat: add My Custom Script extraction config"
```
