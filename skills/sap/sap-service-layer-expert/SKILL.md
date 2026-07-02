---
name: sap-service-layer-expert
description: Expert guidance for writing correct, runnable Python scripts that interact with SAP Business One Service Layer REST API. Use when creating, reading, updating, or deleting SAP B1 data via the Service Layer, producing two-file output contracts (_data.json + _run.py), writing OData query strings, understanding PATCH vs PUT semantics, or looking up endpoint schemas from the bundled OpenAPI spec.
---

# SAP Service Layer Expert

## Quick start

1. Read [SESSION.md](SESSION.md) for the complete `ServiceLayer` context-manager class.
2. Copy `assets/script_template.py` as the starting point for every new script.
3. Look up endpoint schemas in `assets/spec/paths/{ResourceName}.yaml` for field names.
4. Check [ENDPOINTS.md](ENDPOINTS.md) for available HTTP methods and action functions per resource.
5. See [REFERENCE.md](REFERENCE.md) for base URL/auth, OData params, HTTP semantics, document chaining, and schema resolution strategies.

---

## Two-file output contract

Every mutation script ships **exactly two files** under `.temp/` in the repo root:

| File | Contents |
|---|---|
| `.temp/<operation>_data.json` | Records to create/update/delete — no credentials |
| `.temp/<operation>_run.py` | `assets/script_template.py` with `main()` filled in |

Naming: `snake_case`, verb first — `patch_business_partners`, `create_sales_order`.

```python
# Example main()
def main(data: list, sl: ServiceLayer) -> None:
    for record in data:
        card_code = record.pop("CardCode")
        sl.patch(f"BusinessPartners('{card_code}')", record)
        log.info("Patched %s", card_code)
```

---

## Script checklist

- [ ] Derive repo root from workspace context; create `.temp/` if needed
- [ ] `_data.json` contains only data — no credentials, no boilerplate
- [ ] `_run.py` starts from `assets/script_template.py`
- [ ] Always use **PATCH** (not PUT) for partial updates
- [ ] Log out in `finally` (handled by `ServiceLayer.__exit__`)
- [ ] `main(data, sl)` implements the full logic
- [ ] Use `sl.patch()` for updates (not `sl.post()` or PUT)
- [ ] Log each record processed with `log.info()`
- [ ] Verify key field names against `assets/spec/paths/{Resource}_id.yaml` before patching
- [ ] After creating both files, tell the user they can review and ask you to run the script

---

## Running a script

When the user asks to run a script:

1. **Run it directly** — do not check for `.env` files or environment variables beforehand. The script validates its own environment on startup and will print a clear error if credentials are missing.
2. **Working directory**: the main repo root (derived from workspace context — the app folder that owns the current task). Scripts live under `.temp/` within that root, but `cd` to the repo root so that `python-dotenv` finds the `.env` file there.
3. **Python interpreter**: use the bench virtualenv Python at `/workspace/development/frappe-bench/env/bin/python`.

```bash
cd <main-repo-root>
/workspace/development/frappe-bench/env/bin/python .temp/<operation>_run.py
```

---

## Related skills

| Skill | When to use |
|---|---|
| `sap-schema-expert` | Look up DB column names, table structure, and encoded values |
| `sap-di-api-expert` | COM-based automation and read/write via DI API |
| `sap-dtw-expert` | Bulk import/export via Data Transfer Workbench TSV files |

See [REFERENCE.md](REFERENCE.md) for schema resolution strategies and ⚠️ property name / DB column mapping pitfalls.
