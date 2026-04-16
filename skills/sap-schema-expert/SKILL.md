---
name: sap-schema-expert
description: SAP Business One 10.0 table schema reference for writing HANA SQL queries. Use when working with SAP B1 tables, looking up column names, understanding header/lines document structure, writing or reviewing HANA SQL that joins SAP B1 tables, or mapping a business concept to the correct SAP table name.
---

# SAP Schema Expert

## Quick start

1. Search `assets/TABLE_INDEX.yaml` for the table by name or description keyword.
2. Read `assets/schemas/<TABLENAME>.yaml` for full field definitions.
3. If the schema file is absent, look up the URL in `assets/TABLE_INDEX.yaml` and use `fetch_webpage`.

## Workflows

### Write a HANA SQL query

1. Find the header table in `assets/TABLE_INDEX.yaml` (e.g. `OINV` = A/R Invoice).
2. Lines table = strip leading `O` + append `1` → `OINV` → `INV1`.
3. Read field names from `assets/schemas/OINV.yaml` and `assets/schemas/INV1.yaml`.
4. Build query — **double-quote all identifiers** (HANA is case-sensitive):

```sql
SELECT h."DocEntry", h."CardCode", h."DocDate", h."DocTotal",
       l."LineNum", l."ItemCode", l."Dscription", l."Quantity", l."Price"
FROM "OINV" h
INNER JOIN "INV1" l ON l."DocEntry" = h."DocEntry"
WHERE h."DocStatus" = 'O' AND h."CANCELED" = 'N'
ORDER BY h."DocEntry", l."LineNum"
```

### Map a business concept to a table

1. Grep `assets/TABLE_INDEX.yaml` for a keyword (e.g. `delivery`, `invoice`, `partner`).
2. Cross-check the ObjType code via `assets/OBJ_TYPE_MAP.yaml` (common: `13`=OINV, `17`=ORDR, `15`=ODLN, `22`=OPOR).

## Key encoded values

| Column | Table | Values |
|---|---|---|
| `CardType` | `OCRD` | `C`=Customer, `S`=Supplier, `L`=Lead |
| `DocStatus` | Most doc tables | `O`=Open, `C`=Closed |
| `Canceled` | Most doc tables | `Y`=Yes, `N`=No |
| `TreeType` | `OITM` | `N`=No BOM, `S`=Sales BOM, `A`=Assembly |

## Advanced features

See [REFERENCE.md](REFERENCE.md) for:
- Full table naming conventions and all header/lines pairs
- Complete ObjType code table (17 common codes)
- Finding related tables via `REVERSE_REFS.yaml` and `TABLE_INDEX.yaml`
- Regenerating derived asset files after schema updates

