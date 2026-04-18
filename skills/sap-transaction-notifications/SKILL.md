---
name: sap-transaction-notifications
description: Expert guidance for the SAP Business One Transaction Notification mechanism — the stored-procedure hook SAP calls on every committed transaction. Use when writing or reviewing SBO_SP_TransactionNotification, adding object-type routing guards, understanding transaction types (A/U/D/C/L), looking up SAP internal object type codes, or registering the procedure in SAP Business One. For the Frappe/soldamundo implementation that consumes these events, use the sap-transaction-notification-expert skill instead.
---

# SAP Transaction Notifications

SAP Business One calls a single fixed stored procedure — `SBO_SP_TransactionNotification` — on every committed transaction. The procedure body is entirely custom; SAP only defines the signature.

## Procedure Signature

```sql
ALTER PROCEDURE SBO_SP_TransactionNotification
(
    IN  object_type              nvarchar(30),   -- SAP internal object type code (e.g. '4')
    IN  transaction_type         nchar(1),       -- A / U / D / C / L
    IN  num_of_cols_in_key       int,            -- number of primary-key columns
    IN  list_of_key_cols_tab_del nvarchar(255),  -- tab-delimited key column names
    IN  list_of_cols_val_tab_del nvarchar(255)   -- tab-delimited key column values
)
LANGUAGE SQLSCRIPT
AS
error         int;               -- 0 = success; non-zero blocks the transaction
error_message nvarchar(200);     -- shown to the SAP user on error
BEGIN
    error         := 0;
    error_message := N'Ok';

    -- routing guards go here

END;
```

**Always initialise** `error := 0` and `error_message := N'Ok'` at the top.

## Transaction Types

| Code | Meaning | When fired |
|------|---------|-----------|
| `A` | Add | New record committed |
| `U` | Update | Existing record updated |
| `D` | Delete | Record deleted |
| `C` | Cancel | Document cancelled |
| `L` | Close | Document closed |

## Routing Pattern

Dispatch to a dedicated sub-procedure for each object type / transaction type combination:

```sql
-- Items master data
IF :object_type = '4' AND (:transaction_type = 'A' OR :transaction_type = 'U') THEN
    CALL "TN_OBJ004_OITM" (:list_of_cols_val_tab_del, :transaction_type, :error, :error_message);
END IF;

-- Business partners
IF :object_type = '2' AND (:transaction_type = 'A' OR :transaction_type = 'U') THEN
    CALL "TN_OBJ002_OCRD" (:list_of_cols_val_tab_del, :transaction_type, :error, :error_message);
END IF;
```

**Sub-procedure call signature** (standard across all sub-procedures):

```sql
CALL "TN_OBJnnn_TTTT" (
    :list_of_cols_val_tab_del,  -- tab-delimited primary key values
    :transaction_type,           -- pass through for branching inside sub-procedure
    :error,                      -- INOUT — sub-procedure writes back
    :error_message               -- INOUT — sub-procedure writes back
);
```

**Disabled guards** — comment out the `CALL` (keep the `IF`/`END IF`) to temporarily disable a handler without losing the guard:

```sql
IF :object_type = '4' AND (:transaction_type = 'A' OR :transaction_type = 'U') THEN
    -- CALL "TN_OBJ004_OITM" (...);   -- disabled 2025-10-14
END IF;
```

## Primary Key Parameters

SAP passes the primary key of the affected record as three coordinated parameters:

| Parameter | Type | Content |
|-----------|------|---------|
| `num_of_cols_in_key` | `int` | Number of key columns (1 for simple keys, 2+ for composite) |
| `list_of_key_cols_tab_del` | `nvarchar(255)` | Tab-delimited column **names** (e.g. `ItemCode` or `DocEntry\tLineNum`) |
| `list_of_cols_val_tab_del` | `nvarchar(255)` | Tab-delimited column **values** (e.g. `A-001` or `12345\t1`) |

### Simple key (one column)

```
num_of_cols_in_key       → 1
list_of_key_cols_tab_del → "ItemCode"
list_of_cols_val_tab_del → "A-001"
```

Parse inside a sub-procedure:

```sql
-- single value — use directly
DECLARE item_code nvarchar(50);
item_code := :list_of_cols_val_tab_del;
```

### Composite key (multiple columns)

```
num_of_cols_in_key       → 2
list_of_key_cols_tab_del → "DocEntry\tLineNum"
list_of_cols_val_tab_del → "12345\t1"
```

Parse with `LOCATE` / `SUBSTRING` in HANA SQL:

```sql
DECLARE tab_pos int;
DECLARE doc_entry nvarchar(50);
DECLARE line_num  nvarchar(50);

tab_pos   := LOCATE(:list_of_cols_val_tab_del, CHAR(9));  -- CHAR(9) = tab
doc_entry := SUBSTRING(:list_of_cols_val_tab_del, 1, tab_pos - 1);
line_num  := SUBSTRING(:list_of_cols_val_tab_del, tab_pos + 1);
```

> **Only `list_of_cols_val_tab_del` is passed to sub-procedures** — the column names and count are available in the main procedure body if needed but are typically not forwarded.

## Common Object Type Codes

| Code | Table | Description |
|------|-------|-------------|
| `1`  | OACT  | Chart of Accounts |
| `2`  | OCRD  | Business Partners |
| `4`  | OITM  | Items |
| `8`  | OITG  | Item Properties |
| `10` | OCRG  | Business Partner Groups |
| `11` | OCPR  | Contact Persons |
| `12` | OUSR  | Users |
| `13` | OINV  | A/R Invoices |
| `14` | ORIN  | A/R Credit Notes |
| `15` | ODLN  | Deliveries |
| `17` | ORDR  | Sales Orders |
| `18` | OPCH  | A/P Invoices |
| `20` | OPDN  | Goods Receipts PO |
| `23` | OQUT  | Quotations |
| `52` | OSLP  | Sales Persons |
| `64` | OWHS  | Warehouses |

## Sub-procedure Naming Convention

```
TN_OBJnnn_TTTT
```

| Segment | Meaning | Example |
|---------|---------|---------|
| `TN`    | Transaction Notification | fixed |
| `OBJ`   | object prefix | fixed |
| `nnn`   | zero-padded object type code | `004` |
| `TTTT`  | SAP table name | `OITM` |

Examples: `TN_OBJ004_OITM`, `TN_OBJ017_ORDR`, `TN_OBJ002_OCRD`

Prefix with a project-specific token to avoid naming collisions (e.g. `MYAPP_TN_OBJ004_OITM`).

## Error Contract

- Return `error = 0` for success. SAP commits the transaction.
- Return `error ≠ 0` to **block** the transaction. SAP shows `error_message` to the user and rolls back.
- Only block when the error is truly fatal — blocking is visible to SAP users.

## Registration in SAP

1. Open SAP Business One → **Administration → System Initialization → Transaction Notification**.
2. The procedure `SBO_SP_TransactionNotification` is pre-registered by SAP. You edit it directly — do not create a new one.
3. After saving changes in HANA Studio / SQL Console, the new version takes effect immediately (no SAP restart needed).

## See Also

For the Frappe-side implementation that polls and processes transaction events, see the `sap-transaction-notification-expert` skill in the soldamundo repository.

For the full annotated procedure skeleton and disabled-block patterns, see [references/stored-procedure.md](references/stored-procedure.md).
