---
name: frappe-js-api
description: Authoritative reference for all common Frappe global JavaScript APIs available on every desk page. Use when you need to know how to call a Frappe JS global (frappe.call, frappe.xcall, frappe.db.*, frappe.msgprint, frappe.confirm, frappe.show_alert, frappe.throw, frappe.prompt, frappe.ui.Dialog, frappe.show_progress, frappe.datetime.*, frappe.defaults.*, frappe.session.*, frappe.boot.*, frappe.format, frappe.set_route, frappe.model.*, frappe.realtime.*, frappe.utils.*, frappe.provide), or need to find the right API for a particular use case. Other skills reference this for advanced usage; check here first for full option tables and patterns.
---

# Frappe JS API

This is the **source of truth** for global Frappe JavaScript APIs. All APIs here are available on every desk page — no import needed.

Full option tables, signatures, and advanced patterns: [REFERENCE.md](REFERENCE.md)

---

## Use-Case Decision Tree

### "I need to call the server"

```
Is async and you only need r.message?
  YES → frappe.xcall(method, args)   ← returns Promise<value>
  NO  → frappe.call({ method, args, callback, freeze, btn, … })  ← jQuery deferred
```

### "I need to read/write data without opening a form"

```
Read one field from a doc?         → frappe.db.get_value(doctype, name_or_filters, fieldname)
Read multiple fields?              → frappe.db.get_value(doctype, filters, [f1, f2, …])
Read a list of docs?               → frappe.db.get_list(doctype, { fields, filters, limit, … })
Check if a doc exists?             → frappe.db.exists(doctype, name)
Count docs?                        → frappe.db.count(doctype, { filters })
Read a Single doctype field?       → frappe.db.get_single_value(doctype, field)
Persist a field change?            → frappe.db.set_value(doctype, name, fieldname, value)
Read from LOCAL store (no server)? → frappe.model.get_value(doctype, name, fieldname)
                                     frappe.model.get_doc(doctype, name)
```

### "I need to show a message or feedback"

```
Short toast / alert banner?        → frappe.show_alert(message_or_opts, seconds)
Modal message box?                 → frappe.msgprint(message_or_opts)
Ask user yes/no?                   → frappe.confirm(message, onYes, onNo)
Validation error (throws)?         → frappe.throw(message_or_opts)
Long-running progress bar?         → frappe.show_progress(title, count, total, description)
```

### "I need user input"

```
Single-field quick prompt?         → frappe.prompt(label_or_field, callback, title)
Multiple-field form?               → new frappe.ui.Dialog({ fields, primary_action })
```

### "I need to work with dates"

```
Today's date?                      → frappe.datetime.get_today()  // "YYYY-MM-DD"
Current datetime?                  → frappe.datetime.now_datetime()
Add/subtract days?                 → frappe.datetime.add_days(date, n)
Diff in days?                      → frappe.datetime.get_diff(d1, d2)
Month/week/year start or end?      → frappe.datetime.month_start() / month_end() / …
Format for display?                → frappe.datetime.str_to_user(date_string)
```

### "I need session / user context"

```
Current user email?                → frappe.session.user
User's default company?            → frappe.defaults.get_user_default("Company")
User's roles?                      → frappe.boot.user.roles
System currency/date format?       → frappe.boot.sysdefaults.*
```

### "I need to format a value"

```
frappe.format(value, { fieldtype: "Currency", options: "USD" }, {}, doc)
frappe.format(value, { fieldtype: "Date" })
frappe.format(value, { fieldtype: "Percent" })
```

### "I need to navigate"

```
Open a form?           → frappe.set_route("Form", doctype, name)
Open a list?           → frappe.set_route("List", doctype)
Open in new tab?       → frappe.open_in_new_tab = true; frappe.set_route(…)
Get a form URL?        → frappe.utils.get_form_link(doctype, name)
```

### "I need realtime / push events"

```
Listen for a server push event?    → frappe.realtime.on("event_name", callback)
Stop listening?                    → frappe.realtime.off("event_name", callback)
Subscribe to doc updates?          → frappe.realtime.doc_subscribe(doctype, name)
```

---

## Quick API Index

| API | One-liner |
|-----|-----------|
| `frappe.call` | Server call, full options (freeze, btn, error, always) |
| `frappe.xcall` | Server call, returns Promise resolving to `r.message` |
| `frappe.db.get_value` | Fetch field(s) from a doc by name or filter |
| `frappe.db.get_list` | Fetch list of docs with fields/filters/limit |
| `frappe.db.exists` | Check if doc exists, returns Promise<boolean> |
| `frappe.db.count` | Count docs matching filters |
| `frappe.db.set_value` | Persist field change immediately (bypasses form) |
| `frappe.db.get_single_value` | Read Single doctype field |
| `frappe.model.get_value` | Local store read (no server) |
| `frappe.model.set_value` | Local store write + fires triggers |
| `frappe.model.get_doc` | Get doc from local `locals` store |
| `frappe.new_doc` | Open Quick Entry / new form for doctype |
| `frappe.msgprint` | Modal message dialog |
| `frappe.confirm` | Yes/No confirm dialog |
| `frappe.show_alert` / `frappe.toast` | Toast notification banner |
| `frappe.throw` | Show error and throw JS exception |
| `frappe.prompt` | Quick single- or multi-field input dialog |
| `frappe.ui.Dialog` | Full custom dialog with fields |
| `frappe.show_progress` | Progress bar dialog |
| `frappe.datetime.*` | Date/time utilities |
| `frappe.defaults.*` | User/global defaults |
| `frappe.session.*` | Current user session info |
| `frappe.boot.*` | Boot-time config and user metadata |
| `frappe.format` | Format a value by fieldtype for display |
| `frappe.set_route` | Navigate to a desk route |
| `frappe.realtime.*` | Socket.io event pub/sub |
| `frappe.utils.*` | Misc helpers (links, clipboard, debounce, …) |
| `frappe.provide` | Define a global namespace safely |

---

## Common Gotchas

- **`frappe.call` vs `frappe.xcall`**: `frappe.call` gives you the full `r` response and works with jQuery deferreds; `frappe.xcall` returns `r.message` directly as a native Promise. Use `xcall` for clean `async/await` code.
- **`frappe.model.*` is LOCAL-ONLY**. It reads/writes `locals[doctype][name]`, the in-memory form store. It never hits the server unless a `callback` is passed to `get_value`.
- **`frappe.db.set_value` bypasses form validation and triggers** — it calls `frappe.client.set_value` directly. Use `frm.set_value` on the form if you need form triggers to fire.
- **`frappe.datetime.add_days`** returns moment's default output format, not `"YYYY-MM-DD"`. Wrap with `frappe.datetime.str_to_user()` for display.
- **`frappe.format_value` does not exist**. Use `frappe.format(value, df, options, doc)`.
- **`frappe.utils.now()`, `.nowdate()`, `.add_days()`, `.diff_in_days()`, `.money_in_words()` do NOT exist**. Use `frappe.datetime.*` equivalents.
- **`frappe.defaults.set_default` does not exist** in JS. Use `frappe.defaults.set_user_default_local` for local-only changes.
- **`frappe.open_in_new_tab`** is a flag, not a function. Set it to `true` before `frappe.set_route`, then it auto-resets.
