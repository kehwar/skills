# Frappe JS API — Full Reference

All APIs are globals available on every desk page. No import needed.

Source file locations (relative to `frappe/public/js/frappe/`):

| File | APIs |
|------|------|
| `request.js` | `frappe.call`, `frappe.xcall` |
| `db.js` | `frappe.db.*` |
| `model/model.js` | `frappe.model.*`, `frappe.get_doc` |
| `model/create_new.js` | `frappe.new_doc` |
| `ui/dialog.js` | `frappe.ui.Dialog` |
| `ui/messages.js` | `frappe.msgprint`, `frappe.confirm`, `frappe.prompt`, `frappe.throw`, `frappe.show_alert`, `frappe.toast`, `frappe.show_progress`, `frappe.hide_progress` |
| `form/formatters.js` | `frappe.format` |
| `router.js` | `frappe.set_route`, `frappe.get_route`, `frappe.open_in_new_tab` |
| `socketio_client.js` | `frappe.realtime`, `frappe.socketio` |
| `defaults.js` | `frappe.defaults.*` |
| `utils/datetime.js` | `frappe.datetime.*` |
| `utils/utils.js` | `frappe.utils.*` |
| `utils/number_format.js` | `format_currency()`, `format_number()` (globals) |
| `provide.js` | `frappe.provide` |
| `desk.js` | `frappe.session.*` (set from `frappe.boot`) |

---

## 1. Server Calls

### `frappe.call(opts)`

Full options:

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `method` | `string` | required | Dotted Python path, e.g. `"myapp.api.do_thing"` |
| `args` | `object` | `{}` | Keyword args passed to the server method |
| `callback` | `function(r)` | — | `r.message` holds the return value |
| `error` | `function(r)` | — | Called on HTTP error |
| `always` | `function(data)` | — | Called after success or error |
| `freeze` | `boolean` | `false` | Freeze the full UI while in-flight |
| `freeze_message` | `string` | — | Text shown in freeze overlay |
| `btn` | jQuery element | — | Button to disable while in-flight |
| `type` | `"POST"\|"GET"` | `"POST"` | HTTP method |
| `headers` | `object` | `{}` | Additional HTTP headers |
| `no_spinner` / `quiet` | `boolean` | `false` | `quiet` sets `no_spinner = true`. Note: the spinner suppression is currently a no-op in the source (`show_spinner` line commented out) — use `freeze` for UI blocking instead. |
| `silent` | `boolean` | `false` | Suppress error dialogs on failure |
| `debounce` | `number` (ms) | — | Skip duplicate calls within this window |
| `error_handlers` | `object` | `{}` | Custom HTTP status code handlers `{ 403: fn }` |
| `url` | `string` | — | Override full URL (skips `/api/method/` prefix) |

Returns a **jQuery deferred** (`.then()`, `.fail()`).

Also accepts positional form:
```js
frappe.call(method_string, args, callback)
```

**Patterns:**

```js
// Basic callback
frappe.call({
    method: 'myapp.api.get_price',
    args: { item_code: 'ITEM-001' },
    callback(r) {
        console.log(r.message)   // the return value
    },
})

// Freeze UI with message
frappe.call({
    method: 'myapp.api.long_operation',
    args: { doc: frm.doc.name },
    freeze: true,
    freeze_message: __('Processing…'),
    callback(r) { frm.refresh() },
})

// Disable button while in-flight
frappe.call({
    method: 'myapp.api.approve',
    args: { name: frm.doc.name },
    btn: frm.custom_buttons[__('Approve')],
    callback(r) { frm.reload_doc() },
})

// jQuery deferred chaining
frappe.call({ method: 'myapp.api.get_data', args: {} })
    .then(r => console.log(r.message))
    .fail(() => frappe.show_alert(__('Failed'), 5))
```

---

### `frappe.xcall(method, params)`

```js
frappe.xcall(method: string, params?: object): Promise<any>
```

- Returns a **native Promise** resolving with `r.message` directly (not the full `r` object)
- Rejects with `r?.message` on error
- Use with `async/await` for clean code

```js
// async/await
const price = await frappe.xcall('myapp.api.get_price', { item_code: 'ITEM-001' })

// Promise chain
frappe.xcall('myapp.api.get_list', { limit: 5 })
    .then(list => console.log(list))
    .catch(err => frappe.show_alert(err, 5))
```

---

## 2. Client-Side DB (`frappe.db.*`)

All `frappe.db.*` methods hit the server. For local-store reads, see `frappe.model.*`.

