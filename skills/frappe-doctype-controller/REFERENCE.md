# Frappe DocType Controller — Reference

## Document API Reference

### `frappe.new_doc(doctype)` → Document
Creates an in-memory document with defaults applied. Does **not** write to DB. Assign fields, then call `.insert()` or `.save()`.

### `doc.insert(**kwargs)` → Document

| Parameter | Default | Effect |
|---|---|---|
| `ignore_permissions` | `None` | Skip create permission check |
| `ignore_links` | `None` | Skip Link field validation |
| `ignore_if_duplicate` | `False` | Silently no-op if a record with the same name already exists |
| `ignore_mandatory` | `None` | Skip mandatory field check |
| `set_name` | `None` | Force a specific name instead of autoname |
| `set_child_names` | `True` | Auto-generate names for child table rows |

### `doc.save(**kwargs)` → Document
Redirects to `insert()` if the document is new (no `name` or `__islocal` set).

| Parameter | Default | Effect |
|---|---|---|
| `ignore_permissions` | `None` | Skip write permission check |
| `ignore_version` | `None` | Skip saving a version snapshot |

### `doc.submit()` / `doc.cancel()`
No parameters. Internally sets `docstatus` then calls `save()`. The submit/cancel flows re-use all `save()` parameters at their defaults.

### `doc.delete(...)` / `frappe.delete_doc(doctype, name, ...)`

| Parameter | Default | Effect |
|---|---|---|
| `ignore_permissions` | `False` | Skip delete permission check |
| `force` | `False` | Skip back-link existence check (`check_if_doc_is_linked`) |
| `ignore_on_trash` | `False` | Skip `on_trash` hook entirely |
| `delete_permanently` | `False` | Skip moving attachments to trash |

### `doc.rename(name, ...)` — `frappe.rename_doc(doctype, old, new, ...)`

| Parameter | Default | Effect |
|---|---|---|
| `merge` | `False` | Merge into existing document with target name |
| `force` | `False` | Rename even if target name exists |
| `validate_rename` | `True` | Run rename validation checks |

### `frappe.get_doc(doctype, name)` → Document
Loads a document from DB. Also accepts a `dict` to construct an unsaved doc in memory.

---

## Bypassing Hooks — Detail

### `doc.db_set(fieldname, value, ...)` 
Writes a value to DB without running the full save lifecycle. Still fires `before_change` and `on_change`.

| Parameter | Default | Effect |
|---|---|---|
| `fieldname` | required | Field name string, or `dict` of `{field: value}` pairs |
| `value` | `None` | Value to set (ignored when `fieldname` is a dict) |
| `update_modified` | `True` | Update `modified` and `modified_by` timestamps |
| `notify` | `False` | Push realtime `doc_update` event to browser via socketio |
| `commit` | `False` | Call `frappe.db.commit()` immediately after |

**Hooks fired by `db_set`:** `before_change` → DB write → `on_change`

### `frappe.db.set_value(doctype, name, fieldname, value, ...)` 
Purely raw SQL update. Zero hooks fired. Use only in:
- Data migration patches
- Bulk updates where triggering hooks would be incorrect or prohibitively slow
- Scheduler jobs updating timestamps/status on many records

```python
# Single field
frappe.db.set_value("My DocType", name, "status", "Approved")

# Multiple fields
frappe.db.set_value("My DocType", name, {
    "status": "Approved",
    "approved_by": frappe.session.user
})

# Skip touching modified timestamp
frappe.db.set_value("My DocType", name, "status", "Approved", update_modified=False)
```

### Comparison

| Method | `before_change` | `on_change` | `validate` | `on_update` | Updates `modified` |
|---|---|---|---|---|---|
| `doc.save()` | No | Yes | Yes | Yes | Yes |
| `doc.db_set()` | Yes | Yes | No | No | Yes (default) |
| `frappe.db.set_value()` | No | No | No | No | Yes (default) |

---

## Complete Hook Table

All user-overridable hooks across all operations.

