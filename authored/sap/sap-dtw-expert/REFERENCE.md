# SAP DTW Expert — Reference

## TSV row format

| Row | Content |
|---|---|
| 1 | **DI API field names** — names DTW uses to map columns to the database (e.g. `CardCode`, `ForeignName`, `ItemsGroupCode`) |
| 2 | **Labels** — display names shown in the DTW wizard; defaults to the DB column name but freely renameable; **ignored by the tool** |
| 3+ | **Data rows** — one record per line, columns separated by tabs |

**Always use the DI API field names from row 1** when referencing or populating columns.

### Minimal TSV example (Business Partners)

```tsv
CardCode	CardName	CardType	GroupCode
CardCode	CardName	BP Type	Group Code
C001	Acme Corp	cCustomer	100
C002	Beta Ltd	cCustomer	100
```

### TSV generation helper

```python
import csv, io

def make_tsv(template_path: str, records: list[dict]) -> str:
    """Generate import-ready TSV from a template file and data records."""
    rows = open(template_path, encoding="utf-8").read().splitlines()
    di_fieldnames = rows[0].split("\t")   # row 1 — DI API field names (used by DTW)
    labels        = rows[1].split("\t")   # row 2 — labels (ignored by DTW)

    buf = io.StringIO()
    w = csv.writer(buf, delimiter="\t", lineterminator="\n")
    w.writerow(di_fieldnames)
    w.writerow(labels)
    for rec in records:
        w.writerow([rec.get(col, "") for col in di_fieldnames])
    return buf.getvalue()
```

---

## Multi-table objects

Many SAP objects span multiple tables. Produce **one TSV per table**, loaded in order (header table first, then child tables). DTW links child rows to the parent via `ParentKey`.

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

- **Document child tables** (e.g. `RDR1`): `ParentKey` = the **DocNum** of the parent header row.
- **Master data child tables** (e.g. `CRD1`): `ParentKey` = the **primary key** of the parent (e.g. `CardCode`).
- `LineNum` is 0-based and must be unique within each parent.

---

## Mandatory column minimums

DTW templates contain **all** available columns. Only a subset is required by SAP.

### Identification rules

1. **Primary key columns** are always mandatory (`CardCode` for OCRD, `ItemCode` for OITM). `DocNum` is auto-assigned — omit it.
2. **ParentKey** and **LineNum** are mandatory in all child tables.
3. Fields with no `default` and no `nullable: true` in `assets/schemas/<TABLE>.yaml` are typically required.

### Business Partner (`OCRD`)

| DI API Field Name | Description |
|---|---|
| `CardCode` | Unique BP code (max 15 chars) |
| `CardName` | BP display name |
| `CardType` | `cCustomer` / `cSupplier` / `cLead` |
| `GroupCode` | BP group ID (integer) |

### Item Master Data (`OITM`)

| DI API Field Name | Description |
|---|---|
| `ItemCode` | Unique item code (max 20 chars) |
| `ItemName` | Item description |
| `ItemsGroupCode` | Item group ID (integer) |

### Document lines (e.g. `RDR1`, `INV1`)

| DI API Field Name | Description |
|---|---|
| `ParentKey` | Parent document `DocNum` |
| `LineNum` | 0-based line number |
| `ItemCode` | Item code |
| `Quantity` | Quantity |

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

**Rule of thumb**: use DTW for bulk migrations and initial data loads; use Service Layer for integrations and programmatic single-record operations.

---

## Common pitfalls

| Problem | Cause | Fix |
|---|---|---|
| `Unknown field name` | Column in row 1 doesn't match any known DI API field | Verify against `assets/schemas/<TABLE>.yaml` or the DI API docs |
| `Parent record not found` | Child loaded before parent, or `ParentKey` wrong | Load header table first; check `ParentKey` matches parent PK exactly |
| `Duplicate primary key` | Record already exists | Use DTW "Update Existing Data" mode or filter out existing records |
| `Invalid value for field` | Encoded field uses wrong key | Check `constraints` in schema (e.g. `CardType` must be `cCustomer`, not `C`) |
| Tab characters in data | Value contains literal `\t` | Quote the field or replace tabs with spaces before export |
| BOM / encoding error | File saved as UTF-16 or with BOM | Save as UTF-8 **without BOM**; DTW expects ANSI or UTF-8 |

---

## COM property names vs DB column names

DTW uses the DI API (SAPbobsCOM) under the hood and therefore uses **DI API COM property names** — not raw HANA database column names.

The Service Layer is independent and does **not** use the DI API under the hood. It shares property names with the DI API for most fields by convention, but there are exceptions — always verify Service Layer field names against the Service Layer OpenAPI spec rather than assuming parity with DI API names.

| DI API COM property name (used by DTW) | DB column (HANA SQL) |
|---|---|
| `FederalTaxID` | `OCRD.LicTradNum` |
| `Mother` | `OCRD.FatherCard` |
| `DiscountPercent` | `OINV.TradeDisc` |
| `InventoryUOM` | `OITM.InvntryUom` |

Always verify unfamiliar DTW (row 1) field names against `sap-di-api-expert` class docs. For Service Layer field names, use the `sap-service-layer-expert` OpenAPI spec — do not assume they match DI API names exactly. Use `sap-schema-expert` only when you need the raw DB column name for HANA SQL.

---

## Related skills

| Skill | When to use |
|---|---|
| `sap-schema-expert` | Look up DB column names, table structure, and encoded values |
| `sap-service-layer-expert` | Real-time / event-driven writes via REST API |
| `sap-di-api-expert` | COM-based automation and read/write via DI API |