### `frappe.db.get_value(doctype, filters, fieldname, callback?, parent_doc?)`

| Param | Type | Notes |
|-------|------|-------|
| `doctype` | `string` | DocType name |
| `filters` | `string\|object` | Plain name string or filter object `{ field: value }` |
| `fieldname` | `string\|string[]` | One field or array of fields |
| `callback` | `function(r)` | Optional — if omitted, returns a Promise/deferred |
| `parent_doc` | object | For child table lookups |

Returns the `frappe.call` deferred when no callback; callback receives the value dict.

```js
// Single field, by name
frappe.db.get_value('Customer', 'CUST-001', 'credit_limit', r => {
    console.log(r.message.credit_limit)
})

// Multiple fields, by filter
const r = await frappe.db.get_value('Item', { item_code: code }, ['item_name', 'stock_uom'])
const { item_name, stock_uom } = r.message
```

---

### `frappe.db.get_list(doctype, args?)`

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `fields` | `string[]` | `["name"]` | Fields to return |
| `filters` | `array\|object` | — | Filter conditions |
| `limit` | `number` | `20` | Max records; `0` = no limit |
| `order_by` | `string` | — | SQL order clause, e.g. `"modified desc"` |
| `limit_start` | `number` | `0` | Pagination offset |
| `or_filters` | `array` | — | OR-combined filter array |
| `group_by` | `string` | — | GROUP BY clause |

Returns a **Promise** resolving to the array of records.

```js
const customers = await frappe.db.get_list('Customer', {
    fields: ['name', 'customer_name', 'territory'],
    filters: { disabled: 0, territory: 'Peru' },
    limit: 50,
    order_by: 'customer_name asc',
})
```

---

### `frappe.db.exists(doctype, name)`

Returns `Promise<boolean>`.

```js
if (await frappe.db.exists('Item', item_code)) {
    // item exists
}
```

---

### `frappe.db.count(doctype, args?)`

| Field | Type | Notes |
|-------|------|-------|
| `filters` | `array\|object` | Filter conditions |
| `limit` | `number` | Cap the count |

Returns `Promise<number>`.

```js
const n = await frappe.db.count('Sales Order', {
    filters: { status: 'Pending', company: frappe.defaults.get_user_default('Company') },
})
```

---

### `frappe.db.set_value(doctype, docname, fieldname, value, callback?)`

- `fieldname`: string, or object `{ f1: v1, f2: v2 }` for multi-field update
- **Bypasses form validation and triggers** — persists directly via `frappe.client.set_value`
- `callback(doc)`: receives the saved document

```js
// Single field
frappe.db.set_value('Sales Order', 'SO-0001', 'status', 'Closed')

// Multiple fields
frappe.db.set_value('Sales Order', 'SO-0001', { status: 'Closed', remarks: 'Done' })
    .then(() => listview.refresh())
```

---

### `frappe.db.get_single_value(doctype, field)`

```js
const currency = await frappe.db.get_single_value('Global Defaults', 'default_currency')
```

---

## 3. Local Model Store (`frappe.model.*`)

These are **synchronous and local-only** — they read/write `locals[doctype][name]`, the in-memory store for open documents. No server calls unless noted.

### `frappe.model.get_value(doctype, name_or_filters, fieldname, callback?)`

- Without `callback`: reads synchronously from local store, returns value
- With `callback`: makes a server call (calls `frappe.client.get_value`)

```js
// Synchronous local read
const qty = frappe.model.get_value('Sales Order Item', child.name, 'qty')

// Async server read (rare — prefer frappe.db.get_value)
frappe.model.get_value('Item', item_code, 'item_name', r => console.log(r.item_name))
```

---

### `frappe.model.set_value(doctype, docname, fieldname, value, fieldtype?, skip_dirty?)`

- Updates the local store AND fires the field's change triggers (same as user editing)
- `fieldname`: string or object for multi-field
- Returns `Promise` (via `frappe.run_serially`)

```js
// Direct: fires field trigger, marks form dirty
await frappe.model.set_value(frm.doctype, frm.docname, 'status', 'Approved')

// Multi-field
await frappe.model.set_value(frm.doctype, frm.docname, { status: 'Approved', approved_by: frappe.session.user })
```

---

### `frappe.model.get_doc(doctype, name)` / `frappe.get_doc(doctype, name)`

- **Local store only** — reads `locals[doctype][name]`
- Returns `null` if not loaded; does NOT fetch from server
- `frappe.get_doc` is an alias