| Hook | Operations | Called | Typical use | Key pitfall |
|---|---|---|---|---|
| `before_insert` | INSERT | Before naming & before_validate | One-time setup that must run before field population | Too late for defaults that validate needs; use `before_validate` instead |
| `before_naming` | INSERT | First hook called, before any naming rule runs | Populate fields that the naming series or `autoname` method depends on | Runs before `before_validate`; `self.name` is not set yet |
| `autoname` | INSERT | After `before_naming`, only if name not yet assigned by naming rules | Set `self.name` entirely in Python (custom naming logic) | Skipped if a Document Naming Rule or the `autoname` meta property already set `self.name`; do not call `make_autoname` when the schema's `autoname` field covers the case |
| `before_validate` | INSERT, SAVE, SUBMIT, UPDATE_AFTER_SUBMIT | Before `validate` | Auto-populate fields, derive computed fields, normalise input | **Not called on cancel.** Guard with `self._action` if needed |
| `validate` | INSERT, SAVE, SUBMIT | After `before_validate` | Raise on invalid state, cross-field checks | Runs on **submit** too — avoid side effects here; use `_action` guard |
| `before_save` | INSERT, SAVE | After `validate`, before DB write | Final mutations just before write | Prefer `before_validate` for field defaults |
| `before_submit` | SUBMIT | After `validate`, before DB write | Submit-specific checks | `validate` already ran; don't duplicate checks here |
| `before_cancel` | CANCEL | Before DB write | Block cancel if dependencies exist | `before_validate` and `validate` are NOT called on cancel |
| `before_update_after_submit` | UPDATE_AFTER_SUBMIT | After `before_validate`, before DB write | Validate allowed edits on submitted doc | `validate` is NOT called here |
| `after_insert` | INSERT | After DB insert, before `on_update` | Insert-only side effects: emails, create linked records | Do NOT call `self.save()` here — causes recursion |
| `on_update` | INSERT, SAVE, SUBMIT | After DB write | React to any save; detect field changes | Fires on insert too — guard with `self.is_new()` or `self.flags.in_insert` |
| `on_submit` | SUBMIT | After `on_update` | Create ledger entries, lock records | `on_update` already ran — do not duplicate |
| `on_cancel` | CANCEL | After DB write | Reverse submit-time side effects | Mirror what `on_submit` did, in reverse |
| `on_update_after_submit` | UPDATE_AFTER_SUBMIT | After DB write | React to allowed edits on submitted doc | Only fields with `allow_on_submit=1` can be changed |
| `on_trash` | DELETE | Before DB delete | Block deletion, clean up links | Can raise `frappe.ValidationError` to prevent deletion |
| `after_delete` | DELETE | After DB delete | Clean up external systems, orphaned files | Doc is already gone from DB; do not call `self.save()` |
| `before_change` | `db_set` only | Before the raw DB write in `db_set` | React to a targeted field update before it lands | Only fires via `db_set`, never via `save()` |
| `on_change` | INSERT, SAVE, SUBMIT, CANCEL, UPDATE_AFTER_SUBMIT, DELETE, `db_set` | Last hook of every write op | Cross-doctype reactions, audit trail | Fires on every operation including delete and `db_set` |
| `onload` | LOAD (browser only) | When form opens in browser | Send computed or joined data to client | NOT called during `insert()`/`save()` — desk-only |
| `after_rename` | RENAME | After DB rename | Update denormalised references to the old name | Signature: `after_rename(self, old, new, merge)` |

---

## Internal Methods (Debugging Reference)

These are called by Frappe internally and should **not** be overridden; listed here to aid debugging stack traces.

| Internal method | Purpose |
|---|---|
| `_set_defaults()` | Applies field defaults from DocType meta |
| `set_user_and_timestamp()` | Sets `owner`, `modified_by`, `creation`, `modified` |
| `set_docstatus()` | Syncs `docstatus` integer to the `DocStatus` enum |
| `check_if_latest()` | Raises if a newer version exists (optimistic locking) |
| `_validate_links()` | Checks all Link fields point to existing records |
| `check_permission()` | Raises `PermissionError` if user lacks required perm level |
| `set_new_name()` | Applies naming series / autoname rules |
| `run_before_save_methods()` | Orchestrates `before_validate` → `validate` → `before_*` |
| `_validate()` | Runs internal field-level validation (lengths, non-negative, etc.) |
| `run_post_save_methods()` | Orchestrates `on_update` → `on_submit`/`on_cancel`/etc. → `on_change` |
| `load_doc_before_save()` | Loads DB state into `self._doc_before_save` before write |
| `save_version()` | Records a version snapshot if track_changes is enabled |

