# System Console Examples

Common patterns organized by category. Uses only standard Frappe/ERPNext doctypes.

## Inspect a document

```python
doc = frappe.get_doc("ToDo", "TODO-00001")
print(doc.as_json())
```

```python
doc = frappe.get_doc("User", "Administrator")
print(doc.full_name, doc.email)
```

## Query and list documents

```python
# Simple list with pluck
for name in frappe.get_all("DocType", limit=5, pluck="name"):
    print(name)
```

```python
# Filtered query with multiple fields
docs = frappe.get_all("ToDo", filters={"status": "Open"}, fields=["name", "description", "owner"], limit=10)
for d in docs:
    print(d.name, d.owner, d.description)
```

```python
# Wildcard filter with 'like'
docs = frappe.get_all("Sales Order", filters={"name": ["like", "SO-2025-%"]}, pluck="name")
for name in docs:
    print(name)
```

```python
# Check existence
exists = frappe.db.exists("Customer", {"customer_name": "Acme Corp"})
print(exists)
```

```python
# Count documents
total = frappe.db.count("Error Log")
print(f"Total error logs: {total}")
```

## Raw SQL queries

```python
sql = """
    SELECT `owner`, COUNT(*) as cnt
    FROM `tabToDo`
    WHERE `status` = 'Open'
    GROUP BY `owner`
    ORDER BY cnt DESC
    LIMIT 10
"""
rows = frappe.db.sql(sql, as_dict=True)
for r in rows:
    print(r.owner, r.cnt)
```

```python
# Get query as string without executing (run=0)
query = frappe.db.get_all(
    "ToDo",
    filters=[["status", "=", "Open"]],
    fields=["name", "owner"],
    order_by="creation desc",
    run=0,
)
print(query)
```

## Bulk update with db.set_value (no hooks)

```python
# Quick field update — skips controller hooks
docs = frappe.get_all("ToDo", filters={"status": "Open", "owner": "old@example.com"}, pluck="name")
for name in docs:
    frappe.db.set_value("ToDo", name, "allocated_to", "new@example.com")
frappe.db.commit()
```

```python
# Single record fix
frappe.db.set_value("Customer", "CUST-001", "customer_group", "Commercial")
frappe.db.commit()
```

## Bulk update with save (triggers hooks)

```python
names = frappe.get_all("Sales Order", filters={"docstatus": 0, "company": "My Co"}, pluck="name")
for name in names:
    doc = frappe.get_doc("Sales Order", name)
    doc.delivery_date = frappe.utils.add_days(frappe.utils.today(), 7)
    doc.save()
frappe.db.commit()
```

## Create documents in a loop

```python
users = frappe.get_all("User", filters={"enabled": 1, "user_type": "System User"}, pluck="name")
for user in users:
    doc = frappe.new_doc("ToDo")
    doc.description = f"Review pending tasks for {user}"
    doc.allocated_to = user
    doc.save()
frappe.db.commit()
```

## Enqueue background jobs

```python
# Enqueue a whitelisted method
frappe.enqueue("frappe.utils.backups.scheduled_backup", queue="long")
```

```python
# Enqueue a document method
docs = frappe.get_all("Sales Invoice", filters={"docstatus": 0, "company": "My Co"}, pluck="name")
for name in docs:
    frappe.enqueue_doc("Sales Invoice", name, "submit", queue="default")
```

## Modify child tables

```python
doc = frappe.get_doc("Employee", "HR-EMP-00001")
doc.append("education", {"school_univ": "MIT", "qualification": "MBA"})
doc.save()
frappe.db.commit()
```

## Copy and modify a document

```python
source = frappe.get_doc("Sales Order", "SO-00001")
new_doc = frappe.copy_doc(source)
new_doc.delivery_date = frappe.utils.add_days(frappe.utils.today(), 14)
new_doc.save()
frappe.db.commit()
```

## Rename a document

```python
frappe.rename_doc("Item", "OLD-ITEM-CODE", "NEW-ITEM-CODE", force=1)
frappe.db.commit()
```

## Delete documents

```python
# Delete old logs
logs = frappe.get_all("Error Log", filters={"creation": ["<", "2025-01-01"]}, pluck="name", limit=100)
for name in logs:
    frappe.delete_doc("Error Log", name)
frappe.db.commit()
```

## Run a report programmatically

```python
data = frappe.call("frappe.desk.query_report.run", report_name="General Ledger", filters={"company": "My Co", "from_date": "2025-01-01", "to_date": "2025-12-31"})
for row in (data.get("result") or [])[:10]:
    print(row)
```

## Render a Jinja template

```python
data = {
    "customer": "Acme Corp",
    "total": 15000,
    "date": frappe.utils.today(),
}

template = """
<b>Invoice Summary</b><br>
<b>Customer:</b> {{ data.customer }}<br>
<b>Total:</b> {{ frappe.utils.fmt_money(data.total, currency="USD") }}<br>
<b>Date:</b> {{ frappe.utils.format_date(data.date) }}
"""

html = frappe.render_template(template, {"data": data})
print(html)
```

## Utility helpers

```python
# scrub: convert label to snake_case fieldname
print(scrub("Sales Invoice"))  # sales_invoice
```

```python
# Date utilities
print(frappe.utils.nowdate())
print(frappe.utils.add_days(frappe.utils.today(), 30))
print(frappe.utils.date_diff("2025-12-31", "2025-01-01"))
```

```python
# Session info
print(f"User: {frappe.session.user}")
print(f"Full name: {frappe.full_name}")
```

```python
# JSON output
data = frappe.get_all("DocType", filters={"module": "Core"}, fields=["name", "module"], limit=5)
print(as_json(data))
```
