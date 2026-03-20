---
name: frappe-run-tests
description: Run Frappe/ERPNext Python tests via bench CLI. Use when user says "run tests", "run this test", "test this doctype", "test this file", or mentions bench run-tests. Covers running specific test files, doctype tests, and full app test suites.
---

# Frappe Test Runner

Run all commands from the **bench directory** (`/workspace/development/frappe-bench`).

Omit `--site` — the default site is used automatically. If you get `Site not found` or `Tests not allowed`, run:

```bash
bench set-config default-site development.localhost
bench set-config allow_tests true
```

## Decision Tree

**What does the user want to test?**

### A specific test file (most common)

Derive the `--module` value from the file path:

```
File path:  apps/{app}/{app}/{module}/doctype/{doctype}/test_{doctype}.py
Module arg: {app}.{module}.doctype.{doctype}.test_{doctype}
```

**Examples:**

| File path | `--module` value |
|---|---|
| `apps/soldamundo/soldamundo/soldamundo/doctype/item/test_item.py` | `soldamundo.soldamundo.doctype.item.test_item` |
| `apps/tweaks/tweaks/tweaks/doctype/ac_rule/test_ac_rule.py` | `tweaks.tweaks.doctype.ac_rule.test_ac_rule` |
| `apps/erpnext/erpnext/stock/doctype/item/test_item.py` | `erpnext.stock.doctype.item.test_item` |
| `apps/soldamundo/soldamundo/utils/tests/test_helpers.py` | `soldamundo.utils.tests.test_helpers` |

**Formula:** Strip `apps/{app}/` prefix, strip `.py` suffix, replace `/` with `.`

```bash
bench run-tests --module {module_path}
```

Add `--failfast` to stop on first failure (recommended during iteration):

```bash
bench run-tests --module {module_path} --failfast
```

Add `--skip-test-records` to skip creating test records (useful when test records are large or complex and not needed for the specific test being run):

```bash
bench run-tests --module {module_path} --skip-test-records
```

### A specific doctype

```bash
bench run-tests --doctype "{Doctype Name}"
```

Uses the DocType's display name (spaces, title case). Frappe discovers the test file automatically.

```bash
# Examples
bench run-tests --doctype "Sales Invoice"
bench run-tests --doctype "AC Rule"
bench run-tests --doctype "Item"
```

### All tests for an app

```bash
bench run-tests --app {app_name}
```

```bash
# Examples
bench run-tests --app soldamundo
bench run-tests --app tweaks
bench run-tests --app erpnext
```

## Deriving module path from current file

When the user says "run this test" or "run tests for this file", derive the module path from the file the user has open:

1. Get the absolute file path (e.g. `/workspace/development/frappe-bench/apps/soldamundo/soldamundo/utils/tests/test_helpers.py`)
2. Strip everything up to and including `apps/{app_name}/` (result: `soldamundo/utils/tests/test_helpers.py`)
3. Strip `.py` suffix (result: `soldamundo/utils/tests/test_helpers`)
4. Replace `/` with `.` (result: `soldamundo.utils.tests.test_helpers`)
5. Use as: `bench run-tests --module soldamundo.utils.tests.test_helpers`

If the file is not a test file (no `test_` prefix), look for a corresponding `test_` file in the same directory or the doctype's directory.