For a server fetch, use `frappe.db.get_doc(doctype, name, filters)` (syncs to locals on success).

```js
const doc = frappe.get_doc('Sales Order', 'SO-0001')
if (doc) console.log(doc.grand_total)
```

---

### `frappe.new_doc(doctype, opts?, init_callback?)`

Opens Quick Entry dialog or new form, with `opts` pre-filled as route options.

```js
frappe.new_doc('Sales Order', { customer: 'CUST-001', company: 'My Co' })
```

---

## 4. User Feedback

### `frappe.msgprint(msg, title?, is_minimizable?)`

When `msg` is a **string**, shows a simple modal. When an **object**:

| Field | Type | Notes |
|-------|------|-------|
| `message` | `string\|array` | Required. HTML allowed. Array → multiple messages (or list). |
| `title` | `string` | Dialog title (default `"Message"`) |
| `indicator` | `string` | `"blue"` (default), `"red"`, `"green"`, `"orange"` |
| `alert` / `toast` | `boolean` | Routes to `frappe.show_alert` instead |
| `as_list` | `boolean` | Renders array `message` as `<ul><li>` items |
| `as_table` | `boolean` | Renders 2D array `message` as `<table>` |
| `clear` | `boolean` | Clear previous content before showing |
| `wide` | `boolean` | Full-width dialog |
| `is_minimizable` | `boolean` | Show minimize button |
| `primary_action` | `object` | `{ label, action?, server_action?, client_action?, args? }` |
| `secondary_action` | `object` | `{ label, action }` |

```js
// Simple
frappe.msgprint(__('Document saved successfully.'))

// Error with indicator
frappe.msgprint({
    title: __('Validation Error'),
    message: __('The quantity cannot exceed available stock.'),
    indicator: 'red',
})

// List of messages
frappe.msgprint({
    title: __('Missing Fields'),
    message: ['Field A', 'Field B', 'Field C'],
    indicator: 'orange',
    as_list: true,
})

// With primary action button
frappe.msgprint({
    title: __('Confirm'),
    message: __('Would you like to open the related order?'),
    primary_action: {
        label: __('Open Order'),
        action() {
            frappe.set_route('Form', 'Sales Order', doc.sales_order)
        },
    },
})
```

---

### `frappe.confirm(message, onYes, onNo?)`

```js
frappe.confirm(
    __('Are you sure you want to delete this record?'),
    () => {
        frappe.call({ method: '…', args: { name: doc.name } })
    },
    () => {
        // optional: user dismissed without confirming
    }
)
```

---

### `frappe.show_alert(message, seconds?, actions?)` / `frappe.toast`

`frappe.toast` is an alias.

`message` as object:

| Field | Type | Notes |
|-------|------|-------|
| `message` | `string` | Required |
| `subtitle` | `string` | Smaller text below |
| `indicator` | `string` | `"blue"` (default), `"green"`, `"red"`, `"orange"`, `"yellow"` |

`seconds` defaults to `7`.

```js
frappe.show_alert(__('Saved!'), 3)

frappe.show_alert({
    message: __('Item synced'),
    subtitle: item_code,
    indicator: 'green',
}, 5)
```

---

### `frappe.throw(msg)`

Shows a modal error message **and throws** a JS `Error`. Use for client-side validation.

```js
if (!frm.doc.customer) {
    frappe.throw(__('Customer is required.'))
}

// With title and indicator
frappe.throw({
    title: __('Invalid Quantity'),
    message: __('Quantity must be greater than zero.'),
    indicator: 'red',
})
```

---

## 5. Dialogs

### `frappe.prompt(fields, callback, title?, primary_label?)`

Quick input dialog. `fields` can be:
- A string (becomes a single "Data" field labelled by that string)
- A single field object
- An array of field objects

```js
// Single input
frappe.prompt(__('Enter a name'), ({ value }) => {
    console.log(value)
})

// Multiple fields
frappe.prompt(
    [
        { fieldname: 'from_date', label: __('From Date'), fieldtype: 'Date', reqd: 1 },
        { fieldname: 'to_date', label: __('To Date'), fieldtype: 'Date', reqd: 1 },
    ],
    ({ from_date, to_date }) => {
        frappe.call({ method: 'myapp.api.run', args: { from_date, to_date } })
    },
    __('Select Date Range'),
    __('Run')
)
```

---

### `new frappe.ui.Dialog(opts)`

