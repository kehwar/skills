# Frappe DocType Form Controller — Examples

## 1. Adding a Conditional Action Button

Show a button only when the document is in a specific state, and call a server method on click.

```js
frappe.ui.form.on('Sales Order', {
    refresh(frm) {
        // No need to clear — framework clears all custom buttons before refresh fires
        if (frm.doc.docstatus === 1 && frm.doc.status === 'To Deliver') {
            frm.add_custom_button(__('Create Delivery'), () => {
                frm.trigger('create_delivery')
            })
            frm.change_custom_button_type(__('Create Delivery'), null, 'primary')
        }
    },

    async create_delivery(frm) {
        const { message: delivery } = await frappe.call({
            method: 'myapp.sales.doctype.sales_order.sales_order.create_delivery',
            args: { name: frm.doc.name },
            freeze: true,
            freeze_message: __('Creating Delivery Note...'),
        })
        frappe.show_alert({ message: __('Delivery {0} created', [delivery.name]), indicator: 'green' })
        frm.reload_doc()
    },
})
```

---

## 2. Filtered Link Search Query

Restrict a Link field to only show active records matching a parent field value. Must be called in `setup`.

```js
frappe.ui.form.on('Purchase Order', {
    setup(frm) {
        // Preferred: setup runs once; filter fn reads frm.doc dynamically at search time
        // Could also be in refresh — harmless but redundant on every render
        frm.set_query('supplier', () => ({
            filters: {
                disabled: 0,
                supplier_group: frm.doc.supplier_group || undefined,
            },
        }))

        // Filter item_code inside child table rows
        frm.set_query('item_code', 'items', () => ({
            filters: { is_purchase_item: 1, disabled: 0 },
        }))
    },
})
```

---

## 3. Field Visibility Based on Another Field

Toggle fields when a selector field changes. Wire the trigger on the field name; also call in `refresh` to handle the initial state.

```js
frappe.ui.form.on('Party', {
    refresh(frm) {
        frm.trigger('party_type')   // re-apply visibility on every render
    },

    party_type(frm) {
        const is_company = frm.doc.party_type === 'Company'
        frm.toggle_display('tax_id', is_company)
        frm.toggle_display('individual_id', !is_company)
        frm.toggle_reqd('tax_id', is_company)
    },
})
```

---

## 4. Simple Prompt Dialog

Ask the user for a reason before performing an action.

```js
frappe.ui.form.on('Expense Claim', {
    refresh(frm) {
        if (frm.doc.docstatus === 1 && frm.doc.status !== 'Paid') {
            frm.add_custom_button(__('Mark as Paid'), () => {
                frappe.prompt(
                    { fieldname: 'payment_ref', fieldtype: 'Data', label: __('Payment Reference'), reqd: 1 },
                    ({ payment_ref }) => {
                        frappe.call({
                            method: 'myapp.expenses.mark_paid',
                            args: { name: frm.doc.name, payment_ref },
                            callback() { frm.reload_doc() },
                        })
                    },
                    __('Confirm Payment'),
                    __('Mark Paid')
                )
            })
        }
    },
})
```

---

## 5. Full-Featured Dialog (Fetch → Show → Submit)

Build a dialog that loads server data before showing, validates, and posts back.

```js
frappe.ui.form.on('Project', {
    refresh(frm) {
        if (frm.doc.status === 'Open') {
            frm.add_custom_button(__('Log Hours'), () => {
                frm.trigger('show_log_hours_dialog')
            })
        }
    },

    async show_log_hours_dialog(frm) {
        // 1. Fetch defaults from server
        const { message: defaults } = await frappe.call({
            method: 'myapp.projects.get_task_defaults',
            args: { project: frm.doc.name },
        })

        // 2. Build dialog
        const d = new frappe.ui.Dialog({
            title: __('Log Hours'),
            size: 'large',
            fields: [
                {
                    fieldname: 'task',
                    fieldtype: 'Link',
                    options: 'Task',
                    label: __('Task'),
                    reqd: 1,
                    get_query: () => ({ filters: { project: frm.doc.name, status: 'Open' } }),
                },
                {
                    fieldname: 'hours',
                    fieldtype: 'Float',
                    label: __('Hours'),
                    reqd: 1,
                },
                {
                    fieldname: 'notes',
                    fieldtype: 'Small Text',
                    label: __('Notes'),
                },
            ],
            primary_action_label: __('Save'),
            async primary_action(values) {
                d.disable_primary_action()
                await frappe.call({
                    method: 'myapp.projects.log_hours',
                    args: { project: frm.doc.name, ...values },
                })
                d.hide()
                frappe.show_alert({ message: __('Hours logged'), indicator: 'green' })
                frm.reload_doc()
            },
        })

        // 3. Pre-fill and show
        d.set_values(defaults)
        d.show()
    },
})
```

---

## 6. Server Method with Progress Bar

Show progress while a server-side loop runs. The server enqueues a background job; the client polls or listens.

