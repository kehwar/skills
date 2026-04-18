---
name: sap-transaction-notifications
description: Expert guidance for the SAP Business One Transaction Notification mechanism — the stored-procedure hook SAP calls on every committed transaction. Use when writing or reviewing SBO_SP_TransactionNotification, adding object-type routing guards, understanding transaction types (A/U/D/C/L), looking up SAP internal object type codes, or registering the procedure in SAP Business One. For the Frappe-side implementation that consumes these events, use the sap-transaction-notification-expert skill instead.
---

# SAP Transaction Notifications

SAP Business One calls `SBO_SP_TransactionNotification` on every committed transaction. You edit the body; SAP defines only the signature.

## Quick Start

Add a guard inside the `BEGIN … END` block. Always use `ALTER PROCEDURE` (never `CREATE`) — the procedure already exists in the company database:

```sql
IF :object_type = '4' AND (:transaction_type = 'A' OR :transaction_type = 'U') THEN
    CALL "MYAPP_TN_OBJ004_OITM" (:list_of_cols_val_tab_del, :transaction_type, :error, :error_message);
END IF;
```

## Procedure Signature

```sql
ALTER PROCEDURE SBO_SP_TransactionNotification
(
    IN  object_type              nvarchar(30),
    IN  transaction_type         nchar(1),
    IN  num_of_cols_in_key       int,
    IN  list_of_key_cols_tab_del nvarchar(255),
    IN  list_of_cols_val_tab_del nvarchar(255)
)
LANGUAGE SQLSCRIPT
AS
error         int;
error_message nvarchar(200);
BEGIN
    error         := 0;
    error_message := N'Ok';

    -- routing guards go here

    SELECT :error, :error_message FROM dummy;  -- mandatory return
END;
```

**Always** initialise `error := 0` / `error_message := N'Ok'` as the first two statements.
**Always** end with `SELECT :error, :error_message FROM dummy;` — SAP reads return values through this `SELECT`. Omitting it silently swallows all errors.

## Transaction Types

| Code | Meaning |
|------|---------|
| `A` | Add — new record committed |
| `U` | Update — record updated |
| `D` | Delete — record deleted |
| `C` | Cancel — document cancelled |
| `L` | Close — document closed |

## Sub-procedure Naming

Pattern: `[PROJECT]_TN_OBJ[nnn]_[TABLE]` — prefix with a project token to avoid collisions.

| Segment | Meaning | Example |
|---------|---------|---------|
| `nnn`   | zero-padded object type code | `004`, `017` |
| `TABLE` | SAP table name | `OITM`, `ORDR` |

Examples: `MYAPP_TN_OBJ004_OITM`, `MYAPP_TN_OBJ017_ORDR`

Object type codes: see [references/stored-procedure.md](references/stored-procedure.md).

## Error Contract

Return `error = 0` for success (SAP commits). Return `error ≠ 0` to **block** the transaction — SAP rolls back and shows `error_message` to the user. Only block for truly fatal errors.

## See Also

- Full annotated skeleton, routing patterns, primary key parsing → [references/stored-procedure.md](references/stored-procedure.md)
