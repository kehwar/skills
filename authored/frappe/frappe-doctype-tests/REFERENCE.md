# Frappe DocType Tests — Reference

## Test category examples

### 1. Validation logic

Test that invalid input raises `frappe.ValidationError`:

```python
def test_end_date_before_start_date(self):
    self.assertRaises(
        frappe.ValidationError,
        make_my_doctype,
        start_date="2025-06-01",
        end_date="2025-05-01",
    )
```

### 2. Computed fields

Test that derived values are set correctly after save:

```python
def test_total_computed(self):
    doc = make_my_doctype(qty=5, rate=20, do_not_submit=True)
    self.assertEqual(doc.total, 100)
```

### 3. Lifecycle side-effects

Test that submit/cancel/trash create or modify other documents:

```python
def test_submit_creates_ledger_entry(self):
    doc = make_my_doctype()  # submits by default
    entries = frappe.get_all("Ledger Entry", filters={"reference": doc.name})
    self.assertTrue(entries)

def test_cancel_reverses_ledger(self):
    doc = make_my_doctype()
    doc.cancel()
    entries = frappe.get_all("Ledger Entry", filters={"reference": doc.name, "is_cancelled": 1})
    self.assertTrue(entries)
```

### 4. Whitelisted methods

Test `@frappe.whitelist()` methods on the controller:

```python
def test_approve_sets_status(self):
    doc = make_my_doctype(do_not_submit=True)
    doc.approve()  # whitelisted method
    doc.reload()
    self.assertEqual(doc.status, "Approved")
```

### 5. Link validation

Test that invalid links are rejected:

```python
def test_invalid_customer_rejected(self):
    self.assertRaises(
        frappe.ValidationError,
        make_my_doctype,
        customer="NONEXISTENT",
    )
```

### 6. Child table logic

Test validation and computation across child rows:

```python
def test_duplicate_items_rejected(self):
    self.assertRaises(
        frappe.ValidationError,
        make_my_doctype,
        items=[
            {"item_code": "ITEM-001", "qty": 1},
            {"item_code": "ITEM-001", "qty": 2},
        ],
    )

def test_child_totals_summed(self):
    doc = make_my_doctype(
        items=[
            {"item_code": "A", "qty": 2, "rate": 10},
            {"item_code": "B", "qty": 3, "rate": 20},
        ],
        do_not_submit=True,
    )
    self.assertEqual(doc.grand_total, 80)
```

## FrappeTestCase API

Base class: `from frappe.tests.utils import FrappeTestCase`

Extends `unittest.TestCase`. Provides DB rollback after each test class, thread-local restoration, and Frappe-specific assertions.

### Class attributes

| Attribute | Default | Purpose |
|-----------|---------|---------|
| `TEST_SITE` | `"test_site"` | Site used for tests |
| `ADMIN_PASSWORD` | from site config | Admin password for API tests |
| `maxDiff` | `10_000` | Max diff size in assertion output |

### Lifecycle

```
setUpClass()        # commits pending DB changes, registers cleanup handlers
  setUp()           # (your code)
    test_*()        # individual test
  tearDown()        # (your code — always call frappe.set_user("Administrator"))
tearDownClass()     # DB is rolled back via addClassCleanup
```

**Important**: The DB is rolled back at the **class** level, not per-test. All tests within a class share the same DB state. If test A inserts a document, test B can see it.

### Assertion helpers

| Method | Purpose |
|--------|---------|
| `assertDocumentEqual(expected, actual)` | Compare partial expected dict/doc against actual. Handles float precision and child tables recursively. |
| `assertSequenceSubset(larger, smaller)` | Assert `smaller` is a subset of `larger`. |
| `assertQueryEqual(first, second)` | Normalize SQL with sqlparse and compare. |
| `assertQueryCount(count)` | Context manager — assert max number of DB queries executed within the block. |
| `assertRedisCallCounts(count)` | Context manager — assert max Redis commands within the block. |
| `assertRowsRead(count)` | Context manager — assert max DB rows read within the block. |

### Context managers

| Method | Purpose | Example |
|--------|---------|---------|
| `self.set_user(user)` | Switch authenticated user | `with self.set_user("test@example.com"):` |
| `self.freeze_time(dt)` | Freeze time (uses freezegun) | `with self.freeze_time("2025-01-01"):` |
| `self.switch_site(site)` | Switch to different site/DB | `with self.switch_site("other.site"):` |
| `self.primary_connection()` | Use primary DB connection | For multi-user simulation |
| `self.secondary_connection()` | Use secondary DB connection | For concurrent operation tests |

## Standalone utilities

Import from `frappe.tests.utils`:

### change_settings

Temporarily change a Settings doctype and restore after test:

```python
from frappe.tests.utils import change_settings

# As decorator
@change_settings("Stock Settings", {"allow_negative_stock": 1})
def test_negative_stock(self):
    pass

# As context manager
def test_with_setting(self):
    with change_settings("Accounts Settings", unlink_advance_payment_on_cancelation_of_order=1):
        # setting is active here
        pass
    # setting is restored

# With commit (for cross-connection visibility)
@change_settings("Print Settings", {"send_print_as_pdf": 1}, commit=True)
def test_pdf_setting(self):
    pass
```

