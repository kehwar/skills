# Frappe DocType Form Controller — Full Reference

## Lifecycle Hooks

### Registration

```js
// Preferred — dictionary style
frappe.ui.form.on('My DocType', {
    setup(frm) { },
    refresh(frm) { },
    my_field(frm) { },              // field change trigger
})

// Single-event style (legacy, still works)
frappe.ui.form.on('My DocType', 'refresh', function(frm) { })
```

### All Standard Hooks — Execution Order

| Hook | When | Notes |
|------|------|-------|
| `setup(frm)` | Once per doctype, synchronously | DOM not ready; do NOT read `frm.doc.name`; use for `set_query`, one-time listeners |
| `before_load(frm)` | Inside `initialize_new_doc`, before `onload` | Rarely used in custom scripts |
| `onload(frm)` | First load of a docname, before first `refresh` | Use for default value setup |
| `refresh(frm)` | Every render: initial load, post-save, post-submit, post-cancel, doc navigation | Most-used hook; must be idempotent |
| `onload_post_render(frm)` | After `refresh`, during initial load only | DOM-level setup after layout renders |
| `validate(frm)` | Before save/submit server call, after mandatory checks | Return `false` or `frappe.throw()` to abort |
| `before_save(frm)` | Same as `validate` in most contexts | |
| `after_save(frm)` | After successful save or update response | |
| `before_submit(frm)` | Before submit RPC call | |
| `on_submit(frm)` | After successful submit response | |
| `before_cancel(frm)` | Before cancel confirmation dialog | |
| `after_cancel(frm)` | After successful cancel response | |
| `on_hide(frm)` | When form page is hidden (tab change, navigation) | |

### Execution Model

`setup` runs synchronously. All other hooks are queued through `frappe.run_serially` and execute in order.

### Field-Level Hooks

```js
frappe.ui.form.on('My DocType', {
    // fires when field value changes (user input or frm.set_value)
    fieldname(frm) { },

    // fires when a grid row expander is opened (child doctype hook)
    child_fieldname_on_form_rendered(frm, cdt, cdn) { },

    // child table row events (on the parent doctype handler)
    table_fieldname_add(frm, cdt, cdn) { },        // row added
    table_fieldname_remove(frm, cdt, cdn) { },     // row removed
    table_fieldname_move(frm, cdt, cdn) { },       // row reordered
    before_table_fieldname_remove(frm, cdt, cdn) { }, // before remove
})
```

**Child row context:**

```js
// cdt = child doctype ("My Child"), cdn = child doc name (hash like "abc123")
const row = frappe.get_doc(cdt, cdn)   // retrieve child row object
frappe.model.set_value(cdt, cdn, 'fieldname', value)  // set child field
```

---

## `frm` Object

### Core Properties

```js
frm.doc           // live document object (plain JS); mutations made here are local until saved
frm.doctype       // String: "My DocType"
frm.docname       // String: "MY-0001" (null if new)
frm.meta          // DocType meta (fields array, flags, etc.)
frm.perm          // Array of permission objects [{read:1, write:1, ...}]
frm.fields_dict   // { fieldname → field control object }
frm.fields        // Array of field controls in order
frm.grids         // Array of {grid: Grid} for each table field
frm.custom_buttons// { label → jQuery btn } for all add_custom_button buttons
frm.page          // frappe.ui.Page — page actions, title
frm.sidebar       // frappe.ui.form.Sidebar
frm.dashboard     // frappe.ui.form.Dashboard
frm.toolbar       // frappe.ui.form.Toolbar
```

### State Methods

```js
frm.is_new()           // true when doc.__islocal == true (never saved)
frm.is_dirty()         // true when doc.__unsaved == 1
frm.dirty()            // mark form as modified programmatically
```

### `frm.doc` Internal Flags

```js
frm.doc.__islocal      // true = new, unsaved
frm.doc.__unsaved      // 1 = pending save
frm.doc.docstatus      // 0=Draft, 1=Submitted, 2=Cancelled
```

---

## Field Display & State

### `frm.toggle_display(fnames, show)`

```js
frm.toggle_display(fnames, show)
// fnames : String | Array<String>
// show   : Boolean — true = visible, false = hidden
// Equivalent to set_df_property(f, 'hidden', show ? 0 : 1)
```