### Option A — Client-side loop with known iterations

```js
frappe.ui.form.on('Stock Reconciliation', {
    refresh(frm) {
        frm.add_custom_button(__('Reconcile All'), () => {
            frm.trigger('run_reconciliation')
        })
    },

    async run_reconciliation(frm) {
        const items = frm.doc.items
        let processed = 0

        for (const row of items) {
            frappe.show_progress(__('Reconciling'), processed, items.length, row.item_code)
            await frappe.call({
                method: 'myapp.reconcile_item',
                args: { name: frm.doc.name, item_code: row.item_code },
                quiet: true,   // suppress per-call spinner; we show our own progress
            })
            processed++
        }

        frappe.show_progress(__('Reconciling'), items.length, items.length, __('Done'), true)
        frm.reload_doc()
    },
})
```

### Option B — Background job, progress via show_progress (known total)

```js
frappe.ui.form.on('Bulk Email', {
    refresh(frm) {
        if (frm.doc.docstatus === 1 && frm.doc.status === 'Pending') {
            frm.add_custom_button(__('Send Now'), () => {
                frm.trigger('enqueue_send')
            })
        }
    },

    async enqueue_send(frm) {
        // Enqueue the job
        await frappe.call({
            method: 'myapp.bulk_email.enqueue_send',
            args: { name: frm.doc.name },
            freeze: true,
            freeze_message: __('Queueing...'),
        })

        // Poll until done
        frappe.show_progress(__('Sending'), 0, frm.doc.recipient_count, __('Starting…'))

        const poll = setInterval(async () => {
            const { message: status } = await frappe.call({
                method: 'myapp.bulk_email.get_send_status',
                args: { name: frm.doc.name },
                quiet: true,
            })

            frappe.show_progress(
                __('Sending'),
                status.sent,
                status.total,
                __('Sent {0} of {1}', [status.sent, status.total])
            )

            if (status.sent >= status.total) {
                clearInterval(poll)
                frappe.hide_progress()
                frm.reload_doc()
            }
        }, 2000)
    },
})
```

---

## 7. Child Table — Per-Row Calculated Field

When `qty` or `rate` changes in an `items` row, recalculate `amount`.

```js
// Register on the CHILD doctype
frappe.ui.form.on('My Order Item', {
    qty(frm, cdt, cdn) {
        calculateAmount(cdt, cdn)
    },
    rate(frm, cdt, cdn) {
        calculateAmount(cdt, cdn)
    },
})

function calculateAmount(cdt, cdn) {
    const row = frappe.get_doc(cdt, cdn)
    frappe.model.set_value(cdt, cdn, 'amount', (row.qty || 0) * (row.rate || 0))
}
```

---

## 8. Child Table — Button in Grid Toolbar

Add a button above the child table rows that operates on the whole table.

```js
frappe.ui.form.on('Quotation', {
    refresh(frm) {
        const grid = frm.get_field('items').grid
        grid.add_custom_button(__('Fill Standard Rates'), () => {
            frm.trigger('fill_standard_rates')
        })
    },

    async fill_standard_rates(frm) {
        const item_codes = frm.doc.items.map(r => r.item_code).filter(Boolean)
        if (!item_codes.length) return

        const { message: rates } = await frappe.call({
            method: 'myapp.pricing.get_standard_rates',
            args: { item_codes },
        })

        frm.doc.items.forEach(row => {
            if (rates[row.item_code] !== undefined) {
                frappe.model.set_value(row.doctype, row.name, 'rate', rates[row.item_code])
            }
        })
        frm.refresh_field('items')
    },
})
```

---

## 9. Validate Hook — Abort Save with a Custom Error

```js
frappe.ui.form.on('Sales Invoice', {
    validate(frm) {
        const total = frm.doc.items.reduce((sum, r) => sum + (r.amount || 0), 0)
        if (total !== frm.doc.grand_total) {
            frappe.throw(__('Line totals ({0}) do not match Grand Total ({1})', [total, frm.doc.grand_total]))
            // frappe.throw raises an Error; Frappe catches it and aborts the save
        }
    },
})
```

---

## 10. Running a Method On Load (One-Time Setup)

Set a default value from the server when creating a new document.

```js
frappe.ui.form.on('Leave Application', {
    async onload(frm) {
        if (!frm.is_new()) return   // skip existing docs

        const { message: balance } = await frappe.call({
            method: 'myapp.hr.get_leave_balance',
            args: { employee: frm.doc.employee, leave_type: frm.doc.leave_type },
            quiet: true,
        })
        frm.set_value('available_days', balance)
    },

    // Re-fetch balance when leave_type changes
    async leave_type(frm) {
        if (!frm.doc.employee) return
        const { message: balance } = await frappe.call({
            method: 'myapp.hr.get_leave_balance',
            args: { employee: frm.doc.employee, leave_type: frm.doc.leave_type },
            quiet: true,
        })
        frm.set_value('available_days', balance)
    },
})
```
