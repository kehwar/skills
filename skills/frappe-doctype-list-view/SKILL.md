---
name: frappe-doctype-list-view
description: Expert guidance for implementing Frappe DocType JavaScript list view controllers (_list.js files). Covers the frappe.listview_settings config keys (add_fields, filters, order_by, get_indicator, button, get_form_link, primary_action, hide_name_column), the live listview instance API (page.add_menu_item, page.add_action_item, call_for_selected_items, get_checked_items, refresh), three-zone button placement decision tree, get_indicator filter syntax, and bulk action patterns (simple call, dialog+progress). Use when writing or debugging _list.js controller files, adding menu/action/row buttons, building bulk actions, customizing indicators, or fixing bugs caused by logic placed in the wrong location.
---

# Frappe DocType List View Controller (_list.js)

See [frappe-doctype-schema](../frappe-doctype-schema/SKILL.md) for the `.json` schema.
See [frappe-doctype-form-view](../frappe-doctype-form-view/SKILL.md) for the `.js` form controller.
See [frappe-doctype-controller](../frappe-doctype-controller/SKILL.md) for the `.py` server controller.
See [frappe-js-api](../frappe-js-api/SKILL.md) for full option tables on `frappe.call`, `frappe.db.*`, `frappe.msgprint`, `frappe.set_route`, and all other globals.

---

## Quick Start — Filename First

**The file must be named `<doctype_snake_case>_list.js`, not `<doctype_snake_case>.js`.**

```
myapp/mymodule/doctype/my_doc_type/
├── my_doc_type.json       ← schema
├── my_doc_type.py         ← Python controller
├── my_doc_type.js         ← form view controller  ← NOT this file
└── my_doc_type_list.js    ← list view controller  ← THIS file
```

```js
// myapp/mymodule/doctype/my_doc_type/my_doc_type_list.js
frappe.listview_settings["My Doc Type"] = {
    add_fields: ["status", "priority"],

    get_indicator(doc) {
        const colors = { Open: "red", Closed: "green", Draft: "gray" }
        return [__(doc.status), colors[doc.status] || "blue", `status,=,${doc.status}`]
    },

    onload(listview) {
        listview.page.add_menu_item(__("Export All"), () => {
            frappe.call({ method: "myapp.mymodule.doctype.my_doc_type.my_doc_type.export_all" })
        })
    },
}
```

---

## Two Axes of the API

The list view controller has two distinct surfaces:

### Axis 1 — Config Keys (static object properties)

Declared directly on `frappe.listview_settings["DocType"]`. Consumed by the framework when the list is constructed.

