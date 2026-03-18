---
name: frappe-doctype-form-view
description: Expert guidance for implementing Frappe DocType JavaScript form controllers (.js app files). Covers the complete lifecycle hook execution order (setup/onload/refresh) with explicit placement rules, frm object API (fields_dict, set_query, set_value, toggle_display/reqd/enable, add_custom_button, frm.trigger), frappe.call for server methods, frappe.prompt and frappe.ui.Dialog for user input dialogs, frappe.show_progress for progress feedback, child table APIs, and reusable helper code via frappe.ui.form.Controller subclasses (extend_cscript pattern) to avoid global scope pollution. Use when writing or debugging .js controller files, choosing which hook to use, adding custom buttons, building dialogs, running server methods, triggering events programmatically, sharing logic across event handlers, or fixing bugs caused by logic placed in the wrong hook.
---

# Frappe DocType Form Controller (.js)

See [frappe-doctype-schema](../frappe-doctype-schema/SKILL.md) for the `.json` schema.
See [frappe-doctype-controller](../frappe-doctype-controller/SKILL.md) for the `.py` server controller.
See [frappe-doctype-list-view](../frappe-doctype-list-view/SKILL.md) for the `_list.js` list view controller.
See [frappe-js-api](../frappe-js-api/SKILL.md) for full option tables on `frappe.call`, `frappe.db.*`, dialogs, datetime, and all other globals.
Full per-hook details: [REFERENCE.md](REFERENCE.md).
Common use-case examples: [EXAMPLES.md](EXAMPLES.md).

## Quick Start

```js
// myapp/mymodule/doctype/my_doc_type/my_doc_type.js
frappe.ui.form.on('My Doc Type', {
    setup(frm) {
        // runs ONCE per doctype load — wire set_query, one-time event listeners
        frm.set_query('customer', () => ({
            filters: { disabled: 0 },
        }))
    },

    onload(frm) {
        // runs when a new docname is loaded for the first time
        // use for defaults that need server context (frm.doc.name exists here)
        if (frm.is_new()) {
            frm.set_value('posting_date', frappe.datetime.get_today())
        }
    },

    refresh(frm) {
        // runs on EVERY render — initial load, after save, after submit/cancel
        // ALL conditional buttons and field visibility logic lives here
        frm.add_custom_button(__('Run Report'), () => {
            // called synchronously as user action
        })
        frm.toggle_display('tax_id', frm.doc.party_type === 'Company')
    },

    customer(frm) {
        // field trigger: fires when frm.doc.customer changes
        if (!frm.doc.customer) {
            frm.set_value('customer_name', '')
        }
    },
})
```

---

## Placement Rules

These rules prevent the most common JS form bugs. Follow them strictly.

### The Golden Three

| Hook | Rule |
|------|------|
| `setup` | **Wire-up only.** Call `frm.set_query()` here (preferred — runs once). Register event listeners that should exist regardless of document state. Never read `frm.doc` values—the doc may not yet be loaded. |
| `refresh` | **All conditional UI here.** Add/remove custom buttons, show/hide fields, toggle `reqd`/`enable`. **Runs every render**—never accumulate state; always start from scratch. |
| `onload` | **One-time initialization.** Set default field values. Runs only on first load of a docname, before first `refresh`. |

### Placement Decision Tree

```
Does it react to a field value changing?
  YES → field trigger (fieldname(frm))
  NO  → Does it run every time the form renders?
    YES → refresh(frm)
    NO  → Is it wiring search queries or one-time listeners?
      YES → setup(frm)
      NO  → Is it setting default values on new docs?
        YES → onload(frm) + guard with frm.is_new()
        NO  → on_submit / before_cancel / validate / etc.
```

### Custom Buttons Are Always Safe in `refresh`

Framework calls `frm.clear_custom_buttons()` automatically inside `refresh_header()`, which runs **before** the `refresh` trigger fires in the serial chain:

```
refresh_header()          ← clears all custom buttons
form-refresh (global)     
refresh_fields()          
script_manager.trigger('refresh')  ← your refresh(frm) runs here
```

So just add your buttons — no manual clear needed:

```js
refresh(frm) {
    if (frm.doc.status === 'Pending') {
        frm.add_custom_button(__('Approve'), () => approve(frm))
    }
}
```

`frm.clear_custom_buttons()` manually is only needed if you want to wipe buttons from **within** a button's click handler or some other non-refresh context.

---

## `frm` Object — Key Properties

```js
frm.doc           // live local document (plain JS object)
frm.doctype       // "My Doc Type"
frm.docname       // "MY-DOC-0001"
frm.fields_dict   // { fieldname: field_control }
frm.is_new()      // true when doc is unsaved (no server name)
frm.is_dirty()    // true when doc has unsaved changes
frm.page          // frappe.ui.Page — page-level buttons, title
frm.dashboard     // frappe.ui.form.Dashboard — in-form progress bars, stats
frm.custom_buttons// { label: jQuery$btn } — track added custom buttons
```

---

## Common APIs — Quick Reference

See [REFERENCE.md](REFERENCE.md) for full signatures.

### Field Visibility / State

```js
frm.toggle_display(fnames, show)        // show/hide one or more fields
frm.toggle_reqd(fnames, mandatory)      // set required
frm.toggle_enable(fnames, enable)       // set editable / read-only
frm.set_df_property(f, prop, value)     // set any docfield property ('label', 'options', ...)
```

### Setting Values

```js
await frm.set_value('field', value)
await frm.set_value({ field1: val1, field2: val2 })
```

### Triggering Events Programmatically

`frm.trigger(event, cdt?, cdn?)` fires a registered event handler as if the user had caused it. Use it to avoid duplicating logic that already lives in a field trigger or a named event.

```js
// Fire a field trigger manually (e.g. after setting a value in code)
async customer(frm) {
    await frm.set_value('territory', 'Peru')
    // set_value does NOT fire the territory trigger — call it explicitly
    frm.trigger('territory')
},

// Fire a named (non-field) event — useful for separating concerns
refresh(frm) {
    if (frm.doc.status === 'Cancelled') {
        frm.trigger('on_cancel_ui')   // delegate display logic to a named handler
    }
},

on_cancel_ui(frm) {
    frm.toggle_display('cancellation_reason', true)
    frm.toggle_reqd('cancellation_reason', true)
},
```

**Rules:**
- `frm.trigger` is **always synchronous dispatch** — it calls the handler immediately but the handler may itself be async. If you need to await its side-effects (e.g. a `frappe.call` inside it), await the trigger: `await frm.trigger('field')`.
- Calling `frm.trigger('refresh')` re-runs your `refresh` hook — rarely needed but valid.
- For child-table events pass `cdt` and `cdn`: `frm.trigger('item_code', cdt, cdn)`.
- Do **not** trigger `setup` or `onload` — those hooks are lifecycle-managed by the framework.

### Buttons

```js
frm.add_custom_button(__('Label'), handler, group)  // group=null for top-level
frm.remove_custom_button(__('Label'), group)
frm.clear_custom_buttons()
frm.change_custom_button_type(__('Label'), group, 'primary')  // or 'danger', 'warning'
```

### Link Search Filters

```js
// Preferred: in setup(frm) — runs once, no repeated work
frm.set_query('fieldname', () => ({ filters: { active: 1 } }))
frm.set_query('child_fieldname', 'parent_table_field', () => ({ filters: {} }))
```

### Calling Server Methods

```js
// Preferred — explicit, no magic
frappe.call({
    method: 'myapp.mymodule.doctype.my_doc.my_doc.my_function',
    args: { name: frm.doc.name },
    freeze: true,
    callback(r) { console.log(r.message) },
})

// await/async style
const { message } = await frappe.call({ method: '...', args: {} })
```

### Dialogs

