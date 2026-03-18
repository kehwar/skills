---
name: frappe-standard-script-report-view
description: Expert guidance for writing the .js controller for a Frappe Standard Script Report. Use when defining report filters, implementing formatter callbacks, adding onload toolbar buttons, setting default filter values, using get_datatable_options, or after_datatable_render hooks. Companion to frappe-standard-script-report-schema.
---

# Frappe Standard Script Report — JS Controller

Companion to `frappe-standard-script-report-schema`. That skill covers the `.json` schema; this skill covers the `.js` controller.

## Golden Rule

**Filters live in `.js`, never in the JSON schema.**  
Frappe reads `frappe.query_reports["Name"].filters` from the on-disk `.js` file at runtime. Never add a `filters` child table to the report's `.json`.

## Skeleton

```js
// Copyright (c) 2026, <your company> and contributors
// For license information, please see license.txt

frappe.query_reports['My Report Name'] = {
    filters: [
        // ... filter definitions
    ],

    formatter(value, row, column, data, default_formatter) {
        // optional — decorate cells
    },

    onload(report) {
        // optional — toolbar buttons, programmatic defaults
    },

    get_datatable_options(options) {
        // optional — extend DataTable config
        return options
    },

    after_datatable_render(datatable_obj) {
        // optional — DOM manipulation after table renders
    },
}
```

Code style: **single quotes, 4-space indent**.

---

## Filters

### Filter object properties

| Property | Required | Notes |
|---|---|---|
| `fieldname` | Yes | Snake_case key sent to `execute(filters)` in Python |
| `label` | Yes | Always wrap in `__('...')` for translation |
| `fieldtype` | Yes | See fieldtype reference below |
| `options` | Depends | Required for `Link`, `Select`, `Autocomplete`, `MultiSelectList` |
| `default` | No | Evaluated once at load time |
| `reqd` | No | `1` makes the filter mandatory before run |
| `description` | No | Helper text shown below the input |
| `get_query` | No | `Link` only — constrains search results |
| `get_data` | No | `MultiSelectList` only — provides list options |

---

### Fieldtype Reference

#### `Date`
```js
{
    fieldname: 'from_date',
    label: __('From Date'),
    fieldtype: 'Date',
    reqd: 1,
    default: frappe.datetime.month_start(),
},
```

#### `Link`
```js
{
    fieldname: 'company',
    label: __('Company'),
    fieldtype: 'Link',
    options: 'Company',
    reqd: 1,
    default: frappe.defaults.get_user_default('Company'),
},
```

#### `Select`

Pass a list of strings for plain options, or `{ value, label }` objects for translated labels:
```js
{
    fieldname: 'range',
    label: __('Range'),
    fieldtype: 'Select',
    options: [
        { value: 'Weekly', label: __('Weekly') },
        { value: 'Monthly', label: __('Monthly') },
        { value: 'Quarterly', label: __('Quarterly') },
        { value: 'Yearly', label: __('Yearly') },
    ],
    default: 'Monthly',
    reqd: 1,
},
```

For simple fixed options where translation isn't needed per-item, a newline-separated string also works:
```js
options: 'Open\nClosed\nCancelled',
```

#### `Data`
```js
{
    fieldname: 'search',
    label: __('Search'),
    fieldtype: 'Data',
    description: __('Partial name match'),
},
```

#### `Check`
```js
{
    fieldname: 'include_draft',
    label: __('Include Drafts'),
    fieldtype: 'Check',
    default: 0,
},
```

#### `Autocomplete`

Like `Select` but allows free-text entry. Pass `options` as an array of strings:
```js
{
    fieldname: 'party_type',
    label: __('Party Type'),
    fieldtype: 'Autocomplete',
    options: ['Customer', 'Supplier'],
},
```

#### `MultiSelectList` ⚠️ Report-specific

`MultiSelectList` is a report-only fieldtype — it does not exist on normal DocType forms. It passes an **array of strings** as the filter value to Python.

Requires a `get_data(txt)` function that returns an array of `{ value, description }` objects:
```js
{
    fieldname: 'customer',
    label: __('Customer'),
    fieldtype: 'MultiSelectList',
    get_data(txt) {
        return frappe.db.get_link_options('Customer', txt)
    },
},
```

> On the Python side, the value arrives as a list: `filters.get('customer') -> ['Acme', 'Globex']`.  
> Always guard with `if filters.get('customer'):` before building a SQL `IN (...)` clause.

---

### `get_query` — constrain a Link filter

