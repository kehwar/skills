---
name: frappe-doctype-tests
description: Expert guidance for writing DocType controller Python tests in custom Frappe apps. Covers the mandatory workflow (read controller, read schema, write test, run), FrappeTestCase base class, make_ helper pattern, and 6 test categories (validation, computed fields, lifecycle side-effects, whitelisted methods, link validation, child table logic). Use when writing test_{doctype}.py files, testing controller hooks, testing whitelisted methods, or debugging failing doctype tests.
---

# Frappe DocType Tests

See [frappe-doctype-schema](../frappe-doctype-schema/SKILL.md) for the `.json` schema.
See [frappe-doctype-controller](../frappe-doctype-controller/SKILL.md) for the `.py` server controller.
See [frappe-doctype-form-view](../frappe-doctype-form-view/SKILL.md) for the `.js` form controller.
See [frappe-doctype-list-view](../frappe-doctype-list-view/SKILL.md) for the `_list.js` list view controller.
Full API reference, assertion helpers, context managers, and CLI flags: [REFERENCE.md](REFERENCE.md).

## Mandatory workflow

Before writing any test, complete these steps **in order**:

1. **Read the controller** (`.py`) — identify hooks, validations, computed fields, whitelisted methods
2. **Read the schema** (`.json`) — identify fields, child tables, link fields, `is_submittable`, mandatory fields
3. **Write the test** (`test_{doctype}.py`) in the same doctype folder
4. **Run** with `bench run-tests --doctype "DocType Name"`

## File location

```
app_name/module/doctype/my_doctype/
├── my_doctype.json
├── my_doctype.py          # controller
└── test_my_doctype.py     # tests (you write this)
```

## Test class skeleton

```python
import frappe
from frappe.tests.utils import FrappeTestCase


class TestMyDoctype(FrappeTestCase):
    def tearDown(self):
        frappe.set_user("Administrator")

    def test_valid_document_saves(self):
        doc = make_my_doctype()
        self.assertTrue(doc.name)

    def test_negative_amount_rejected(self):
        self.assertRaises(
            frappe.ValidationError,
            make_my_doctype,
            amount=-1,
        )


def make_my_doctype(**args):
    """Create a My Doctype with sensible defaults."""
    args = frappe._dict(args)
    doc = frappe.get_doc({
        "doctype": "My Doctype",
        "title": args.title or "Test Title",
        "amount": args.amount if args.amount is not None else 100,
    })
    if not args.do_not_save:
        doc.insert(ignore_permissions=True)
        if not args.do_not_submit:
            doc.submit()  # only if is_submittable
    return doc
```

## make_ helper rules

Place at **module level** (bottom of file). Accept `**args`, wrap in `frappe._dict(args)`. Provide sensible defaults for every mandatory field. Support `do_not_save` and `do_not_submit` flags. Always `ignore_permissions=True`. Only call `submit()` if `is_submittable = 1`.
## Test naming

Name tests `test_{behavior}` — the class name already identifies the doctype.

## 6 test categories

For each controller, write tests covering applicable categories. Full examples in [REFERENCE.md](REFERENCE.md).

| Category | What to test | Pattern |
|----------|-------------|---------|
| **Validation** | Invalid input raises `frappe.ValidationError` | `self.assertRaises(frappe.ValidationError, make_..., bad_field=bad_value)` |
| **Computed fields** | Derived values correct after save | `make_(..., do_not_submit=True)` then `assertEqual` |
| **Lifecycle side-effects** | submit/cancel/trash create/modify other docs | `make_(...)` then `frappe.get_all(...)` |
| **Whitelisted methods** | `@frappe.whitelist()` methods work correctly | `doc.method()`, `doc.reload()`, assert |
| **Link validation** | Invalid links rejected | `assertRaises` with nonexistent link value |
| **Child table logic** | Validation/computation across child rows | Pass `items=[...]` to helper, assert totals or errors |

## Submittable vs non-submittable

Check `is_submittable` in the doctype JSON:

- **Non-submittable** (`0`): `make_` helper calls `insert()` only. No submit/cancel tests.
- **Submittable** (`1`): `make_` helper calls `insert()` then `submit()`. Test draft → submitted → cancelled flow.

## Running tests

```bash
bench run-tests --doctype "My Doctype"                              # all tests
bench run-tests --doctype "My Doctype" --test test_method_name      # one test
bench run-tests --doctype "My Doctype" --failfast                   # stop on first failure
bench run-tests --doctype "My Doctype" --skip-test-records          # faster startup
```
