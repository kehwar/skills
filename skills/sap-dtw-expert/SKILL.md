---
name: sap-dtw-expert
description: Expert guidance for producing correct DTW (Data Transfer Workbench) import files for SAP Business One. Use when recommending templates for bulk import operations, generating TSV files from the bundled templates, understanding multi-table object requirements, identifying mandatory vs optional columns, adding custom fields, or choosing between DTW and Service Layer for a given task.
---

# SAP DTW Expert

## Quick start

1. Search `assets/TEMPLATE_INDEX.yaml` by `table_code` or `object_name` keyword to find the right template(s).
2. Read the target `.tsv` file from `assets/templates/<path>` — row 1 is UI labels, row 2 is DB field names.
3. Fill data from row 3 onward; every column in row 2 is available, only a subset is mandatory.

---

## Template lookup procedure

```python
import yaml, pathlib

index = yaml.safe_load(
    pathlib.Path("assets/TEMPLATE_INDEX.yaml").read_text()
)

# Find by table code
matches = [e for e in index if e["table_code"] == "OCRD"]

# Find by keyword in object name
matches = [e for e in index if "BusinessPartner" in e["object_name"]]

# Find all templates in a module
matches = [e for e in index if e["module"] == "Business Partners"]
```

Each entry has keys: `table_code`, `object_name`, `module`, `category`, `path`.
Load the actual template with:

```python
template_path = pathlib.Path("assets/templates") / entry["path"]
rows = template_path.read_text(encoding="utf-8").splitlines()
ui_labels  = rows[0].split("\t")   # row 1 — human-readable column headers
db_columns = rows[1].split("\t")   # row 2 — SAP DB column names (use these in output)
```

---

## TSV row format

| Row | Content |
|---|---|
| 1 | **UI labels** — human-readable names shown in DTW wizard (e.g. `Business Partner Code`) |
| 2 | **DB field names** — short SAP column codes used by DTW to map to the database (e.g. `CardCode`) |
| 3+ | **Data rows** — one record per line, columns separated by tabs |

**Always use the DB field names from row 2**, not the UI labels, when referencing columns.

### Minimal TSV example (Business Partners)

```tsv
Business Partner Code	BP Name	BP Type	Group Code
CardCode	CardName	CardType	GroupCode
C001	Acme Corp	cCustomer	100
C002	Beta Ltd	cCustomer	100
```

### Generating TSV output

```python
import csv, io

def make_tsv(template_path: str, records: list[dict]) -> str:
    """Generate import-ready TSV from a template file and data records."""
    rows = open(template_path, encoding="utf-8").read().splitlines()
    ui_labels  = rows[0].split("\t")
    db_columns = rows[1].split("\t")

    buf = io.StringIO()
    w = csv.writer(buf, delimiter="\t", lineterminator="\n")
    w.writerow(ui_labels)
    w.writerow(db_columns)
    for rec in records:
        w.writerow([rec.get(col, "") for col in db_columns])
    return buf.getvalue()
```

---

## Multi-table objects

Many SAP objects span multiple tables. You must produce **one TSV per table**, loaded in order (header table first, then child tables). DTW links child rows to the parent via `ParentKey`.

### Common multi-table objects

| Object | Required tables | Notes |
|---|---|---|
| **Business Partner** | `OCRD` → `CRD1` | `CRD1` (addresses) uses `ParentKey` = `CardCode` |
| **Business Partner (Peru/LATAM)** | `OCRD` → `CRD1` → `CRD7` | `CRD7` (fiscal tax IDs) required when `FederalTaxID` is set |
| **Item Master Data** | `OITM` | Single-table; prices in `ITM1` if needed |
| **Sales Order** | `ORDR` → `RDR1` | `RDR1` lines use `ParentKey` = `DocNum` |
| **AR Invoice** | `OINV` → `INV1` | Optional: `INV2` (freight), `INV5` (WHT), `INV6` (installments) |
| **Delivery** | `ODLN` → `DLN1` | |
| **Purchase Order** | `OPOR` → `POR1` | |
| **AP Invoice** | `OPCH` → `PCH1` | |
| **Goods Receipt PO** | `OPDN` → `PDN1` | |
| **Goods Issue** | `OIGE` → `IGE1` | Optional: `BTNT` (batches), `SRNT` (serials) |
| **Goods Receipt** | `OIGN` → `IGN1` | Optional: `BTNT`, `SRNT` |
| **Incoming Payment** | `ORCT` → `RCT2` | `RCT2` links invoices; `RCT1` checks |
| **Outgoing Payment** | `OVPM` → `VPM2` | `VPM2` links invoices |
| **Journal Entry** | `OJDT` → `JDT1` | |
| **Chart of Accounts** | `OACT` | Single-table |

