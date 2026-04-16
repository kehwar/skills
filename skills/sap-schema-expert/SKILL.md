---
name: sap-schema-expert
description: SAP Business One 10.0 table schema reference for writing HANA SQL queries. Use when working with SAP B1 tables, looking up column names, understanding header/lines document structure, writing or reviewing HANA SQL that joins SAP B1 tables, or mapping a business concept to the correct SAP table name.
---

# SAP Schema Expert

## Quick start

1. Search [TABLE_INDEX.md](TABLE_INDEX.md) for the table by name or description keyword.
2. For full field definitions, read the pre-seeded file at `assets/schemas/<TABLENAME>.md` (see below).
3. Use the SQL template to build queries with correct column names.

## Table naming conventions

| Pattern | ObjectType | Examples |
|---|---|---|
| `O` + 2–4 uppercase letters | `header` | `OINV`, `ORDR`, `OCRD`, `OITM` |
| Letters + digit(s), no `O` prefix | `lines` | `INV1`, `RDR1`, `PCH1`, `CRD1` |
| `@` prefix | `udt` | `@ODOC_SALES`, `@DOC1_SALES` |
| `A` prefix | `history` | `ADOC`, `AIT1`, `ACRD` (archive copies) |
| Other | `standalone` | `CINF`, `CTNS`, `JDT1` |

**Header ↔ Lines rule**: every document header `OXXX` has a primary lines table `XXX1`.

| Header | Lines | Description |
|---|---|---|
| `OINV` | `INV1` | A/R Invoice |
| `ORDR` | `RDR1` | Sales Order |
| `OPCH` | `PCH1` | A/P Invoice |
| `ODLN` | `DLN1` | Delivery |
| `OPOR` | `POR1` | Purchase Order |
| `OCRD` | `CRD1` | Business Partner addresses |
| `OITM` | `ITM1` | Item prices |

Multi-child pattern: `OINV` → `INV1` (rows), `INV2` (freight rows), `INV5` (withholding tax), `INV6` (installments), etc.

## Common encoded values

| Column | Table | Values |
|---|---|---|
| `CardType` | `OCRD` | `C`=Customer, `S`=Supplier, `L`=Lead |
| `DocStatus` | `OINV`, `ORDR`, etc. | `O`=Open, `C`=Closed |
| `Canceled` | Most doc tables | `Y`=Yes, `N`=No |
| `InvntItem` / `SellItem` / `PrchseItem` | `OITM` | `Y`=Yes, `N`=No |
| `ObjType` | Any | `13`=A/R Invoice, `17`=Sales Order, `18`=A/P Invoice, `15`=Delivery |
| `TreeType` | `OITM` | `N`=No BOM, `S`=Sales BOM, `A`=Assembly |

## HANA SQL template

```sql
-- Header + Lines query (double-quote all identifiers — HANA is case-sensitive)
SELECT
    h."DocEntry",
    h."DocNum",
    h."CardCode",
    h."CardName",
    h."DocDate",
    h."DocTotal",
    l."LineNum",
    l."ItemCode",
    l."Dscription",
    l."Quantity",
    l."Price"
FROM "OINV" h
INNER JOIN "INV1" l ON l."DocEntry" = h."DocEntry"
WHERE h."DocStatus" = 'O'
  AND h."CANCELED" = 'N'
ORDER BY h."DocEntry", l."LineNum"
```

> **HANA rules**: identifiers are case-sensitive and must be **double-quoted**. Use the company schema implicitly (no schema prefix needed when connected to the company DB).

## Field definitions — local schema files

Every table's fields are pre-seeded (where available) in `assets/schemas/<TABLENAME>.md`.
Each file contains a table of `Field | Type | Size | Description`.

To look up fields for a table:
1. Check whether `assets/schemas/OINV.md` exists (replace `OINV` with your target table name).
2. If the file exists, read it directly — no network call needed.
3. If the file is **absent** (not yet seeded), look up the table's URL in `TABLE_INDEX.md` (the `URL` column), then use `fetch_webpage` to retrieve the field list from that URL.
4. Use the exact field names (case-sensitive) in HANA SQL.

## Out of scope

This skill provides **schema reference only** — table names, column names, types, and encoded values.  
For executing queries against a live SAP HANA database, use the `erp-agent-api` skill or `hana-document-expert`.
