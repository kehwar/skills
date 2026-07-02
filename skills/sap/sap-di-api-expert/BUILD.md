# Build Guide — SAP DI API Reference Index

This document explains how `assets/DI_API_INDEX.yaml` and `assets/docs/` were
created and how to regenerate them.

---

## Source

The reference was scraped from the SAP Help Portal:

```
https://help.sap.com/doc/089315d8d0f8475a9fc84fb919b501a3/10.0/en-US/SDKHelp/SAPbobsCOM_P.html
```

That page is the master `SAPbobsCOM` namespace index listing all **Services**,
**Classes**, and **Enumerations** in the SAP B1 DI API 10.0 (build 10.00.320).
Each entry links to an individual detail page on the same domain.

The Change Log (`Hirarchy_report.html`) is intentionally excluded — it adds no
reference value for code generation.

---

## Output layout

```
assets/
├── DI_API_INDEX.yaml          # flat list of all entries (name, kind, description, doc_path)
└── docs/
    ├── service/               # one .yaml per Service  (e.g. AccountsService.yaml)
    ├── class/                 # one .yaml per Class    (e.g. Documents.yaml)
    └── enum/                  # one .yaml per Enum     (e.g. BoObjectTypes.yaml)
```

`DI_API_INDEX.yaml` keys:

| Key | Description |
|---|---|
| `name` | Object name (e.g. `Documents`, `AccountsService`) |
| `kind` | `service`, `class`, or `enum` |
| `description` | Short description from the index table |
| `doc_path` | Relative path from `assets/docs/` to the `.yaml` file |
| `url` | Absolute URL of the detail page |
| `related_tables` | SAP HANA table names referenced from the description (optional) |

Each detail `.yaml` file includes: `name`, `title`, `kind`, `url`, `description`
(optional), `remarks` (optional), `methods` / `properties` / `values` (optional
lists of `{name, description, url, field_name?, length?}`).

---

## Prerequisites

```bash
pip install requests beautifulsoup4 pyyaml
```

These packages are already present in the frappe-bench virtualenv.

---

## Regenerating the index and docs

The build is split into two separate scripts:

- **`build_index.py`** — parses the index page and writes `DI_API_INDEX.yaml`
- **`build_docs.py`** — reads `DI_API_INDEX.yaml` and fetches individual detail pages

### Step 1 — Build the index YAML

```bash
cd /path/to/skills/skills/sap-di-api-expert

# Fetch live from SAP Help Portal:
python scripts/build_index.py

# Or use a previously saved local copy:
python scripts/build_index.py --input /tmp/di_api_index.html

# Save the fetched HTML for later offline use:
python scripts/build_index.py --save-html /tmp/di_api_index.html

# Rebuild YAML from already-cached docs (no network needed):
python scripts/build_index.py --from-cache
```

### Step 2 — Fetch detail pages

```bash
# Fetch all pages (reads DI_API_INDEX.yaml; skips already-cached):
python scripts/build_docs.py

# Quick test — fetch only 20 pages:
python scripts/build_docs.py --limit 20

# Only fetch a specific kind:
python scripts/build_docs.py --kind class

# Re-fetch everything (clears existing cache):
python scripts/build_docs.py --force
```

Typical full run time: 10–30 minutes (network-bound; ~2 200 pages).

---

## How the scraper works

1. **Index parse** (`build_index.py`) — `parse_index()` walks the HTML for `<h3>`
   section headings (`SERVICE`, `CLASS`, `ENUMERATIONS`) followed by `<table>`
   elements.  Each `<tr>` yields a `(name, kind, description, href)` entry.
   Duplicates are de-duplicated by `(name, kind)`.

2. **Detail page fetch** (`build_docs.py`) — `fetch_and_cache_page()` resolves
   the `href` to a full URL, fetches with a polite 0.5 s delay, and saves the
   result as a structured YAML file.

3. **HTML → YAML** — `html_to_data()` uses BeautifulSoup to extract the
   Description and Remarks sections as single-line strings.  `parse_members_page()`
   follows the `_members.html` link (when present) and extracts the members table
   into typed `methods`, `properties`, or `values` lists.  Each member entry
   includes `name`, `description`, `url`, and optionally `field_name` (SAP DB
   field name when it differs from the property name) and `length` (character
   limit).

4. **Shared logic** — `scripts/common.py` contains all parsing/writing logic
   shared by both CLI scripts.

---

## Notes

- SSL verification is disabled (`verify=False`) because SAP Help Portal
  occasionally presents intermediate certificate issues.  The `urllib3`
  warning is suppressed in the script.
- Entries with no `href` in the index (e.g. abstract collection classes)
  get a stub `.yaml` generated from their index description.
- Fetch failures also produce a stub `.yaml` so the same entry is not retried
  on subsequent runs unless the stub file is deleted (or `--force` is used).