Use `get_query` to filter a `Link` field's search results based on the current value of other filters. Always read sibling filter values via `frappe.query_report.get_filter_value`:

```js
{
    fieldname: 'cost_center',
    label: __('Cost Center'),
    fieldtype: 'Link',
    options: 'Cost Center',
    get_query() {
        const company = frappe.query_report.get_filter_value('company')
        return {
            filters: { company },
        }
    },
},
```

For more complex cases, build `filters` conditionally:
```js
{
    fieldname: 'settlement',
    label: __('Settlement'),
    fieldtype: 'Link',
    options: 'Sales Commission Settlement',
    get_query() {
        const filters = { status: 'Active' }
        const period = frappe.query_report.get_filter_value('settlement_period')
        const employee = frappe.query_report.get_filter_value('employee')
        if (period) filters.settlement_period = period
        if (employee) filters.employee = employee
        return { filters }
    },
},
```

---

## Default Value Helpers

| Expression | Returns |
|---|---|
| `frappe.datetime.get_today()` | Today's date as `"YYYY-MM-DD"` |
| `frappe.datetime.month_start()` | First day of current month |
| `frappe.datetime.month_end()` | Last day of current month |
| `frappe.datetime.year_start()` | First day of current year |
| `frappe.datetime.add_months(frappe.datetime.get_today(), -1)` | Same day, one month ago |
| `frappe.defaults.get_user_default('Company')` | User's default Company |
| `frappe.defaults.get_user_default('Currency')` | User's default Currency |
| `frappe.defaults.get_global_default('year_start_date')` | System fiscal year start |
| `frappe.defaults.get_global_default('year_end_date')` | System fiscal year end |

---

## `formatter` — Styling Cells

The `formatter` callback runs for every cell in every row. **Always call `default_formatter` first** to get the baseline rendered value, then wrap or replace as needed.

Signature:
```js
formatter(value, row, column, data, default_formatter) { ... }
```

- `value` — raw cell value
- `column` — column definition (has `.fieldtype`, `.fieldname`, `.label`, etc.)
- `data` — the full row object as returned from Python
- `default_formatter` — Frappe's built-in renderer (formats currency, dates, links, etc.)

### Pattern 1: Bold rows flagged from Python

In Python, add a `bold: 1` key to any row dict you want emphasised. In JS:

```js
formatter(value, row, column, data, default_formatter) {
    value = default_formatter(value, row, column, data)
    if (data && data.bold) {
        value = value.bold()
    }
    return value
},
```

You can use any HTML method: `.bold()`, `.italics()`, or wrap with `<span>`:
```js
value = `<span style="font-weight: 600;">${value}</span>`
```

### Pattern 2: Colour by value or column type

```js
formatter(value, row, column, data, default_formatter) {
    value = default_formatter(value, row, column, data)

    // Highlight negative numbers in red for currency/float columns
    if (['Currency', 'Float', 'Percent'].includes(column.fieldtype)) {
        const num = parseFloat(data[column.fieldname])
        if (!isNaN(num) && num < 0) {
            value = `<span style="color: var(--red-500);">${value}</span>`
        }
    }

    // Highlight a specific status column
    if (column.fieldname === 'status') {
        const colours = {
            'Active': 'green',
            'Expired': 'red',
            'Draft': 'gray',
        }
        const colour = colours[data.status]
        if (colour) {
            value = `<span class="indicator-pill ${colour}">${data.status}</span>`
        }
    }

    return value
},
```

> Use CSS variables (`var(--red-500)`, `var(--green-500)`) instead of hard-coded hex values to respect the user's theme.

---

## `onload` — Toolbar Buttons & Programmatic Defaults

`onload(report)` runs once after the report UI is mounted. The `report` argument is the `QueryReport` instance — the same object as `frappe.query_report`.

### Add a toolbar button

```js
onload(report) {
    report.page.add_inner_button(__('Open Summary'), () => {
        const filters = report.get_values()
        frappe.set_route('query-report', 'My Summary Report', {
            company: filters.company,
        })
    })
},
```

### Set filter defaults programmatically

Use this when the default must be computed asynchronously (e.g. fetched from the DB), or when it depends on another filter value:

```js
onload(report) {
    frappe.db.get_value('Company', frappe.defaults.get_user_default('Company'), 'default_currency')
        .then(({ message }) => {
            if (message?.default_currency) {
                report.set_filter_value('currency', message.default_currency)
            }
        })
},
```

