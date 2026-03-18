---
name: frappe-doctype-form-view
description: Expert guidance for implementing Frappe DocType JavaScript form controllers (.js app files). Covers the complete lifecycle hook execution order (setup/onload/refresh) with explicit placement rules, frm object API (fields_dict, set_query, set_value, toggle_display/reqd/enable, add_custom_button), frappe.call for server methods, frappe.prompt and frappe.ui.Dialog for user input dialogs, frappe.show_progress for progress feedback, and child table APIs. Use when writing or debugging .js controller files, choosing which hook to use, adding custom buttons, building dialogs, running server methods, or fixing bugs caused by logic placed in the wrong hook.
---

# Frappe DocType Form Controller (.js)

See [frappe-doctype-schema](../frappe-doctype-schema/SKILL.md) for the `.json` schema.
See [frappe-doctype-controller](../frappe-doctype-controller/SKILL.md) for the `.py` server controller.
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
```

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