### `frm.toggle_reqd(fnames, mandatory)`

```js
frm.toggle_reqd(fnames, mandatory)
// mandatory : Boolean — true = required
```

### `frm.toggle_enable(fnames, enable)`

```js
frm.toggle_enable(fnames, enable)
// enable : Boolean — true = editable (read_only=0), false = read-only
```

### `frm.set_df_property(fieldname, property, value, ...)`

```js
// For parent fields:
frm.set_df_property(fieldname, property, value)

// For all rows of a child table field:
frm.set_df_property(table_fieldname, child_fieldname, value, frm.doc.name, child_fieldname)

// For a specific child row:
frm.set_df_property(table_fieldname, child_fieldname, value, frm.doc.name, child_fieldname, row_name)

// Common properties: 'hidden', 'read_only', 'reqd', 'label', 'options', 'description',
//                    'bold', 'depends_on', 'mandatory_depends_on'
```

---

## Setting Values

### `frm.set_value(field, value)`

```js
// Single field
await frm.set_value('status', 'Active')

// Multiple fields at once
await frm.set_value({ status: 'Active', company: 'Default' })

// Optional parameters
frm.set_value(field, value, if_missing, skip_dirty_trigger)
// if_missing       : Boolean — only set if currently empty
// skip_dirty_trigger : Boolean — don't mark form dirty
// Returns: Promise
```

---

## Link Search Queries

### `frm.set_query(fieldname, [parent_table_field,] query_fn)`

```js
// On a parent-level Link field (call in setup):
frm.set_query('customer', () => ({
    filters: { disabled: 0, territory: frm.doc.territory },
}))

// On a Link field inside a child table:
frm.set_query('item_code', 'items', () => ({
    filters: { item_group: frm.doc.item_group },
}))

// With server-side query function:
frm.set_query('item_code', () => ({
    query: 'myapp.mymodule.item_query',  // Python dotted path
    filters: { company: frm.doc.company },
}))
```

**Return object keys:**

| Key | Type | Purpose |
|-----|------|---------|
| `filters` | `Object` | WHERE conditions applied to the Link's DocType table |
| `query` | `String` | Dotted path to a Python `get_list`-style query function |
| `additional_filters` | `String` | Raw SQL appended to WHERE clause |

> **Preferred location: `setup`.** `set_query` does a plain property assignment (`field.get_query = fn`) on a persistent field control object that is never rebuilt between renders. Calling it in `refresh` re-assigns the same property on every render — harmless but wasteful. The filter function always reads `frm.doc.*` lazily at search-open time regardless of where `set_query` was called. Frappe's own core is inconsistent on this (most use `setup`; some use `refresh` or `onload`).

---

## Custom Buttons

### Adding

```js
frm.add_custom_button(__('Label'), handler)             // top-level button
frm.add_custom_button(__('Label'), handler, __('Group'))// inside a dropdown group
// Returns: jQuery button element
```

> **Automatic clearing:** `frm.clear_custom_buttons()` is called internally by `refresh_header()`, which runs before the `refresh` hook fires. Adding buttons in `refresh` unconditionally is safe — there will never be duplicates from prior renders.

### Removing

```js
frm.remove_custom_button(__('Label'), group)  // group optional, null for top-level
frm.clear_custom_buttons()                    // remove ALL custom buttons
```

### Accessing & Styling

```js
const btn = frm.custom_buttons[__('Label')]   // jQuery element
btn.addClass('btn-primary')                   // Bootstrap: btn-primary, btn-warning, btn-danger, btn-success

// Or use the helper (changes the whole group button type too):
frm.change_custom_button_type(__('Label'), group, 'primary')
// type values: 'primary', 'secondary', 'default', 'danger', 'warning', 'success'
```

---

## Server Methods

### `frappe.call` — Preferred