Full custom modal with form fields.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `title` | `string` | — | Dialog title |
| `fields` | `array` | — | DocField-compatible field definitions |
| `primary_action` | `function(values)` | — | Receives `get_values()` result |
| `primary_action_label` | `string` | `"Submit"` | Primary button label |
| `secondary_action` | `function` | — | Secondary button handler |
| `secondary_action_label` | `string` | — | Secondary button label |
| `size` | `"small"\|"large"\|"extra-large"\|null` | auto | `null` = auto-calculated |
| `animate` | `boolean` | `true` | CSS fade animation |
| `static` | `boolean` | `false` | Click-outside does not close |
| `minimizable` | `boolean` | `false` | Show minimize button |
| `indicator` | `string` | — | Title bar color indicator |
| `onhide` / `on_hide` | `function` | — | Called when dialog hides |

**Key instance methods:**

```js
dialog.show()
dialog.hide()
dialog.get_value('fieldname')
dialog.set_value('fieldname', value)
dialog.get_values()                          // null if required fields are empty
dialog.set_primary_action(label, handler)
dialog.disable_primary_action()
dialog.enable_primary_action()
dialog.add_custom_action(label, handler, css_class)
dialog.set_title(title)
dialog.fields_dict['fieldname']             // direct field control access
```

**Pattern:**

```js
const d = new frappe.ui.Dialog({
    title: __('Adjust Price'),
    fields: [
        {
            fieldname: 'price_list',
            label: __('Price List'),
            fieldtype: 'Link',
            options: 'Price List',
            reqd: 1,
            get_query: () => ({ filters: { selling: 1 } }),
        },
        {
            fieldname: 'factor',
            label: __('Adjustment Factor'),
            fieldtype: 'Float',
            default: 1.0,
        },
    ],
    primary_action_label: __('Apply'),
    primary_action({ price_list, factor }) {
        frappe.call({
            method: 'myapp.api.adjust_prices',
            args: { price_list, factor },
            callback() {
                d.hide()
                frappe.show_alert(__('Prices updated'), 3)
            },
        })
    },
})
d.show()
```

---

### `frappe.show_progress(title, count, total?, description?, hide_on_completion?)`

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `title` | `string` | required | Also the cache key — same title reuses dialog |
| `count` | `number` | required | Current value |
| `total` | `number` | `100` | Max value |
| `description` | `string` | — | Muted text below the bar |
| `hide_on_completion` | `boolean` | `false` | Auto-hide 500ms after reaching 100% |

```js
const items = ['a', 'b', 'c', 'd', 'e']
for (let i = 0; i < items.length; i++) {
    frappe.show_progress(
        __('Processing Items'),
        i + 1,
        items.length,
        items[i],
        true
    )
    await frappe.xcall('myapp.api.process_item', { name: items[i] })
}
frappe.hide_progress()
```

---

## 6. Datetime (`frappe.datetime.*`)

System format is always `"YYYY-MM-DD"` for dates and `"YYYY-MM-DD HH:mm:ss"` for datetimes.

### Common Methods

| Method | Returns | Notes |
|--------|---------|-------|
| `get_today()` | `"YYYY-MM-DD"` | Alias for `now_date()` |
| `now_date(as_obj?)` | `"YYYY-MM-DD"` or `Date` | |
| `now_time(as_obj?)` | `"HH:mm:ss"` or `Date` | |
| `now_datetime(as_obj?)` | `"YYYY-MM-DD HH:mm:ss"` or `Date` | |
| `system_datetime(as_obj?)` | datetime string | In system timezone |
| `add_days(date, n)` | string | ⚠️ Returns moment default format, not `YYYY-MM-DD` |
| `add_months(date, n)` | string | Same caveat |
| `get_diff(d1, d2)` | number | Days difference (d1 − d2) |
| `get_hour_diff(d1, d2)` | number | Hours difference |
| `get_minute_diff(d1, d2)` | number | Minutes difference |
| `str_to_user(val, only_time?, only_date?)` | user-format string | Converts system format → user display format |
| `user_to_str(val, only_time?)` | system-format string | Converts user input → system storage format |
| `convert_to_user_tz(date, format?)` | string or moment | System TZ → user TZ |
| `convert_to_system_tz(date, format?)` | string or moment | User TZ → system TZ |
| `validate(date)` | boolean | True if string is valid date/datetime/time |
| `month_start()` | `"YYYY-MM-DD"` | |
| `month_end()` | `"YYYY-MM-DD"` | |
| `week_start()` / `week_end()` | `"YYYY-MM-DD"` | |
| `quarter_start()` / `quarter_end()` | `"YYYY-MM-DD"` | |
| `year_start()` / `year_end()` | `"YYYY-MM-DD"` | |
| `get_user_date_fmt()` | e.g. `"dd-mm-yyyy"` | From sysdefaults |
| `global_date_format(d)` | `"3rd January 2024"` | Human readable |

