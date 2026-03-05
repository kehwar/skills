# Standard Script Report JSON Schema

## Source Schema Files

- `apps/frappe/frappe/core/doctype/report/report.json`


## Minimal Report JSON (Standard Script Report)

Required metadata fields for standard file-based reports:
- `doctype`: `"Report"`
- `name`: display report name
- `report_name`: same display report name
- `ref_doctype`: target DocType
- `report_type`: `"Script Report"`
- `is_standard`: `"Yes"` for file-backed standard reports
- `module`: module name

Common operational fields:
- `disabled`: `0` or `1`
- `prepared_report`: `0` or `1`
- `add_total_row`: `0` or `1`
- `roles`: array of `{ "role": "Role Name" }`

## Key Standard Script Report Difference

For standard Script Reports, report `.json` is metadata. The runtime contract is code files:
- Columns come from Python `execute(filters=None)` return value in `{scrubbed_name}.py`.
- UI filters come from `frappe.query_reports["Report Name"].filters` in `{scrubbed_name}.js`.

Because of this, avoid treating `columns` and `filters` JSON child rows as the primary source for standard Script Reports.

## JSON Example (Standard Script Report Metadata)

```json
{
  "doctype": "Report",
  "name": "Sales KPI Snapshot",
  "report_name": "Sales KPI Snapshot",
  "ref_doctype": "Sales Invoice",
  "report_type": "Script Report",
  "is_standard": "Yes",
  "module": "Accounts",
  "disabled": 0,
  "prepared_report": 0,
  "add_total_row": 1,
  "roles": [
    { "role": "Accounts User" }
  ]
}
```

## Where Columns and Filters Actually Live

Script Report columns are returned from Python:

```python
def execute(filters=None):
    columns = [
        {"label": "Customer", "fieldname": "customer", "fieldtype": "Link", "options": "Customer", "width": 220},
    ]
    data = []
    return columns, data
```

Script Report UI filters are defined in JavaScript:

```javascript
frappe.query_reports["Sales KPI Snapshot"] = {
    filters: [
        {
            fieldname: "from_date",
            label: __("From Date"),
            fieldtype: "Date",
            reqd: 1,
        },
    ],
};
```

## Validation Tips

- Keep `name` and `report_name` aligned.
- Keep `module` aligned with folder location.
- Keep Script Report columns in `.py`, not report `.json`.
- Keep Script Report filters in `.js`, not report `.json`.
- For Script Reports, keep report `.json` focused on metadata.