| Key | Type | Purpose |
|-----|------|---------|
| `add_fields` | `string[]` | Extra fields to fetch from DB (needed for `get_indicator`, `button.show`, etc. — fields not in the visible columns aren't fetched by default) |
| `filters` | `[field, op, value][]` | Default filters applied when no saved filters exist |
| `order_by` | `string` | Default sort, e.g. `"creation desc"` |
| `get_indicator` | `fn(doc)` | Returns `[label, color, filter_string]` for the status badge |
| `button` | `object` | Per-row inline action button (see Button section) |
| `get_form_link` | `fn(doc)` | Override the URL when clicking a row |
| `primary_action` | `fn()` | Override the top-right "Add" button's click handler |
| `hide_name_column` | `bool` | Hide the `name` column (use when subject is more meaningful) |
| `onload` | `fn(listview)` | Called once after the list view is set up |

### Axis 2 — Live Instance (`listview`) in `onload`

The `listview` object passed to `onload` is the live `frappe.views.ListView` instance. Use it to wire up buttons, read state, and trigger refreshes.

```js
listview.page              // frappe.ui.Page — toolbar, menus
listview.doctype           // "My Doc Type"
listview.filters           // current active filters array
listview.data              // currently loaded rows
listview.refresh()         // re-fetch and re-render
listview.get_checked_items()         // returns array of checked doc objects
listview.get_checked_items(true)     // returns array of checked doc names (strings)
listview.call_for_selected_items(method, args)  // bulk server call (see Bulk Actions)
```

---

## Lifecycle — `onload` Only

The list view exposes a single user-hookable lifecycle method:

```
ListView constructed
  └── setup_view()
        ├── setup_columns()
        ├── render_header()
        ├── setup_events()
        └── settings.onload(this)   ← your hook fires here, ONCE
```

**`onload` fires once** when the list view is first mounted. It does **not** re-fire when the user navigates away and back (the instance is reused). Wire all page-level buttons, menu items, and one-time event listeners here.

There is no `refresh` hook — logic that needs to run on every data reload belongs in `before_render` (advanced, rarely needed; not covered here).

---

## Button Placement — Decision Tree

There are three completely separate "button" concepts. Putting something in the wrong zone is the most common mistake.

```
Do you want a button that acts on SELECTED rows?
  YES → Does it need to appear inline in every row?
    YES → settings.button  (per-row inline button)
    NO  → listview.page.add_action_item()  (Actions dropdown — only appears when rows are checked)
  NO  → Is it a general page-level action (always visible)?
    YES → listview.page.add_menu_item()  (⋮ kebab menu — top right, always visible)
    NO  → Is it the primary "new document" override?
      YES → settings.primary_action  (replaces the "Add" button handler)
```

### Zone 1 — `listview.page.add_menu_item()` — Top-right ⋮ Menu

Always visible. Used for page-level actions that don't require row selection.

```js
onload(listview) {
    listview.page.add_menu_item(__("Clear Old Logs"), () => {
        frappe.call({
            method: "myapp.mymodule.doctype.my_doc.my_doc.clear_old_logs",
            callback: () => listview.refresh(),
        })
    })
}
```

### Zone 2 — `listview.page.add_action_item()` — Actions Dropdown (bulk)

The "Actions" button only appears in the toolbar when at least one row is checked. Items added here are for multi-row operations.

```js
onload(listview) {
    listview.page.add_action_item(__("Close Selected"), () => {
        listview.call_for_selected_items(
            "myapp.mymodule.doctype.my_doc.my_doc.bulk_close"
        )
    })
}
```

### Zone 3 — `settings.button` — Per-row Inline Button

Renders a small button inside every row that passes `show(doc)`. Replaces the "assigned to" avatar group when present.

```js
frappe.listview_settings["My Doc Type"] = {
    add_fields: ["reference_type", "reference_name"],

    button: {
        show(doc) {
            // return truthy to show the button for this row
            return doc.reference_name
        },
        get_label(doc) {
            return __("Open")
            // or return an icon: frappe.utils.icon("external-link", "sm")
        },
        get_description(doc) {
            return __("Open {0}", [doc.reference_name])  // tooltip
        },
        action(doc) {
            frappe.set_route("Form", doc.reference_type, doc.reference_name)
        },
    },
}
```

**Important:** `add_fields` must include any field read inside `button.show`, `button.get_label`, or `button.get_description` that isn't already a visible column.

---

## `get_indicator` — Status Badge

Returns `[label, color, filter_string]`.

```js
get_indicator(doc) {
    if (doc.status === "Open")   return [__("Open"),   "red",    "status,=,Open"]
    if (doc.status === "Closed") return [__("Closed"), "green",  "status,=,Closed"]
    return [__("Draft"), "gray", "status,=,Draft"]
}
```

### Available Colors

`red`, `green`, `blue`, `orange`, `purple`, `gray`, `yellow`, `pink`, `cyan`

### Filter String Syntax

The third element is a **clickable filter shortcut** — clicking the badge applies this filter to the list. Syntax: `"field,operator,value"`. Multiple conditions are joined with `|` (logical AND).

```js
// Single condition
"status,=,Open"

// Multiple conditions (AND)
"status,=,Open|assigned_to,=,Administrator"

// Numeric comparisons
"unallocated_amount,>,0"

// Docstatus (use numeric values)
"docstatus,=,0"   // Draft
"docstatus,=,1"   // Submitted
"docstatus,=,2"   // Cancelled

// Date relative filter
"delivery_date,<,Today"
```

**Common trap:** `docstatus` must use `0/1/2`, not `"Draft"/"Submitted"/"Cancelled"`.

**Common trap:** Fields used in `get_indicator` must be listed in `add_fields` if they aren't already visible columns.

```js
frappe.listview_settings["My Doc Type"] = {
    add_fields: ["status", "priority"],  // ← required so get_indicator can read them
    get_indicator(doc) { ... },
}
```

---

## Bulk Actions

### Simple — `call_for_selected_items`

The built-in convenience method. Grabs checked names, calls the server method with `{ names: [...] }`, freezes the UI, and refreshes on success.

```js
onload(listview) {
    listview.page.add_action_item(__("Close"), () => {
        listview.call_for_selected_items(
            "myapp.mymodule.doctype.my_doc.my_doc.bulk_close",
            { status: "Closed" }   // extra args merged with { names: [...] }
        )
    })
}
```

The corresponding server method must accept `names` as a parameter:

```python
@frappe.whitelist()
def bulk_close(names, status="Closed"):
    import json
    for name in json.loads(names):
        doc = frappe.get_doc("My Doc Type", name)
        doc.status = status
        doc.save()
```

### Advanced — Confirm Dialog + Progress Bar

Use when you need user confirmation or want per-item progress feedback.

```js
onload(listview) {
    listview.page.add_action_item(__("Send Reminders"), () => {
        const items = listview.get_checked_items(true)  // array of names
        if (!items.length) {
            frappe.msgprint(__("Select at least one row."))
            return
        }

        frappe.confirm(
            __("Send reminders to {0} customers?", [items.length]),
            () => send_in_batches(listview, items)
        )
    })
}

async function send_in_batches(listview, names) {
    const total = names.length
    let done = 0

    for (const name of names) {
        await frappe.call({
            method: "myapp.mymodule.doctype.my_doc.my_doc.send_reminder",
            args: { name },
        })
        done++
        frappe.show_progress(__("Sending Reminders"), done, total, name)
    }

    frappe.hide_progress()
    listview.refresh()
    frappe.show_alert({ message: __("Done"), indicator: "green" })
}
```

---

## Common Patterns

### Default Filters

```js
frappe.listview_settings["My Doc Type"] = {
    filters: [
        ["status", "=", "Open"],
        ["assigned_to", "=", frappe.session.user],
    ],
}
```

Note: These are **overridden** by the user's saved filters. They only apply when the user has no saved filters for this list.

### Override Sort Order

```js
frappe.listview_settings["My Doc Type"] = {
    order_by: "priority asc, creation desc",
}
```

### Override the "Add" Button

```js
frappe.listview_settings["My Doc Type"] = {
    primary_action() {
        frappe.new_doc("My Doc Type", { source: "list_button" })
    },
}
```

### Custom Row URL

```js
frappe.listview_settings["Workflow Action"] = {
    get_form_link(doc) {
        if (doc.status === "Open") {
            const name = encodeURIComponent(doc.reference_name)
            return `/app/${frappe.router.slug(doc.reference_doctype)}/${name}`
        }
        return `/app/workflow-action/${encodeURIComponent(doc.name)}`
    },
}
```

### Hide the Name Column

Use when the subject field is already a meaningful identifier and `name` would just be noise.

```js
frappe.listview_settings["ToDo"] = {
    hide_name_column: true,
}
```

### Rename the Page Title

```js
onload(listview) {
    listview.page.set_title(__("To Do"))
}
```

---

## Pitfalls

| Pitfall | Fix |
|---------|-----|
| Using `my_doc_type.js` instead of `my_doc_type_list.js` | The list file **must** have the `_list` suffix |
| Reading a field in `get_indicator` that doesn't show up | Add it to `add_fields` |
| `button` not appearing | Ensure `add_fields` includes fields read by `button.show` |
| `call_for_selected_items` not refreshing | It refreshes automatically on `!r.exc` — don't double-refresh |
| `docstatus` filter using string values | Use `"docstatus,=,1"` not `"docstatus,=,Submitted"` |
| Wiring buttons outside `onload` | Always wire page buttons inside `onload(listview)` |
| `filters` being ignored | User's saved view filters take priority; `settings.filters` only apply as fallback |
