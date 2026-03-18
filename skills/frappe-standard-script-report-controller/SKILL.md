---
name: frappe-standard-script-report-controller
description: Expert guidance for writing the .py controller for a Frappe Standard Script Report. Covers the execute() contract, column definition (dict format + full fieldtype reference), data fetching with frappe.get_all / frappe.db.sql / frappe.qb, permission-aware queries with build_match_conditions, and reusable get_columns() export patterns.
---

# Frappe Standard Script Report — Python Controller

Companion to `frappe-standard-script-report-schema` (`.json`) and `frappe-standard-script-report-view` (`.js`). This skill covers the `.py` controller only.

## Golden Rule

`execute(filters=None)` **must return `(columns, data)`** — a list of column definitions and a list of row dicts.

---

## Skeleton

```python
# Copyright (c) 2026, <your company> and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe import _


def execute(filters=None):
    filters = frappe._dict(filters or {})
    columns = get_columns()
    data = get_data(filters)
    return columns, data


def get_columns():
    return [
        {
            "fieldname": "name",
            "label": _("Document"),
            "fieldtype": "Link",
            "options": "Sales Invoice",
            "width": 180,
        },
        {
            "fieldname": "customer",
            "label": _("Customer"),
            "fieldtype": "Link",
            "options": "Customer",
            "width": 200,
        },
        {
            "fieldname": "grand_total",
            "label": _("Grand Total"),
            "fieldtype": "Currency",
            "width": 130,
        },
    ]


def get_data(filters):
    return frappe.get_all(
        "Sales Invoice",
        filters={"docstatus": 1},
        fields=["name", "customer", "grand_total"],
        order_by="posting_date desc",
        limit=0,
    )
```

---

## The `execute()` Contract

```python
def execute(filters=None) -> tuple[list, list]:
    filters = frappe._dict(filters or {})  # always normalise
    ...
    return columns, data
```

Always wrap `filters` with `frappe._dict(filters or {})` — this allows safe attribute access (`filters.company`) and safe `.get()` calls without KeyError.