### ParentKey rule

- For **document child tables** (e.g. `RDR1`): `ParentKey` = the **DocNum** of the parent header row.
- For **master data child tables** (e.g. `CRD1`): `ParentKey` = the **primary key** of the parent (e.g. `CardCode`).
- `LineNum` is 0-based and must be unique within each parent.

---

## Mandatory vs optional columns

DTW templates contain **all** available columns. Only a subset is required by SAP. The rest can be left blank.

### Identification rules

1. **Primary key columns** are always mandatory (e.g. `CardCode` for OCRD, `ItemCode` for OITM, `DocNum` is auto-assigned so omit it).
2. **ParentKey** and **LineNum** are mandatory in all child tables.
3. Consult `assets/schemas/<TABLE>.yaml` (from `sap-schema-expert`) — fields with no `default` and no `nullable: true` are typically required.
4. As a rule of thumb, the first 3–5 DB columns in row 2 are the most critical.

### Business Partner mandatory minimum (`OCRD`)

| DB Column | Description |
|---|---|
| `CardCode` | Unique BP code (max 15 chars) |
| `CardName` | BP display name |
| `CardType` | `cCustomer` / `cSupplier` / `cLead` |
| `GroupCode` | BP group ID (integer) |

### Item Master Data mandatory minimum (`OITM`)

| DB Column | Description |
|---|---|
| `ItemCode` | Unique item code (max 20 chars) |
| `ItemName` | Item description |
| `ItemsGroupCode` | Item group ID (integer) |

### Document line mandatory minimum (e.g. `RDR1`, `INV1`)

| DB Column | Description |
|---|---|
| `ParentKey` | Parent document `DocNum` |
| `LineNum` | 0-based line number |
| `ItemCode` | Item code |
| `Quantity` | Quantity |

---

## Custom field (U_xxx) addition procedure

DTW templates do not include user-defined fields by default. To include them:

1. Add the column header at the **end** of both row 1 (any label) and row 2 (exact DB name, e.g. `U_SKU`).
2. In data rows, supply the value in the matching position.

```tsv
Business Partner Code	BP Name	BP Type	SKU
CardCode	CardName	CardType	U_SKU
C001	Acme Corp	cCustomer	SKU-001
```

> Custom fields (`U_` prefix) are defined via SAP's User-Defined Fields manager. DTW will reject unrecognised field names with a mapping error.

---

## DTW vs Service Layer decision matrix

| Scenario | Use DTW | Use Service Layer |
|---|---|---|
| **Volume** | Hundreds to millions of records | Tens to low hundreds of records |
| **Trigger** | Scheduled batch / one-time migration | Real-time / event-driven |
| **Access** | Direct DB / Windows client available | REST API access only |
| **Document type** | Master data, open transactions, historical data | Any document type |
| **Error handling** | Rollback per-row with log file | Raise per-call in Python |
| **Custom fields** | Append column to TSV | Include key in JSON payload |
| **Complex logic** | Limited — use stored templates | Full Python control flow |
| **Auth requirement** | SAP B1 client credentials (Windows) | Service Layer REST credentials |

**Rule of thumb**: use DTW for bulk migrations and initial data loads; use Service Layer for integrations and programmatic single-record operations.

---

## Common pitfalls

| Problem | Cause | Fix |
|---|---|---|
| `Unknown field name` | Column in row 2 doesn't exist in the table | Verify DB field name against `assets/schemas/<TABLE>.yaml` |
| `Parent record not found` | Child loaded before parent, or `ParentKey` wrong | Load header table first; check `ParentKey` matches parent PK exactly |
| `Duplicate primary key` | Record already exists | Use DTW "Update Existing Data" mode or filter out existing records |
| `Invalid value for field` | Encoded field uses wrong key | Check `constraints` in schema (e.g. `CardType` must be `cCustomer`, not `C`) |
| Tab characters in data | Value contains literal `\t` | Quote the field or replace tabs with spaces before export |
| BOM / encoding error | File saved as UTF-16 or with BOM | Save as UTF-8 **without BOM**; DTW expects ANSI or UTF-8 |