```js
// Simple prompt
frappe.prompt([{ label: 'Date', fieldname: 'date', fieldtype: 'Date', reqd: 1 }],
    (values) => console.log(values.date), __('Title'), __('Confirm'))

// Full dialog
const d = new frappe.ui.Dialog({
    title: __('My Dialog'),
    fields: [...],
    primary_action(values) { d.hide() },
    primary_action_label: __('Submit'),
})
d.show()
```

### Progress Bars

```js
frappe.show_progress(__('Processing'), current, total, __('Description'))
frappe.hide_progress()

// In-form dashboard progress bar (inside the form, no modal dialog)
frm.dashboard.show_progress(__('Processing'), 45, __('Step 2 of 4'))  // percent 0–100
frm.dashboard.hide_progress()
```

### Dashboard Headline Alerts

Display a colored alert banner **inside the form** between the form header and the first field. Persistent until explicitly cleared.

```js
// Primitive — arbitrary HTML, color is one of: 'yellow', 'blue', 'red', 'green', 'orange'
frm.dashboard.set_headline('<b>Pending</b> approval since ' + frm.doc.creation, 'yellow')
frm.dashboard.clear_headline()                        // remove the banner

// Plain-text shorthand (wraps text in <div> automatically)
frm.dashboard.set_headline_alert(__('On Hold'), 'orange')
frm.dashboard.set_headline_alert(null)               // also clears

// Auto-dismissing (clears after 10 seconds unless permanent=true)
frm.dashboard.add_comment(__('Reminder: attach invoice before submitting'), 'yellow')
frm.dashboard.add_comment(__('Settings saved'), 'green', /*permanent=*/false)
```

### Dashboard Indicator Pills

Add a small colored pill in the **Stats** section below the links area.

```js
frm.dashboard.add_indicator(__('Overdue'), 'red')
frm.dashboard.add_indicator(frm.doc.status, 'blue')
```