```js
frappe.call({
    method: 'myapp.mymodule.doctype.my_doc.my_doc.my_function',
    args: { name: frm.doc.name, extra: 'data' },
    // --- optional ---
    callback(r) { console.log(r.message) },   // r.message = Python return value
    error(r) { },                              // on HTTP/server error
    always(r) { },                             // fires regardless of success/error
    freeze: true,                              // full-page loading overlay
    freeze_message: __('Please wait...'),
    btn: $(event.currentTarget),              // button to disable during request
    no_spinner: true,                        // suppress loading spinner (alias: quiet)
})
// Returns: jQuery jqXHR deferred (jQuery 3.7, Promises/A+ compliant)
// Works with await, .then(), .done(), .fail(), .catch()
// Prefer the error: callback option for error handling — chained .fail()/.catch() only
// catches network/HTTP failures; server-side exceptions are routed through error: only

// await style:
const { message } = await frappe.call({
    method: 'myapp.mymodule.doctype.my_doc.my_doc.my_function',
    args: { name: frm.doc.name },
})
```

**The server-side function must be whitelisted:**

```python
@frappe.whitelist()
def my_function(name, extra=None):
    return frappe.get_doc('My DocType', name).some_result
```

### `frm.call` — Exists, Use Sparingly

`frm.call` is a lighter wrapper that injects `doc: frm.doc` automatically and resolves short method names to `DocController.method`. It can surprise you with auto-refresh behavior. Prefer explicit `frappe.call` with full dotted paths.

```js
// Short form — calls Python method on the DocType controller class:
frm.call('server_method_name', { extra: 'arg' }, (r) => { })

// Promise form:
await frm.call('server_method_name')
```

---

## Dialogs

### `frappe.prompt` — Simple Input

Use when you need one or a few plain fields and just want a value.

```js
frappe.prompt(fields, callback, title, primary_label)

// fields:
//   String  → single text field named "value"
//   Object  → single field definition
//   Array   → array of field definitions (same schema as DocType fields)

// Examples:
frappe.prompt('Enter reason', ({ value }) => applyReason(value))

frappe.prompt(
    [
        { fieldname: 'from_date', fieldtype: 'Date', label: __('From'), reqd: 1 },
        { fieldname: 'to_date',   fieldtype: 'Date', label: __('To'),   reqd: 1 },
    ],
    ({ from_date, to_date }) => runReport(from_date, to_date),
    __('Select Range'),
    __('Run')
)
// Returns the dialog instance
```

`frappe.prompt` is a thin convenience wrapper around `new frappe.ui.Dialog`. Use it for simple one-shot inputs.

### `frappe.ui.Dialog` — Full Control

Use when you need lifecycle control (fetch data before showing, validate, re-show after errors, custom footer buttons).

```js
const d = new frappe.ui.Dialog({
    title: __('My Dialog'),
    size: 'small' | 'large' | 'extra-large',    // auto-detected from col breaks if omitted
    indicator: 'blue',                           // colored dot in title bar
    fields: [
        // Same schema as DocType fields — all fieldtypes work including Table, Link, Select, etc.
        { fieldname: 'item', fieldtype: 'Link', options: 'Item', label: __('Item'), reqd: 1 },
        {
            fieldname: 'item', fieldtype: 'Link', options: 'Item',
            get_query: () => ({ filters: { disabled: 0 } }),  // inline set_query equivalent
        },
    ],
    primary_action(values) {
        // values = d.get_values() result; null if validation fails (reqd check)
        d.hide()
        doSomething(values)
    },
    primary_action_label: __('Submit'),
    secondary_action() { d.hide() },
    secondary_action_label: __('Cancel'),
    onhide() { cleanup() },
})

d.show()
```

#### Dialog Methods

```js
d.show()
d.hide()

// Values
d.get_value('fieldname')           // single field value
d.get_values()                     // { fieldname: value } — returns null if reqd validation fails
d.get_values(true)                 // ignore errors, return partial values
d.set_value('fieldname', value)    // Returns Promise
d.set_values({ f1: v1, f2: v2 })

// Field access
d.fields_dict['fieldname']         // field control
d.get_field('fieldname')           // same as above
d.get_input('fieldname')           // jQuery input element

// Action buttons
d.set_primary_action(__('Save'), fn)
d.disable_primary_action()
d.enable_primary_action()
d.get_primary_btn()                // jQuery .btn-primary
d.add_custom_action(__('Extra'), fn, 'btn-secondary')

// Appearance
d.set_title(__('New Title'))
d.set_indicator('green')
d.set_message(__('Loading…'))      // replaces fields with a message
d.clear_message()                  // restores fields
```

#### Fetching Data Before Show

