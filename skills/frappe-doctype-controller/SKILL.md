---
name: frappe-doctype-controller
description: Expert guidance for implementing Frappe DocType Python controllers. Covers the complete hook execution order for insert, save, submit, cancel, delete, load, and rename operations; context guards (is_new(), docstatus, flags, _action); hook placement rules (before_validate vs before_insert vs before_save); detecting field changes with get_doc_before_save(); Document API (insert/save/submit/cancel/delete/rename params); bypassing hooks with db_set vs frappe.db.set_value; and error-raising conventions. Use when writing or debugging .py controller files, choosing which hook to implement, or fixing bugs caused by logic placed in the wrong hook.
---

# Frappe DocType Controller

See [frappe-doctype-schema](../frappe-doctype-schema/SKILL.md) for the `.json` schema side.
See [frappe-doctype-form-view](../frappe-doctype-form-view/SKILL.md) for the `.js` form controller.
See [frappe-doctype-list-view](../frappe-doctype-list-view/SKILL.md) for the `_list.js` list view controller.
See [frappe-doctype-tests](../frappe-doctype-tests/SKILL.md) for writing DocType controller Python tests.
Full per-hook reference and pitfalls table: [REFERENCE.md](REFERENCE.md).

## Quick start

```python
import frappe
from frappe.model.document import Document

class MyDocType(Document):
    def before_validate(self):
        # Auto-fill fields before validation fires
        if not self.status:
            self.status = "Draft"

    def validate(self):
        if self.amount < 0:
            frappe.throw(_("Amount cannot be negative"))

    def on_update(self):
        if self.is_new():
            return  # new-doc logic lives in after_insert
        prev = self.get_doc_before_save()
        if prev and self.has_value_changed("status"):
            notify_status_change(self, prev.status)
```

## Operation Flows

User-overridable hooks only, in call order. Internal framework steps marked `[internal]`.

> **`save()` → `insert()` redirect:** Calling `doc.save()` on a new document (one with `__islocal` set or no `name`) silently redirects to `doc.insert()`. Both paths produce the same INSERT flow below. This means you can always call `doc.save()` regardless of whether a document is new or existing.

### INSERT — `doc.insert()` or `doc.save()` on a new document
```
before_insert
before_naming          ← runs before any naming rule; set fields that naming depends on
autoname               ← set self.name to assign a fully custom name (skipped if name already set)
  before_validate      ← preferred place for auto-filling fields
  validate
  before_save
[db_insert]
after_insert           ← insert-only side effects (emails, child creation)
on_update              ← fires on every write, including insert
on_change              ← fires on every write operation
```

### SAVE — `doc.save()`
```
  before_validate
  validate
  before_save
[db_update]
on_update
on_change
```

### SUBMIT — `doc.submit()`
```
  before_validate
  validate             ← runs on submit too; guard with self._action if needed
  before_submit
[db_update, docstatus=1]
on_update
on_submit
on_change
```

### CANCEL — `doc.cancel()`
```
  before_cancel        ← before_validate is NOT called here
[db_update, docstatus=2]
on_cancel
on_change
```

### UPDATE AFTER SUBMIT — save on a submitted doc
```
  before_validate      ← called, but validate is NOT
  before_update_after_submit
[db_update]
on_update_after_submit
on_change
```

### DELETE — `frappe.delete_doc()`
```
on_trash               ← last chance to block or clean up before deletion
on_change
[db_delete]
after_delete           ← post-delete cleanup (external systems, logs)
```

### LOAD — form opened in browser
```
[load_from_db]
onload                 ← send extra data to client via self.set_onload(key, val)
```

### RENAME — `doc.rename()`
```
[db_rename]
after_rename(old, new, merge)
```

## Document API

Standard way to create and manipulate documents from Python code.