### patch_hooks

Temporarily override `frappe.get_hooks()` results:

```python
from frappe.tests.utils import patch_hooks

def test_custom_hook(self):
    with patch_hooks({"doc_events": {"My Doctype": {"on_update": ["my_app.hooks.custom_handler"]}}}):
        doc = make_my_doctype()
        # custom_handler is called
```

### timeout

Decorator to fail slow tests:

```python
from frappe.tests.utils import timeout

@timeout(seconds=30)
def test_slow_operation(self):
    pass
```

## Common APIs used in tests

### Document operations

```python
# Create
doc = frappe.get_doc({"doctype": "My Doctype", ...})
doc.insert(ignore_permissions=True)

# Submit (submittable doctypes only)
doc.submit()

# Cancel
doc.cancel()

# Reload from DB
doc.reload()

# Delete
doc.delete(ignore_permissions=True)

# Copy (for amendments)
amended = frappe.copy_doc(doc)
amended.amended_from = doc.name
amended.insert()
```

### Database queries in assertions

```python
# Check document exists
self.assertTrue(frappe.db.exists("My Doctype", doc.name))

# Check field value in DB
self.assertEqual(frappe.db.get_value("My Doctype", doc.name, "status"), "Active")

# Check related documents were created
entries = frappe.get_all("Child Doctype", filters={"parent_ref": doc.name})
self.assertEqual(len(entries), 3)

# Check count
count = frappe.db.count("Log Entry", filters={"reference": doc.name})
self.assertEqual(count, 1)
```

### Mock data generation

```python
# frappe.mock(type) — uses faker library
name = frappe.mock("name")                    # "John Doe"
email = frappe.mock("email")                  # "john@example.com"
phone = frappe.mock("phone_number")           # "+1-555-0123"
text = frappe.mock("paragraph")               # lorem ipsum paragraph
names = frappe.mock("name", size=5)           # list of 5 names
```

## bench run-tests CLI flags

```bash
bench run-tests [flags]

# Target selection
--app APP                   # Run all tests for an app
--doctype DOCTYPE           # Run tests for specific doctype
--module MODULE             # Run tests for a module (e.g., "selling")
--module-def MODULE_DEF     # Run tests for all doctypes in a Module Def
--test TEST                 # Specific test method name (repeatable)
--case CASE                 # Specific TestCase class name

# Behavior
--failfast                  # Stop on first failure
--skip-test-records         # Don't create test_records (faster startup)
--skip-before-tests         # Don't run before_tests hooks

# Output
--verbose                   # Verbose output
--profile                   # Enable profiling
--coverage                  # Enable code coverage
--junit-xml-output PATH     # Generate JUnit XML report
```

### Common invocations

```bash
# Run all tests for a doctype
bench run-tests --doctype "Sales Order"

# Run one test method
bench run-tests --doctype "Sales Order" --test test_negative_qty_rejected

# Run all tests for your app, fast
bench run-tests --app my_app --skip-test-records --failfast

# Run with profiling
bench run-tests --doctype "Sales Order" --profile
```

## Common pitfalls

| Pitfall | Fix |
|---------|-----|
| Test passes alone but fails in suite | Tests share DB state within a class. Don't depend on insertion order. Use `make_` helper with unique values. |
| `frappe.ValidationError` not raised | Check if `ignore_permissions=True` bypasses the validation. Some validations only run for non-admin users. |
| Stale data after save | Call `doc.reload()` before asserting DB-written values. |
| User context leaks between tests | Always reset in `tearDown`: `frappe.set_user("Administrator")` |
| Test can't find linked document | Create dependencies in `setUpClass` or in the `make_` helper. |
| Submittable doc won't submit | Ensure `docstatus` is 0 (Draft) before calling `submit()`. Don't set `docstatus` manually. |
| `frappe.db.commit()` in controller breaks test rollback | Avoid `frappe.db.commit()` in controller code when possible. In tests, this persists data past rollback. |

## make_ helper template

Copy and adapt this template for each doctype:

```python
def make_my_doctype(**args):
    """Create a My Doctype with sensible test defaults."""
    args = frappe._dict(args)
    doc = frappe.get_doc({
        "doctype": "My Doctype",
        # Required fields with defaults
        "title": args.title or frappe.mock("name"),
        "company": args.company or "_Test Company",
        "date": args.date or "2025-01-01",
        "amount": args.amount if args.amount is not None else 100,
        # Child table
        "items": args.items or [{"item_code": "_Test Item", "qty": 1, "rate": 100}],
    })
    if not args.do_not_save:
        doc.insert(ignore_permissions=True)
        if not args.do_not_submit:
            doc.submit()
    return doc
```

### Key patterns in the helper

- Use `args.field if args.field is not None else default` for numeric fields (allows passing `0`)
- Use `args.field or default` for string fields
- For child tables, accept a list of dicts and fall back to a minimal default row
- Return the doc object so tests can chain operations
