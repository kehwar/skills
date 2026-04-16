# SAP Schema Expert — Build Guide

This document describes how to rebuild the skill's data assets from scratch.
All scripts live in `scripts/` and write their outputs to `assets/`.

---

## Pipeline overview

```
Step 1: build_table_index.py
    SAP Table Overview page
        → assets/TABLE_INDEX.yaml   (machine-readable index)

Step 2: build_table_schemas.py
    assets/TABLE_INDEX.yaml  +  SAP table detail pages
        → assets/schemas/<TABLENAME>.yaml  (one file per table)

Step 3: build_derived_assets.py
    assets/TABLE_INDEX.yaml  +  assets/schemas/*.yaml
        → assets/OBJ_TYPE_MAP.yaml   (ObjType code → document family)
        → assets/REVERSE_REFS.yaml   (inbound FK index)
        → assets/TABLE_INDEX.yaml    (augmented with parent/obj_type/related_to)
```

Run the steps **in order**. Steps 2 and 3 read the output of their predecessor.

---

## Step 1 — Build the table index

Fetches the SAP B1 SDK "Database Tables Reference" overview page and builds
the master list of all tables.

```bash
python scripts/build_table_index.py
```

**Options**

| Flag | Effect |
|---|---|
| _(none)_ | Use cached overview HTML if present, otherwise fetch from web. |
| `--no-cache` | Force re-fetch from the SAP help site, overwriting the cache. |

**`tabletype` values written to every entry**

| Value | Name pattern | Examples |
|---|---|---|
| `header` | `O`-prefix (any) | `OINV`, `ORDR`, `OAT1` |
| `lines` | Letters + trailing digits, no `O` prefix | `INV1`, `RDR1`, `PCH1` |
| `history` | `A`-prefix | `ADOC`, `AIT1`, `ACRD` |
| `udt` | `@`-prefix | `@ODOC_SALES` |
| `standalone` | Everything else | `CINF`, `CTNS`, `JDT1` |

**Output**

| File | Description |
|---|---|
| `assets/TABLE_INDEX.yaml` | Sorted list of `{tablename, module, tabletype, description, url}` dicts. |

---

## Step 2 — Fetch per-table schemas

Reads `assets/TABLE_INDEX.yaml`, visits each table's detail page on the SAP
help site, and writes a YAML schema file with all field definitions.

```bash
# First run — fetch everything (takes ~20–40 min with default workers)
python scripts/build_table_schemas.py

# Resume after an interruption — skip already-written files
python scripts/build_table_schemas.py --resume

# Refresh a subset of tables
python scripts/build_table_schemas.py OINV ORDR INV1

# Tune concurrency (reduce if you get rate-limited)
python scripts/build_table_schemas.py --resume --workers 3 --delay 0.5
```

**Options**

| Flag | Effect |
|---|---|
| `--resume` | Skip tables whose `.yaml` already exists in `assets/schemas/`. |
| `--no-cache` | Bypass the HTML disk cache; always re-fetch from the web. |
| `--workers N` | Number of concurrent HTTP workers (default: 8). |
| `--delay S` | Seconds to sleep between requests per worker (default: 0.1). |
| `TABLE …` | Positional: only process the named tables. |

**Output**

`assets/schemas/<TABLENAME>.yaml` for every table in the index.

---

## Step 3 — Build derived assets

Reads the schema files produced in step 2 and derives three supplemental
assets, then annotates `TABLE_INDEX.yaml` with computed fields.

```bash
python scripts/build_derived_assets.py
```

No options. Always processes all schema files.

**Outputs**

| File | Description |
|---|---|
| `assets/OBJ_TYPE_MAP.yaml` | Maps each numeric `ObjType` code to the document family (header table, description, all member tables). |
| `assets/REVERSE_REFS.yaml` | Inbound FK index: for every referenced table, lists which `(table, field)` pairs point at it. |
| `assets/TABLE_INDEX.yaml` | Same file updated in-place; adds `parent`, `obj_type`, and `related_to` to every entry that has them. |

---

## Full rebuild from scratch

```bash
python scripts/build_table_index.py --no-cache
python scripts/build_table_schemas.py --workers 4 --delay 0.3
python scripts/build_derived_assets.py
```

## Partial refresh (schemas only, keep existing index)

If only the schema YAML files need updating (e.g. SAP updated a table's
fields), skip step 1 and run steps 2–3:

```bash
python scripts/build_table_schemas.py --resume   # or specific table names
python scripts/build_derived_assets.py
```

---

## Prerequisites

- Python ≥ 3.11
- `pyyaml` (`pip install pyyaml`)
- Internet access to `help.sap.com` (for steps 1 and 2)

The HTML disk cache (`assets/.html_cache/`) is populated automatically and
reduces network traffic on repeated runs. Delete it to force a full re-fetch.