---

## Context Guards — Patterns

### Distinguish insert from update in `on_update`
```python
def on_update(self):
    if self.is_new():
        return  # after_insert already handled this
```

### Run only on a specific operation
```python
def validate(self):
    if self._action == "submit":
        # Extra checks required only at submission
        if not self.approved_by:
            frappe.throw(_("Approver is required before submitting"))
```

### Check docstatus
```python
def on_update(self):
    if self.docstatus == 1:
        # doc was just submitted
        ...
```

### Avoid re-running during programmatic saves
```python
def on_update(self):
    if self.flags.in_insert:
        return  # entire insert operation still in progress
```

---

## Detecting Field Changes

`get_doc_before_save()` loads the DB state that existed before the current save. It returns `None` for new documents (insert path).

```python
def on_update(self):
    prev = self.get_doc_before_save()
    if not prev:
        return  # new document

    if self.has_value_changed("status"):
        handle_status_transition(
            doc=self,
            old_status=prev.status,
            new_status=self.status,
        )
```

`has_value_changed(fieldname)` is equivalent to:
```python
prev = self.get_doc_before_save()
prev and self.get(fieldname) != prev.get(fieldname)
```

---

## `onload` — Sending Data to the Browser

`onload` runs only when a form opens in the Frappe desk UI. Use it to attach computed data into the document's `__onload` bag so client-side JS can read it without an extra API call.

```python
def onload(self):
    self.set_onload("related_count", frappe.db.count(
        "Related DocType", {"parent_id": self.name}
    ))
```

Client JS reads it as:
```javascript
frm.doc.__onload.related_count
```

---

## Hook Placement Cheat Sheet — Common Mistakes

| Scenario | Wrong hook | Right hook | Why |
|---|---|---|---|
| Auto-fill a derived field | `before_insert` | `before_validate` | `before_insert` runs before naming; `before_validate` is the earliest point where all input fields are settled and links are present |
| Set a default only on creation | `validate` | `before_validate` + `is_new()` guard | `validate` runs on every save; will overwrite user edits |
| Send a "created" notification email | `validate` | `after_insert` or `on_update` with `is_new()` guard | `validate` runs before the DB write — transaction may still fail |
| Reverse side effects on cancel | `on_update` | `on_cancel` | `on_update` fires on cancel too (docstatus=2 written) |
| React when a specific field changes | `on_update` (unconditional) | `on_update` + `has_value_changed()` | Without guard, runs on every save even when field is unchanged |
| Block deletion | `validate` | `on_trash` | `validate` is not called during delete |
| Post-delete cleanup | `on_trash` | `after_delete` | `on_trash` fires before the DB row is removed; `after_delete` fires after |
| Edit a submitted doc field | `on_submit` | Mark field `allow_on_submit=1`, handle in `on_update_after_submit` | Submitted docs reject field edits unless explicitly allowed |

---

## `frappe.throw` vs `frappe.msgprint`

```python
# Raises ValidationError, aborts the save, shows modal error
frappe.throw(_("Cannot save: reason"), exc=frappe.ValidationError)

# Raises a specific exception type
frappe.throw(_("Not enough stock"), exc=frappe.InsufficientStockError)

# Shows a non-blocking message (does not abort)
frappe.msgprint(_("Note: auto-assigned to {0}").format(self.owner), alert=True)

# Shows a confirmation dialog (client-side only, not useful in controller)
# Use frappe.confirm() only in JS
```

Conventions:
- All user-visible strings must be wrapped in `_()`.
- Wrap field names and values in `frappe.bold()` for emphasis in error messages.
- Raise in `validate`, `before_*`, or `on_trash` — these are the only hooks where raising cleanly aborts the operation.
- Raising in `on_update`, `on_submit`, etc. will still abort but leaves the DB write already done, potentially causing inconsistency.