`set_filter_value` also accepts an object to set multiple filters at once without triggering intermediate refreshes:
```js
report.set_filter_value({
    from_date: frappe.datetime.month_start(),
    to_date: frappe.datetime.month_end(),
})
```

---

## `get_datatable_options` — Extend DataTable Config

Called after Frappe builds its default DataTable options object. Return the (mutated) `options` to apply overrides. Common use: enabling checkbox rows for interactive charts.

```js
get_datatable_options(options) {
    return Object.assign(options, {
        checkboxColumn: true,
        events: {
            onCheckRow(data) {
                if (!data?.length) return
                // `data` is an array of cell objects for the checked row
                const rowName = data[2].content
                console.log('Checked row:', rowName)
            },
        },
    })
},
```

---

## `after_datatable_render` — Post-render DOM Access

Called once after the DataTable DOM is fully inserted. Useful for programmatic row/cell selection:

```js
after_datatable_render(datatable_obj) {
    // Auto-check the first data row's checkbox
    $(datatable_obj.wrapper)
        .find('.dt-row-0')
        .find('input[type=checkbox]')
        .click()
},
```

> Pair this with `get_datatable_options({ checkboxColumn: true })` when using checkbox rows.

---

## `frappe.query_report` API Reference

These methods appear naturally in filter and lifecycle callbacks:

| Method | Where used | Description |
|---|---|---|
| `frappe.query_report.get_filter_value(fieldname)` | `get_query`, `onload` | Returns current value of one filter |
| `frappe.query_report.set_filter_value(fieldname, value)` | `onload` | Sets one filter value (no intermediate refresh) |
| `frappe.query_report.set_filter_value({ f1: v1, f2: v2 })` | `onload` | Sets multiple filter values atomically |
| `frappe.query_report.get_values()` | `onload` button callbacks | Returns all filter values as a plain object |
| `frappe.query_report.refresh()` | `onload` button callbacks | Programmatically re-runs the report |

For the full list of available methods, read the source:  
`frappe/public/js/frappe/views/reports/query_report.js`

---

## Charts

Frappe supports a JS-side `get_chart_data` hook and a Python-side `get_chart_data()` return from `execute()`. Chart configuration is **out of scope for this skill** — see ERPNext reports such as `issue_analytics.js` for working examples.

---

## Complete Example

```js
// Copyright (c) 2026, Grupo Soldamundo and contributors
// For license information, please see license.txt

frappe.query_reports['Sales Invoice Summary'] = {
    filters: [
        {
            fieldname: 'company',
            label: __('Company'),
            fieldtype: 'Link',
            options: 'Company',
            reqd: 1,
            default: frappe.defaults.get_user_default('Company'),
        },
        {
            fieldname: 'from_date',
            label: __('From Date'),
            fieldtype: 'Date',
            reqd: 1,
            default: frappe.datetime.month_start(),
        },
        {
            fieldname: 'to_date',
            label: __('To Date'),
            fieldtype: 'Date',
            reqd: 1,
            default: frappe.datetime.month_end(),
        },
        {
            fieldname: 'cost_center',
            label: __('Cost Center'),
            fieldtype: 'Link',
            options: 'Cost Center',
            get_query() {
                const company = frappe.query_report.get_filter_value('company')
                return { filters: { company } }
            },
        },
        {
            fieldname: 'customer',
            label: __('Customer'),
            fieldtype: 'MultiSelectList',
            get_data(txt) {
                return frappe.db.get_link_options('Customer', txt)
            },
        },
        {
            fieldname: 'status',
            label: __('Status'),
            fieldtype: 'Select',
            options: [
                '',
                { value: 'Paid', label: __('Paid') },
                { value: 'Unpaid', label: __('Unpaid') },
                { value: 'Overdue', label: __('Overdue') },
            ],
        },
    ],

    formatter(value, row, column, data, default_formatter) {
        value = default_formatter(value, row, column, data)

        if (data && data.bold) {
            value = `<span style="font-weight: 600;">${value}</span>`
        }

        if (['Currency', 'Float'].includes(column.fieldtype)) {
            const num = parseFloat(data[column.fieldname])
            if (!isNaN(num) && num < 0) {
                value = `<span style="color: var(--red-500);">${value}</span>`
            }
        }

        return value
    },

    onload(report) {
        report.page.add_inner_button(__('Open AR Report'), () => {
            const { company } = report.get_values()
            frappe.set_route('query-report', 'Accounts Receivable', { company })
        })
    },
}
```