```js
const d = new frappe.ui.Dialog({ title: __('Edit'), fields: [...] })

frappe.call({
    method: 'myapp.mymodule.get_defaults',
    args: { name: frm.doc.name },
    callback({ message }) {
        d.set_values(message)
        d.show()
    },
})
```

---

## Progress Bars

### `frappe.show_progress` / `frappe.hide_progress`

Shows a **modal dialog** with a progress bar. Multiple calls with the same `title` reuse the same dialog.

```js
frappe.show_progress(title, count, total = 100, description, hide_on_completion = false)
frappe.hide_progress()
```

```js
// Update loop:
for (let i = 0; i < items.length; i++) {
    await processItem(items[i])
    frappe.show_progress(__('Importing'), i + 1, items.length, items[i].name)
}
frappe.hide_progress()

// Auto-hide when complete:
frappe.show_progress(__('Done'), 1, 1, __('Finished'), true)   // hides after 500 ms
```

> **Not to be confused with** `frm.dashboard.show_progress(title, percent, message)` which renders a progress bar _inside_ the form dashboard area (no dialog).

### In-Form Dashboard Progress

```js
frm.dashboard.show_progress(__('Processing'), 45, __('Step 2 of 4'))  // percent 0–100
frm.dashboard.hide_progress()
```

---

## Child Tables

### Grid Reference

```js
const grid = frm.get_field('items').grid

// Add a button to the grid toolbar (above the rows)
grid.add_custom_button(__('Fill Prices'), () => fillPrices(frm))

// Refresh the grid to re-render rows
grid.refresh()

// Add a new row programmatically
const row = frappe.model.add_child(frm.doc, 'Items', 'items')
row.item_code = 'ITEM-001'
frm.refresh_field('items')
```

### Per-Row Events

```js
// Register on the CHILD doctype
frappe.ui.form.on('My Child DocType', {
    my_field_on_form_rendered(frm, cdt, cdn) {
        // fires when a row is expanded (the row editor dialog opens)
        const row = frappe.get_doc(cdt, cdn)
    },

    item_code(frm, cdt, cdn) {
        // fires when item_code changes in any row
        const row = frappe.get_doc(cdt, cdn)
        frappe.model.set_value(cdt, cdn, 'description', row.item_code + ' desc')
    },
})
```

### Modifying Child Row Values

```js
// Preferred — triggers refresh and change events
frappe.model.set_value(cdt, cdn, 'rate', 99.99)

// Bulk — update multiple rows then refresh
frm.doc.items.forEach(row => { row.rate = 0 })
frm.refresh_field('items')
```

### Child Table `set_query`

```js
// In setup(frm):
frm.set_query('item_code', 'items', () => ({
    filters: { is_stock_item: 1 },
}))
```

---

## Utility APIs

### Alerts & Notifications

```js
frappe.show_alert({ message: __('Saved'), indicator: 'green' })
frappe.show_alert({ message: __('Warning'), indicator: 'orange' }, 5)  // duration in seconds

frappe.msgprint(__('Something happened'))                    // simple modal
frappe.msgprint({ title: __('Error'), message: '...', indicator: 'red' })

frappe.confirm(__('Are you sure?'), () => doIt(), () => cancelledFn())
```

### Translation

```js
__('Hello World')            // translates the string
__('Hello {0}', ['World'])   // with substitution
```

### Date Utilities

```js
frappe.datetime.get_today()           // "YYYY-MM-DD"
frappe.datetime.now_datetime()        // "YYYY-MM-DD HH:mm:ss"  (lowercase mm = minutes)
frappe.datetime.str_to_obj('2024-01-01')  // Date object
```

### Format

```js
format_currency(value, currency, decimals)
frappe.format(value, { fieldtype: 'Currency' })
```

---

## Dashboard Alerts & Indicators

All APIs live on `frm.dashboard` (`frappe.ui.form.Dashboard`). They render UI elements **inside the form** (not modal overlays).

### `frm.dashboard.set_headline(html, color)`

The raw primitive. Renders an arbitrary HTML block as a colored banner between the form header and the first field section. Delegates to `frm.layout.show_message`.

