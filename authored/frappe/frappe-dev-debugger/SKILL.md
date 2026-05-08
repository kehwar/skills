---
name: frappe-dev-debugger
description: Query the live Frappe database, read private/public .json.gz snapshot files from disk, execute whitelisted Python methods, and run arbitrary scripts with full Frappe context via bench console. Use when debugging Frappe issues in development — checking document field values, inspecting stored report/snapshot files, running live queries, or calling whitelisted server methods from the terminal.
---

# Frappe Dev Debugger

All commands run from the **bench directory** (`/workspace/development/frappe-bench`).
Default site: `development.localhost`.

## 1. Query documents (bench execute)

Query a single doc (returns JSON printed to stdout):

```bash
bench --site development.localhost execute frappe.get_doc \
  --args '["DocType", "docname"]' | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('fieldname'))"
```

Query a list (`frappe.get_all`):

```bash
bench --site development.localhost execute frappe.get_all \
  --args '["DocType", {"filters": {"status": "Active"}, "fields": ["name", "field1"], "limit": 5}]'
```

> **Limitation:** `bench execute` only works with top-level `frappe.*` functions and simple positional args. For anything more complex (multi-step logic, child tables, file reads) use **bench console** instead.

## 2. Read stored .json.gz files (disk)

Frappe stores report/snapshot data as `.json.gz` files under `sites/{site}/private/files/` or `sites/{site}/public/files/`.

Discover the file URL from the document first (step 1), then read it:

```python
# Read any .json.gz from disk directly
import gzip, json
site = "sites/development.localhost"
path = site + "/private/files/your_file.json.gz"   # swap private/public as needed
with gzip.open(path, "rb") as f:
    content = json.loads(f.read())

print(list(content.keys()))    # inspect top-level structure
```

Inspect top-level structure first, then drill in:

```python
print(list(content.keys()))   # e.g. ['result', 'columns'] or {'data': [...], 'meta': {...}}
rows = content.get("result") or content.get("data") or []
print(f"{len(rows)} rows")
print(rows[0] if rows else "empty")
```

Run this as a one-liner from terminal:

```bash
cd /workspace/development/frappe-bench && python3 - <<'EOF'
import gzip, json
with gzip.open("sites/development.localhost/private/files/YOUR_FILE.json.gz", "rb") as f:
    c = json.loads(f.read())
print(json.dumps(c, indent=2, default=str)[:3000])
EOF
```

## 3. Run multi-step scripts (bench console)

Use `bench console` for anything needing full Frappe context: doc loads, multiple queries, method calls, file reads + processing.

```bash
bench --site development.localhost console << 'EOF'
# frappe is pre-imported; all installed apps are available
doc = frappe.get_doc("Purchase Order", "PUR-0001")
print(doc.status, doc.supplier)

# call any imported function
from myapp.module.utils import my_function
result = my_function(doc)
print(result)
EOF
```

> **Tip:** `bench console` runs with full app context — all doctypes, hooks, and installed-app modules are importable. No `frappe.init()` / `frappe.connect()` needed.

## 4. Call whitelisted methods

Whitelisted methods (`@frappe.whitelist()`) can be called from console the same way client code would call them:

```bash
bench --site development.localhost console << 'EOF'
# Call a whitelisted method directly — no HTTP needed
from myapp.mymodule.doctype.mydoctype.mydoctype import my_whitelisted_fn
doc = frappe.get_doc("MyDoctype", "DOC-0001")
my_whitelisted_fn(doc)
frappe.db.commit()
EOF
```

Or trigger a method defined directly on the document:

```bash
bench --site development.localhost console << 'EOF'
doc = frappe.get_doc("MyDoctype", "DOC-0001")
doc.my_method()
frappe.db.commit()
EOF
```

## 5. Raw SQL queries

```bash
bench --site development.localhost console << 'EOF'
rows = frappe.db.sql("""
    SELECT name, status, owner
    FROM `tabPurchase Order`
    WHERE supplier = 'Supplier A'
    ORDER BY modified DESC
    LIMIT 10
""", as_dict=True)
for r in rows:
    print(r)
EOF
```

Or use the query builder:

```bash
bench --site development.localhost console << 'EOF'
from frappe.query_builder import DocType
T = DocType("Purchase Order")
rows = frappe.qb.from_(T).select(T.name, T.status).where(T.supplier == "Supplier A").run(as_dict=True)
print(rows)
EOF
```

## 6. Locate files on disk

```bash
# Find all files attached to a specific document
bench --site development.localhost console << 'EOF'
files = frappe.get_all("File", filters={
    "attached_to_doctype": "Purchase Order",
    "attached_to_name": "PUR-0001",
}, fields=["name", "file_name", "file_url", "attached_to_field"])
for f in files:
    print(f.attached_to_field, "->", f.file_url)
EOF
```

Map `file_url` → disk path:
- `/private/files/foo.gz` → `sites/development.localhost/private/files/foo.gz`
- `/files/foo.gz` → `sites/development.localhost/public/files/foo.gz`

## 7. Debugging checklist

1. **What document?** — get the `name` (ID) first.
2. **Which fields matter?** — `bench execute frappe.get_doc` and inspect field values.
3. **Any attached files?** — list via `frappe.get_all("File", ...)`, then read from disk.
4. **Is a method producing wrong output?** — call it directly in `bench console`, `print()` intermediate values.
5. **Database state correct?** — raw SQL or `frappe.db.get_value` to verify stored values.
6. **Commit or rollback?** — add `frappe.db.commit()` explicitly when mutations must persist; omit to leave DB unchanged.
