---
name: frappe-system-console
description: "Write Python code for Frappe's System Console that runs through safe_exec (RestrictedPython). Use when writing System Console snippets, one-off scripts in the Frappe desk console, or any code the user wants to paste into System Console. Knows forbidden syntax, whitelisted globals, available builtins, and app-specific extensions via safe_exec_globals hooks."
---

# Frappe System Console Code Writer

Write code that executes inside Frappe's **System Console** (`/app/system-console`), which runs through `frappe.utils.safe_exec` using **RestrictedPython**.

System Console specifics:
- Only **System Manager** role can access
- Output comes from `print()` and `frappe.log()` — shown in the output pane
- The **Commit** checkbox controls whether changes are committed or rolled back after execution
- `frappe.db.commit()` / `frappe.db.rollback()` / `frappe.db.add_index()` are available (unlike doc-event Server Scripts where they're removed)

## Forbidden syntax

These cause immediate compile or runtime errors:

| Blocked | Why |
|---------|-----|
| `import x` / `from x import y` / `from x import *` | All imports forbidden |
| `exec()` / `eval()` / `compile()` / `open()` / `breakpoint()` | Dynamic code, I/O, debugging blocked |
| `async def` / `await` / `async for` / `async with` | Async not allowed |
| `nonlocal` / `...` (Ellipsis) / `class Foo(metaclass=M)` / `try: ... except*` | Misc syntax restrictions |
| `globals()` / `locals()` / `vars()` / `dir()` / `type()` / `super()` / `object` | Introspection and type system blocked |
| `obj._private` | Underscore-prefixed attribute access raises error |
| `obj.format()` on strings | `.format` / `.format_map` blocked (UNSAFE_ATTRIBUTES) |
| `obj.attr += val` / `obj[key] += val` | Augmented assign on attributes/subscripts blocked (`x += 1` is OK) |
| `func(*args)` / `func(**kwargs)` | Star-unpacking in calls fails at runtime |

**Name restrictions**: Names cannot start with `_` (exception: `_dict`). Names ending with `__roles__` forbidden. Allowed dunders in classes: `__init__`, `__contains__`, `__lt__`, `__le__`, `__eq__`, `__ne__`, `__gt__`, `__ge__`.

## Allowed syntax (non-obvious)

`def`, `lambda`, nested functions, `class`, `try`/`except`/`finally`/`raise`, comprehensions, generators, `with`, loops, `if`/`elif`/`else`, decorators, `yield`, walrus `:=` (simple names only), f-strings.

## Available globals

All code has access to globals without importing. See [REFERENCE.md](REFERENCE.md) for the complete API catalog and [EXAMPLES.md](EXAMPLES.md) for real-world patterns.

Custom apps can extend the namespace via `safe_exec_globals` hooks — see [APP-EXTENSIONS.md](APP-EXTENSIONS.md) for how to scan the workspace and discover what each app adds.

Key namespaces: `frappe.*` (documents, messaging, HTTP, qb), `frappe.db.*` (database), `frappe.utils.*` (date/number/string utilities), plus top-level helpers (`json`, `_dict`, `print`, `log`, `_`, `FrappeClient`, etc.).

`frappe.db.sql()` is **SELECT/EXPLAIN only**.

## Common patterns

### Query and print results

```python
docs = frappe.get_all("ToDo", filters={"status": "Open"}, fields=["name", "description"], limit=5)
for d in docs:
    print(d.name, d.description)
```

### Bulk update

```python
names = frappe.get_all("Sales Order", filters={"docstatus": 0, "company": "My Co"}, pluck="name")
for name in names:
    doc = frappe.get_doc("Sales Order", name)
    doc.some_field = "new_value"
    doc.save()
frappe.db.commit()
```

### String formatting

```python
# ✅ f-strings and % formatting work
msg = f"Hello {frappe.session.user}"
msg = "Hello %s" % frappe.session.user

# ❌ .format() is blocked
msg = "Hello {}".format(frappe.session.user)
```