```js
// Safe add_days usage
const tomorrow = frappe.datetime.str_to_user(
    frappe.datetime.add_days(frappe.datetime.get_today(), 1)
)

// Date range for a filter
{ from_date: frappe.datetime.month_start(), to_date: frappe.datetime.month_end() }
```

---

## 7. Defaults, Session, Boot

### `frappe.defaults.*`

| Method | Notes |
|--------|-------|
| `get_user_default(key)` | Single value for current user (respects permissions) |
| `get_user_defaults(key)` | Array of all permitted values |
| `get_global_default(key)` | From `frappe.sys_defaults[key]` |
| `get_default(key)` | Permission-aware; JSON-parses if possible |
| `set_user_default_local(key, value)` | Mutates local boot data only — no server call |
| `get_user_permissions()` | Returns `_user_permissions` object |

```js
const company = frappe.defaults.get_user_default('Company')
const currency = frappe.defaults.get_global_default('currency')
```

### `frappe.session.*`

| Property | Notes |
|----------|-------|
| `frappe.session.user` | Current user email |
| `frappe.session.user_email` | Same as `user` |
| `frappe.session.user_fullname` | Display name |
| `frappe.session.csrf_token` | CSRF token for requests |

### `frappe.boot.*` — Commonly Used

| Property | Notes |
|----------|-------|
| `frappe.boot.user.roles` | `string[]` — role names |
| `frappe.boot.user.can_read` | `string[]` — doctypes the user can read |
| `frappe.boot.user.can_write` | `string[]` — doctypes the user can write |
| `frappe.boot.user.defaults` | `object` — user's saved defaults |
| `frappe.boot.sysdefaults` | `object` — system settings (currency, date_format, etc.) |
| `frappe.boot.user_info` | `{ [email]: { fullname, image } }` — all user metadata |
| `frappe.boot.time_zone` | `{ system, user }` — timezone strings |
| `frappe.boot.developer_mode` | `boolean` |
| `frappe.boot.lang` | UI language code |

```js
// Check role
const isManager = frappe.boot.user.roles.includes('Sales Manager')

// Restrict to user's company
const company = frappe.defaults.get_user_default('Company')
```

---

## 8. Formatting

### `frappe.format(value, df, options?, doc?)`

| Param | Type | Notes |
|-------|------|-------|
| `value` | any | Raw value to format |
| `df` | object | DocField descriptor: `{ fieldtype, options?, precision?, … }` |
| `options` | object | `{ inline: 1 }` = plain value; `{ only_value: 1 }` = suppress HTML wrapper |
| `doc` | object | Parent doc — needed for Currency and Dynamic Link resolution |

Returns an HTML string (or plain string with `inline: 1`).

**`frappe.format_value` does NOT exist.** Use `frappe.format`.

```js
// Currency
frappe.format(1500.5, { fieldtype: 'Currency', options: 'USD' }, {}, frm.doc)

// Date (display in user format)
frappe.format('2026-03-18', { fieldtype: 'Date' })

// Plain value, no HTML wrapper
frappe.format(0.847, { fieldtype: 'Percent' }, { only_value: 1 })

// Number formatting globals (from number_format.js)
format_currency(1500, 'PEN', 2)   // returns formatted string
format_number(1500.5, null, 2)    // returns formatted string
```

---

## 9. Routing

### `frappe.set_route(...args)`

Accepts varargs, array, or slash-separated string. Returns a Promise.

**Standard patterns:**

```js
frappe.set_route('Form', 'Sales Order', 'SO-0001')         // open doc
frappe.set_route('List', 'Customer')                        // list view
frappe.set_route('List', 'Customer', 'Report')             // report view
frappe.set_route('Tree', 'Account')                         // tree view
frappe.set_route('query-report', 'My Report')              // script report
frappe.set_route('print', 'Sales Order', 'SO-0001')        // print view
```

**Open in new tab:**

```js
frappe.open_in_new_tab = true   // flag — auto-resets after navigation
frappe.set_route('Form', 'Item', 'ITEM-001')
```

**Pass route options (URL query params):**