```python
# Create and insert a new document
doc = frappe.new_doc("My DocType")
doc.field_one = "value"
doc.insert()                         # full insert flow + hooks
doc.insert(ignore_permissions=True)  # skip permission check
doc.insert(ignore_mandatory=True)    # skip mandatory field check
doc.insert(ignore_links=True)        # skip Link field validation
doc.insert(ignore_if_duplicate=True) # silently skip if duplicate name

# Load and save an existing document
doc = frappe.get_doc("My DocType", name)
doc.field_one = "new value"
doc.save()                           # full save flow + hooks
doc.save(ignore_permissions=True)

# Submit / Cancel
doc.submit()   # sets docstatus=1, runs submit flow
doc.cancel()   # sets docstatus=2, runs cancel flow

# Delete
doc.delete()                             # triggers on_trash → after_delete
frappe.delete_doc("My DocType", name)    # same, by name
frappe.delete_doc("My DocType", name, ignore_permissions=True)
frappe.delete_doc("My DocType", name, force=True)  # skip back-link checks

# Rename
doc.rename("New Name")                   # triggers after_rename
```

See [REFERENCE.md — Document API](REFERENCE.md#document-api-reference) for the full parameter list of each method.

## Bypassing Hooks

Sometimes you need to write a value to the DB without running the full save cycle (e.g., from within `on_update` itself, or in a migration script).

```python
# doc.db_set — preferred bypass method
# Skips validate/before_save/on_update; still fires before_change and on_change
doc.db_set("status", "Approved")
doc.db_set({"status": "Approved", "approved_by": frappe.session.user})
doc.db_set("status", "Approved", update_modified=False)  # don't touch modified timestamp
doc.db_set("status", "Approved", notify=True)            # push realtime update to browser
doc.db_set("status", "Approved", commit=True)            # immediate DB commit

# frappe.db.set_value — fully raw, zero hooks
# Use only in patches, migrations, or bulk updates where you explicitly don't want any hooks
frappe.db.set_value("My DocType", name, "status", "Approved")
frappe.db.set_value("My DocType", name, {"status": "Approved", "approved_by": user})
```

| Method | Hooks fired | Updates `modified` | Use when |
|---|---|---|---|
| `doc.save()` | Full save cycle | Yes | Normal programmatic saves |
| `doc.db_set()` | `before_change`, `on_change` | Yes (default) | Update one field from inside a hook or background job |
| `frappe.db.set_value()` | None | Yes (default) | Bulk updates, patches, migrations |

> **Warning:** Never call `doc.save()` from inside `after_insert` or `db_set` from inside `validate` — both cause recursion or inconsistent state. Use the appropriate hook instead.

## Context Guards

Gate logic to avoid double-fires and wrong-operation bugs:

```python
self.is_new()               # True only during insert, before first db_insert
self.flags.in_insert        # True throughout the full insert operation
self._action                # "save" | "submit" | "cancel" | "update_after_submit"
self.docstatus              # 0=Draft  1=Submitted  2=Cancelled
self.flags.in_delete        # True while being deleted
```

Common patterns:
```python
def on_update(self):
    if self.is_new():
        return  # handled in after_insert

def validate(self):
    if self._action == "submit":
        # stricter checks only on submission
        ...
```

## Detecting Field Changes

`get_doc_before_save()` returns the pre-save DB state (`None` for new docs).

```python
def on_update(self):
    prev = self.get_doc_before_save()
    if prev and self.has_value_changed("status"):
        # self.status changed since last save
        ...
```

`has_value_changed(fieldname)` is a convenience wrapper for the same comparison.

## Raising Errors

```python
# Hard stop — aborts save, shows error dialog
frappe.throw(_("Error message"), exc=frappe.ValidationError)

# Soft — shows in UI but does not abort
frappe.msgprint(_("Warning: ..."), alert=True)
```

- Use `frappe.throw()` inside `validate` and `before_*` hooks.
- Never use bare `raise` — it bypasses Frappe's error formatting.
- Wrap user-facing strings in `_()` for translation.
