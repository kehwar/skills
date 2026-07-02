# SAP Schema Expert — Reference

## Table naming conventions

| `tabletype` | Name pattern | Examples |
|---|---|---|
| `header` | `O`-prefix (any) | `OINV`, `ORDR`, `OCRD`, `OITM`, `OAT1` |
| `lines` | Letters + trailing digits, no `O` prefix | `INV1`, `RDR1`, `PCH1`, `CRD1` |
| `history` | `A`-prefix | `ADOC`, `AIT1`, `ACRD` (archive/audit copies) |
| `udt` | `@`-prefix | `@ODOC_SALES`, `@DOC1_SALES` |
| `standalone` | Everything else | `CINF`, `CTNS`, `JDT1` |

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
| `TreeType` | `OITM` | `N`=No BOM, `S`=Sales BOM, `A`=Assembly |

## ObjType / TransType codes

`ObjType` appears on most document tables (header + all child rows share the same code). The same numeric codes are used in `OIVL.TransType`, `OITL.DocType`, and generic `ObjType` fields.

**Complete map:** `assets/OBJ_TYPE_MAP.yaml` — keys are the numeric codes as strings.

```yaml
# assets/OBJ_TYPE_MAP.yaml structure
'17':
  header: ORDR
  description: Sales Order
  tables: [ORDR, RDR1, RDR2, ..., RDR28]
```

| Code | Header | Description |
|---|---|---|
| `2` | `OCRD` | Business Partner |
| `13` | `OINV` | A/R Invoice |
| `14` | `ORIN` | A/R Credit Memo |
| `15` | `ODLN` | Delivery |
| `16` | `ORDN` | Returns |
| `17` | `ORDR` | Sales Order |
| `18` | `OPCH` | A/P Invoice |
| `19` | `ORPC` | A/P Credit Memo |
| `20` | `OPDN` | Goods Receipt PO |
| `21` | `ORPD` | Goods Return |
| `22` | `OPOR` | Purchase Order |
| `23` | `OQUT` | Sales Quotation |
| `46` | `OJDT` | Journal Entry |
| `57` | `OCHO` | Checks for Payment |
| `59` | `OIGN` | Goods Receipt |
| `60` | `OIGE` | Goods Issue |
| `67` | `OWTR` | Inventory Transfer |

Also check `TABLE_INDEX.yaml` — every entry with an `obj_type` key shows the code for that specific table.

## Field definitions — local schema files

Every table's fields are pre-seeded in `assets/schemas/<TABLENAME>.yaml`.
Each file contains `fields` (with `field`, `type`, `size`, `description`, optional `related`, `default`, `constraints`) and `indexes`.

To look up fields for a table:
1. Read `assets/schemas/OINV.yaml` (replace `OINV` with the target table name).
2. If the file is **absent**, look up the URL in `assets/TABLE_INDEX.yaml` and use `fetch_webpage`.
3. Use the exact field names (case-sensitive) in HANA SQL.

## Finding related tables

### Outbound FKs (what does this table point at?)

Read the table's entry in `assets/TABLE_INDEX.yaml` — the `related_to` list contains all FK target tables.

```yaml
# assets/TABLE_INDEX.yaml excerpt
- tablename: OIVL
  related_to: [OACT, OILM, OITM, OUSR]
```

### Inbound FKs / reverse refs (what tables reference this table?)

Read `assets/REVERSE_REFS.yaml` and look up the target table name:

```yaml
# assets/REVERSE_REFS.yaml excerpt
OITM:
  referenced_by:
    - table: OIVL
      field: ItemCode
    - table: OITL
      field: ItemCode
    - table: OITW
      field: ItemCode
    ...  # 416 total
```

### Parent table (for lines/child tables)

Entries in `assets/TABLE_INDEX.yaml` carry a `parent` key when one can be inferred from naming conventions (e.g. `INV1 → OINV`, `ITL1 → OITL`). The key is omitted for header tables and tables with no detectable parent.

Each entry also carries `obj_type` when the table's `ObjType` field has a default value in the schema (686 of 2842 tables). Use `assets/OBJ_TYPE_MAP.yaml` to go the other direction: given an ObjType code, find the header table, description, and full list of related tables.

### Regenerating after schema updates

```bash
python scripts/build_derived_assets.py
```

No network access required — reads only the local `assets/schemas/*.yaml` files.

## Out of scope

This skill provides **schema reference only** — table names, column names, types, and encoded values.  
For executing queries against a live SAP HANA database, use the `erp-agent-api` skill or `hana-document-expert`.