See [REFERENCE.md § Dashboard Alerts & Indicators](REFERENCE.md#dashboard-alerts--indicators) for full signatures and color values.

---

## Child Tables — Short Reference

```js
// Grid reference
const grid = frm.get_field('items').grid

// Add button to grid toolbar
grid.add_custom_button(__('Fill Prices'), () => fillPrices(frm))

// Add button to each row (in refresh of child's frappe.ui.form.on block)
frappe.ui.form.on('My Child DocType', {
    my_child_field_on_form_rendered(frm, cdt, cdn) {
        // fires when a child row expander opens
    }
})

// Accessing a child row doc
const row = frappe.get_doc(cdt, cdn)
frappe.model.set_value(cdt, cdn, 'rate', 100)  // set value in child row
```

See [REFERENCE.md § Child Tables](REFERENCE.md#child-tables) for the full grid API.

---

## Reusable Code — The `frappe.ui.form.Controller` Pattern

### The problem

All code inside a `.js` file executes in the browser's global scope. Declaring helper functions at the top level puts them on `window`, polluting the global namespace and risking collisions across doctypes.

```js
// ❌ BAD — pollutes window.canTransitionTo
function canTransitionTo(frm, status) { ... }

frappe.ui.form.on('My Doc', {
    refresh(frm) {
        if (canTransitionTo(frm, 'Active')) { ... }   // global leak
    },
})
```

### The solution: extend `frappe.ui.form.Controller`

Frappe's built-in Controller pattern (used internally for DocType and Customize Form) is the canonical way to attach reusable methods to a form without polluting global scope.

```js
// ✅ GOOD — safe namespace, no global pollution
frappe.provide('frappe.model')

frappe.model.MyDocTypeController = class MyDocTypeController extends frappe.ui.form.Controller {
    // this.frm is always available (set by the base class constructor)

    canTransitionTo(newStatus) {
        const allowed = { Draft: ['Active'], Active: ['Archived', 'Draft'] }
        return (allowed[this.frm.doc.status] || []).includes(newStatus)
    }

    isManager() {
        return frappe.user_roles.includes('System Manager')
    }
}

frappe.ui.form.on('My Doc Type', {
    refresh(frm) {
        if (!frm.cscript.isManager()) return

        if (frm.cscript.canTransitionTo('Active')) {
            frm.add_custom_button(__('Activate'), () => frm.trigger('activate'), __('Actions'))
        }
    },
})

// Must be the last line — merges controller methods into frm.cscript
extend_cscript(cur_frm.cscript, new frappe.model.MyDocTypeController({ frm: cur_frm }))
```

### How it works

| Part | What it does |
|------|------|
| `frappe.ui.form.Controller` | Base class: `constructor(opts) { $.extend(this, opts); }` — copies `{ frm }` as instance properties, making `this.frm` available on every method |
| `frappe.provide('frappe.model')` | Creates the namespace object safely — a no-op if it already exists, never clobbers |
| `extend_cscript(frm.cscript, instance)` | Merges controller's own properties and prototype chain into `frm.cscript` via `$.extend` + `__proto__` assignment, so all methods are accessible via `frm.cscript` |
| `frm.cscript.myMethod()` | How event handlers call controller methods |

### Namespace conventions

Follow Frappe's own convention — put the controller on a `frappe.provide` namespace, never on `window`.

```js
frappe.provide('frappe.model')           // Frappe's own doctypes (DocType, Customize Form)
frappe.provide('myapp.model')            // ✅ recommended for app-specific doctypes
frappe.provide('myapp.controllers')      // acceptable alternative
```

**Naming**: `<Namespace>.<DocTypeNameInCamelCase>Controller`  
Example for docttype "Sales Commission Settlement" in app "soldamundo":

```js
frappe.provide('frappe.model')
frappe.model.SalesCommissionSettlementController = class ... extends frappe.ui.form.Controller { ... }
```

### Placement rules for Controller methods

| Put in Controller | Keep in `frappe.ui.form.on` |
|---|---|
| Permission / role checks | `setup`, `refresh`, field triggers |
| State transition guards | Any hook that needs `(frm, cdt, cdn)` args |
| Helpers called from ≥ 2 event handlers | One-shot logic used only once |
| Constants shared across handlers | |

### Controller does NOT replace event hooks

Event hooks (`setup`, `refresh`, `fieldname`) must stay in `frappe.ui.form.on`. The Controller is only for **helper methods** — not for declaring lifecycle hooks.

> **Why?** If you define `refresh()` on the Controller, Frappe calls it as an old-style handler with `(doc, cdt, cdn)` signature (not `(frm, ...)`). Mixing old-style and new-style handlers is confusing. Keep all event declarations in `frappe.ui.form.on`.

### Full file structure

```js
// 1. Namespace + Controller class (top of file)
frappe.provide('frappe.model')

frappe.model.MyDocTypeController = class MyDocTypeController extends frappe.ui.form.Controller {
    ALLOWED_TRANSITIONS = {
        Draft: ['Active'],
        Active: ['Archived', 'Draft'],
    }

    canTransitionTo(newStatus) {
        return (this.ALLOWED_TRANSITIONS[this.frm.doc.status] || []).includes(newStatus)
    }

    isManager() {
        return frappe.user_roles.includes('System Manager')
    }
}

// 2. Event hooks
frappe.ui.form.on('My Doc Type', {
    refresh(frm) {
        if (!frm.cscript.isManager()) return

        if (frm.cscript.canTransitionTo('Active')) {
            frm.add_custom_button(__('Activate'), () => frm.trigger('activate'), __('Actions'))
        }
    },

    activate(frm) {
        frappe.confirm(__('Activate this record?'), () => {
            frappe.call({ method: 'activate', doc: frm.doc, callback() { frm.reload_doc() } })
        })
    },
})

// 3. extend_cscript — ALWAYS last line
extend_cscript(cur_frm.cscript, new frappe.model.MyDocTypeController({ frm: cur_frm }))
```