### Columns
List of column definition dicts (see [Columns](#columns) below).

### Data
List of **row dicts** — one key per `fieldname` declared in columns. Extra keys in the row dict are silently ignored by the UI. Rows can also be plain lists when `frappe.db.sql(..., as_list=1)` is used; in that case each row is positionally aligned with the columns list.

### Extended return values (out of scope)
`execute()` may return up to four values: `columns, data, message, chart`. The `message` (HTML string) and `chart` (chart config dict) are shown above/below the table. These are rarely needed and not covered here.

---

## Columns

### Column dict properties

| Property | Required | Notes |
|---|---|---|
| `fieldname` | Yes | `snake_case` key — must match the key in each row dict |
| `label` | Yes | Always wrap in `_("...")` for translation |
| `fieldtype` | Yes | See fieldtype reference below |
| `options` | Depends | Required for `Link` and `Dynamic Link` |
| `width` | No | Pixels. `0` = minimal/invisible width (useful for type-holder columns). Default ~100 |
| `hidden` | No | `1` = column not rendered in the table, but the value is still present in the row |
| `convertible` | No | `"rate"` or `"amount"` — enables currency conversion toolbar button |

### Fieldtype reference

| `fieldtype` | Notes | Requires `options`? |
|---|---|---|
| `Data` | Plain text string | No |
| `Date` | Formatted date | No |
| `Datetime` | Date + time | No |
| `Time` | HH:MM:SS | No |
| `Int` | Integer, right-aligned | No |
| `Float` | Decimal, right-aligned | No |
| `Currency` | Decimal + currency symbol, right-aligned | No |
| `Percent` | Decimal displayed as `n%` | No |
| `Check` | Boolean — rendered as tick/cross | No |
| `Small Text` | Multi-line text (no rich formatting) | No |
| `HTML` | Raw HTML string rendered in cell | No |
| `Link` | Hyperlink to a document | Yes — `options: "DocType"` |
| `Dynamic Link` | Link whose doctype is held in another column | Yes — `options: "<fieldname of type column>"` |
| `Select` | Displayed as plain text | No |
| `Duration` | Time duration in seconds, rendered as `Xh Ym Zs` | No |
| `Color` | Hex color swatch | No |

#### `Link` example
```python
{
    "fieldname": "customer",
    "label": _("Customer"),
    "fieldtype": "Link",
    "options": "Customer",
    "width": 200,
}
```

#### `Dynamic Link` example
The `options` value is the **fieldname** of the column that holds the doctype name. Set `width: 0` on the type column to hide it while keeping it available for resolution:

```python
{"fieldname": "doc_type", "label": _("Doc Type"), "fieldtype": "Link",         "options": "DocType",   "width": 0},
{"fieldname": "doc_name", "label": _("Document"),  "fieldtype": "Dynamic Link", "options": "doc_type",  "width": 180},
```

#### `Currency` vs `Float`
Use `Currency` for monetary amounts — it picks up the active currency symbol in the UI and respects `convertible: "amount"`. Use `Float` for non-monetary decimals.

#### Hidden metadata columns
Use `hidden: 1` to pass structured data to the JS formatter without displaying it. You can attach an arbitrary `meta` key for the JS side to read:

```python
{
    "fieldname": "_meta",
    "fieldtype": "Data",
    "hidden": 1,
    "meta": {"evaluations": [...]},  # arbitrary payload, accessible in JS formatter
}
```

#### Report-level metadata (`_meta` convention)

Frappe reports have no native mechanism for returning metadata about the report as a whole (as opposed to per-row values). The established convention is to carry report-level metadata in a hidden `_meta` column defined in `get_columns()`, with the payload attached to the column definition itself (not to any row). The JS formatter reads this from `report.columns`.

```python
def get_columns():
    meta = {
        "currency": frappe.defaults.get_global_default("currency"),
        "company": frappe.defaults.get_global_default("company"),
        # any other report-wide values the JS layer needs
    }

    return [
        {
            "fieldname": "_meta",
            "label": "_meta",
            "fieldtype": "Data",
            "hidden": 1,
            "meta": meta,
        },
        # ... rest of columns
    ]
```

On the JS side (`formatter` or `onload`):

```js
const meta = report.columns.find(c => c.fieldname === "_meta")?.meta ?? {};
```

> Do **not** populate `_meta` values in individual row dicts — the payload lives on the column definition, not on rows. This keeps per-row data clean and avoids sending the same metadata payload for every row.

#### Legacy string format
You may encounter `_("Customer") + ":Link/Customer:150"` in older ERPNext code. This `"Label:fieldtype/options:width"` shorthand still works but is not recommended for new code. Use dicts.

---

## Fetching Data

### 1. `frappe.get_all` — ORM-style

Best for simple queries on a single doctype. Returns a list of `frappe._dict` objects.

```python
def get_data(filters):
    f = {"docstatus": 1}

    if filters.company:
        f["company"] = filters.company

    if filters.from_date and filters.to_date:
        f["posting_date"] = ["between", [filters.from_date, filters.to_date]]
    elif filters.from_date:
        f["posting_date"] = [">=", filters.from_date]

    return frappe.get_all(
        "Sales Invoice",
        filters=f,
        fields=["name", "customer", "posting_date", "grand_total"],
        order_by="posting_date desc",
        limit=0,   # always set limit=0 in reports — default cap is 20
    )
```

> **Always set `limit=0`** — `frappe.get_all` defaults to 20 rows, which silently truncates report results.

#### Filter operators

| Operator | Example |
|---|---|
| `=` (default) | `{"status": "Paid"}` |
| `!=` | `{"status": ["!=", "Cancelled"]}` |
| `>`, `>=`, `<`, `<=` | `{"grand_total": [">=", 1000]}` |
| `between` | `{"posting_date": ["between", ["2026-01-01", "2026-12-31"]]}` |
| `like` | `{"customer_name": ["like", "%acme%"]}` |
| `in` | `{"status": ["in", ["Paid", "Unpaid"]]}` |
| `not in` | `{"status": ["not in", ["Cancelled"]]}` |
| `is` | `{"cost_center": ["is", "not set"]}` |

---

### 2. `frappe.db.sql` — Raw SQL

Use when you need joins, aggregations, subqueries, or anything `frappe.get_all` cannot express.

**Use Jinja templating for conditional SQL structure, and parameterized values (`%(x)s`) for all user-supplied data** — never embed filter values directly into the SQL string via f-strings or `%` formatting.

Build the SQL with `frappe.render_template`, passing a `params` dict as context. Jinja `{%- if %}` blocks include or exclude SQL clauses; `%(param)s` placeholders use different delimiters and are left untouched by Jinja, then filled by `frappe.db.sql`.

```python
def get_data(filters):
    params = {}

    if filters.company:
        params["company"] = filters.company

    if filters.from_date and filters.to_date:
        params["from_date"] = filters.from_date
        params["to_date"] = filters.to_date

    sql = frappe.render_template(
        """
        SELECT
            si.name,
            si.customer,
            si.posting_date,
            SUM(sii.amount) AS total_amount
        FROM `tabSales Invoice` si
        JOIN `tabSales Invoice Item` sii ON sii.parent = si.name
        WHERE si.docstatus = 1
        {%- if company %}
        AND si.company = %(company)s
        {%- endif %}
        {%- if from_date and to_date %}
        AND si.posting_date BETWEEN %(from_date)s AND %(to_date)s
        {%- endif %}
        GROUP BY si.name
        ORDER BY si.posting_date DESC
        """,
        params,
    )

    return frappe.db.sql(sql, params, as_dict=1)
```

> Jinja `{%- if company %}` checks the key in `params`; `%(company)s` is a SQL placeholder — Jinja passes it through unchanged.  
> `as_dict=1` returns dicts keyed by the column alias — aligns directly with report column `fieldname` values.  
> `as_list=1` returns flat lists — columns and rows must be positionally aligned.

---

### 3. `frappe.qb` — Query Builder

Use when you want composable, injection-safe query construction without raw SQL strings. Powered by PyPika.

```python
from frappe.query_builder.functions import Coalesce, Sum


def get_data(filters):
    si = frappe.qb.DocType("Sales Invoice")
    sii = frappe.qb.DocType("Sales Invoice Item")

    query = (
        frappe.qb.from_(si)
        .join(sii)
        .on(sii.parent == si.name)
        .select(
            si.name,
            si.customer,
            si.posting_date,
            Sum(sii.amount).as_("total_amount"),
        )
        .where(si.docstatus == 1)
        .groupby(si.name)
        .orderby(si.posting_date, order=frappe.qb.desc)
    )

    if filters.company:
        query = query.where(si.company == filters.company)

    if filters.from_date:
        query = query.where(si.posting_date >= filters.from_date)

    if filters.to_date:
        query = query.where(si.posting_date <= filters.to_date)

    return query.run(as_dict=1)
```

Common functions from `frappe.query_builder.functions`: `Sum`, `Count`, `Avg`, `Max`, `Min`, `Date`, `Coalesce`, `IfNull`, `Concat_ws`.

Use `.left_join()` for outer joins and `.inner_join()` (or `.join()`) for inner joins.

---

## Permission-Aware Queries

`build_match_conditions` generates an SQL fragment that enforces Frappe **User Permissions** (e.g., a user scoped to a single company). It returns a non-empty string when restrictions apply, or an empty string when the user has full access.

Since `build_match_conditions` returns an already-escaped SQL fragment (not user input), it can be safely injected via Jinja `{{ match_conditions }}`.

```python
from frappe.desk.reportview import build_match_conditions


def get_data(filters):
    params = {}

    if filters.company:
        params["company"] = filters.company

    match_conditions = build_match_conditions("Sales Invoice")

    sql = frappe.render_template(
        """
        SELECT si.name, si.customer, si.grand_total
        FROM `tabSales Invoice` si
        WHERE si.docstatus = 1
        {%- if company %}
        AND si.company = %(company)s
        {%- endif %}
        {%- if match_conditions %}
        AND {{ match_conditions }}
        {%- endif %}
        """,
        {**params, "match_conditions": match_conditions},
    )

    return frappe.db.sql(sql, params, as_dict=1)
```

> `build_match_conditions` returns values already escaped — injecting via `{{ match_conditions }}` is safe.  
> Do not put raw user-supplied filter values into Jinja `{{ }}` — always use `%(param)s` for those.  
> When using `frappe.get_list` (instead of `frappe.get_all`), match conditions are applied automatically; `build_match_conditions` is only needed with `frappe.db.sql` or `frappe.qb`.

---

## Reusable `get_columns()`

When two reports share most of the same columns, export `get_columns` from the base report and compose in the extended report. Keep `get_columns` side-effect-free and filter-independent so it can be imported safely.

### Base report (export `get_columns`)

```python
# sales_invoice_base/sales_invoice_base.py

def get_columns():
    return [
        {"fieldname": "name",         "label": _("Invoice"),      "fieldtype": "Link",     "options": "Sales Invoice", "width": 180},
        {"fieldname": "customer",     "label": _("Customer"),     "fieldtype": "Link",     "options": "Customer",      "width": 200},
        {"fieldname": "posting_date", "label": _("Date"),         "fieldtype": "Date",     "width": 110},
        {"fieldname": "grand_total",  "label": _("Grand Total"),  "fieldtype": "Currency", "width": 130},
    ]
```

### Extended report — append columns

```python
from .sales_invoice_base import get_columns as get_base_columns


def get_columns():
    return get_base_columns() + [
        {"fieldname": "commission_amount", "label": _("Commission"), "fieldtype": "Currency", "width": 130},
        {"fieldname": "commission_rate",   "label": _("Rate %"),     "fieldtype": "Percent",  "width": 90},
    ]
```

### Extended report — filter out columns

```python
from .sales_invoice_base import get_columns as get_base_columns

_EXCLUDE = {"grand_total"}


def get_columns():
    return [c for c in get_base_columns() if c["fieldname"] not in _EXCLUDE]
```

### Extended report — insert at a specific position

```python
from .sales_invoice_base import get_columns as get_base_columns


def get_columns():
    base = get_base_columns()
    # Insert after first column
    return base[:1] + [
        {"fieldname": "department", "label": _("Department"), "fieldtype": "Link", "options": "Department", "width": 140},
    ] + base[1:]
```