```js
frm.dashboard.set_headline(html, color)
// html  : String — arbitrary HTML or plain text
//         If the string contains no HTML tags, it is text-escaped automatically
// color : String — one of: 'yellow', 'blue', 'red', 'green', 'orange'
//         Any other value (or omitted) defaults to 'blue'

// Examples:
frm.dashboard.set_headline('<b>Blocked</b>: waiting for credit approval', 'red')
frm.dashboard.set_headline(
    `${__('Created by {0}', [frm.doc.owner])} — <a href="/app/user/${frm.doc.owner}">${__('View')}</a>`,
    'blue'
)
```

The banner gets a **close button** by default so users can dismiss it manually. To suppress the close button, call `frm.layout.show_message(html, color, /*permanent=*/true)` directly.

### `frm.dashboard.set_headline_alert(text, color)`

Plain-text shorthand. Wraps `text` in a `<div>` and delegates to `set_headline`. Use this over `set_headline` when you don't need custom HTML.

```js
frm.dashboard.set_headline_alert(text, color)
// text  : String — plain text (not HTML); pass null/undefined/'' to clear
// color : same values as set_headline

// Examples:
frm.dashboard.set_headline_alert(__('On hold — awaiting supplier confirmation'), 'orange')
frm.dashboard.set_headline_alert(__('Approved'), 'green')
frm.dashboard.set_headline_alert(null)    // clears the banner
frm.dashboard.set_headline_alert('')      // also clears
```

**Relationship to `set_headline`:** `set_headline_alert` wraps text in `<div>` then calls `set_headline`. Use `set_headline` only when you need raw HTML (links, bold tags, etc.).

### `frm.dashboard.clear_headline()`

Removes the banner unconditionally. Equivalent to `set_headline_alert(null)` or `set_headline(null)`.

```js
frm.dashboard.clear_headline()
```

### `frm.dashboard.add_comment(text, color, permanent)`

Auto-dismissing wrapper around `set_headline_alert`. Clears after 10 seconds unless `permanent` is `true`.

```js
frm.dashboard.add_comment(text, color, permanent)
// text      : String — plain text
// color     : same color values as set_headline
// permanent : Boolean — default false; if true, banner persists until cleared manually
//             (permanent=true makes it behave identically to set_headline_alert)

// Temporary — auto-clears after 10 seconds
frm.dashboard.add_comment(__('Document queued for processing'), 'blue')

// Persistent — same as set_headline_alert but via add_comment API
frm.dashboard.add_comment(__('Credit limit exceeded'), 'red', true)
```

**Decision: `set_headline_alert` vs `add_comment`**

| Need | Use |
|------|-----|
| Persistent contextual status (approval state, holds) | `set_headline_alert` |
| Transient feedback after a user action | `add_comment` (auto-dismisses) |
| Custom HTML (links, bold) in the banner | `set_headline` |
| Clear the banner | `clear_headline()` |

### `frm.dashboard.add_indicator(label, color)`

Adds a small colored pill/badge to the **Stats** section of the form dashboard (below the Connections area). Multiple indicators stack side-by-side (up to 4 per row, then wraps). The stats section is shown automatically.

```js
frm.dashboard.add_indicator(label, color)
// label : String — text shown inside the pill
// color : Bootstrap indicator color class — 'red', 'green', 'orange', 'blue',
//         'yellow', 'grey', 'darkgrey', 'purple', 'pink', 'cyan', 'light-blue'
//         (passed as a CSS class on <span class="indicator {color}">)
// Returns: jQuery element for the column div

// Examples:
frm.dashboard.add_indicator(__('Overdue'), 'red')
frm.dashboard.add_indicator(frm.doc.priority, 'orange')
frm.dashboard.add_indicator(__('Verified'), 'green')
```

> **Note:** `add_indicator` is different from `add_comment` / `set_headline_alert`. Indicators render inside the collapsible dashboard area; headline alerts render **above** all form fields and are always visible when the form opens.

### Color Reference

| Context | Parameter | Valid values |
|---------|-----------|-------------|
| `set_headline`, `set_headline_alert`, `add_comment` | `color` | `'yellow'`, `'blue'`, `'red'`, `'green'`, `'orange'` — anything else → `'blue'` |
| `add_indicator` | `color` | CSS indicator class: `'red'`, `'green'`, `'orange'`, `'blue'`, `'yellow'`, `'grey'`, `'darkgrey'`, `'purple'`, `'pink'`, `'cyan'`, `'light-blue'` |