```js
frappe.route_options = { status: 'Open' }
frappe.set_route('List', 'Task')
```

### `frappe.utils.get_form_link(doctype, name, as_html?, display_text?, query_params?)`

```js
const url = frappe.utils.get_form_link('Sales Order', 'SO-0001')
// → "/app/sales-order/SO-0001"

const link = frappe.utils.get_form_link('Sales Order', 'SO-0001', true, 'Open Order')
// → "<a href='/app/sales-order/SO-0001'>Open Order</a>"
```

---

## 10. Realtime (`frappe.realtime.*`)

`frappe.socketio` is an alias for `frappe.realtime`.

| Method | Notes |
|--------|-------|
| `on(event, callback)` | Register socket.io event listener |
| `off(event, callback)` | Remove socket.io event listener |
| `publish(event, message)` | Emit event to server |
| `doc_subscribe(doctype, name)` | Subscribe to updates for a specific doc |
| `doc_unsubscribe(doctype, name)` | Unsubscribe |
| `doctype_subscribe(doctype)` | Subscribe to all docs of a doctype |
| `doc_open(doctype, name)` | Mark doc as open (presence) |
| `doc_close(doctype, name)` | Mark doc as closed |

Common built-in server events:

| Event | Triggered when |
|-------|----------------|
| `"doc_update"` | A subscribed doc is modified |
| `"msgprint"` | Server calls `frappe.publish_realtime('msgprint', …)` |
| `"progress"` | Server publishes a progress update |
| `"eval_js"` | Server sends JS to evaluate |
| `"list_update"` | List view is requested to refresh |

```js
// Listen for a server push event
frappe.realtime.on('my_custom_event', (data) => {
    console.log('Received', data)
    frappe.show_alert(data.message, 5)
})

// Unsubscribe on cleanup
const handler = (data) => { /* … */ }
frappe.realtime.on('progress', handler)
// later:
frappe.realtime.off('progress', handler)

// Subscribe to doc updates
frappe.realtime.doc_subscribe('Sales Order', frm.docname)
frappe.realtime.on('doc_update', (data) => {
    if (data.doctype === 'Sales Order' && data.name === frm.docname) {
        frm.reload_doc()
    }
})
```

---

## 11. Utilities (`frappe.utils.*`)

| Method | Signature | Notes |
|--------|-----------|-------|
| `get_form_link` | `(doctype, name, as_html?, text?, params?)` | URL or `<a>` tag — see §9 |
| `copy_to_clipboard` | `(string)` | Uses Clipboard API; shows green alert |
| `sleep` | `(seconds)` | `Promise` resolving after delay |
| `debounce` | `(fn, ms, immediate?)` | Standard debounce |
| `throttle` | `(fn, ms, opts?)` | Standard throttle |
| `is_html` | `(txt)` | True if contains element nodes |
| `is_url` | `(txt)` | True if starts with `http://` or `https://` |
| `is_json` | `(str)` | True if valid JSON |
| `parse_json` | `(str)` | JSON.parse with fallback |
| `escape_html` / `unescape_html` | `(txt)` | HTML entity encode/decode |
| `html2text` | `(html)` | Strip HTML → plain text |
| `to_title_case` | `(string, with_space?)` | Title-case |
| `replace_newlines` | `(t)` | `\n` → `<br>` |
| `deep_equal` | `(a, b)` | Deep equality |
| `deep_clone` | `(obj)` | Deep clone |
| `get_random` | `(len)` | Random alphanumeric string |
| `icon` | `(name, size?, class?, viewBox?)` | SVG icon HTML |
| `bind_actions_with_object` | `($el, obj)` | Bind `[data-action]` clicks to object methods |

**Not in `frappe.utils` (contrary to common assumptions):**

| What you want | Actual API |
|---------------|-----------|
| Today's date | `frappe.datetime.get_today()` |
| Add N days | `frappe.datetime.add_days(date, n)` |
| Days diff | `frappe.datetime.get_diff(d1, d2)` |
| Money in words | `format_currency(value, currency)` (global) |
| Current URL origin | `window.location.origin` |

---

## 12. Namespace (`frappe.provide`)

```js
frappe.provide(namespace: string): object
```

- Creates nested namespace on `window` without overwriting existing values
- Safe to call multiple times (idempotent)
- Returns the leaf namespace object

```js
frappe.provide('myapp.pricing')

$.extend(myapp.pricing, {
    format_price(value, currency) {
        return frappe.format(value, { fieldtype: 'Currency', options: currency })
    },
})
```
