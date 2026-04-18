# SBO_SP_TransactionNotification — Annotated Full Skeleton

This document shows how the procedure looks in a real project, with annotations explaining every structural pattern.

---

## Full Skeleton

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

    -- (1) Always initialise first
    error         := 0;
    error_message := N'Ok';

    -------------------------------------------------------

    -- (2) Enabled guard — CALL executes on every matching transaction
    IF :object_type = '4' AND (:transaction_type = 'A' OR :transaction_type = 'U') THEN
        CALL "MYAPP_TN_OBJ004_OITM" (:list_of_cols_val_tab_del, :transaction_type, :error, :error_message);
    END IF;

    -- (3) Disabled guard — IF/END IF kept; CALL commented out
    IF :object_type = '17' AND (:transaction_type = 'A' OR :transaction_type = 'U') THEN
        -- CALL "MYAPP_TN_OBJ017_ORDR" (...);  -- disabled 2025-10-14
    END IF;

    -- (4) Error-gated guard — only runs if previous handlers succeeded
    IF :object_type = '20' AND (:transaction_type = 'A' OR :transaction_type = 'U') AND :error = 0 THEN
        CALL "MYAPP_TN_OBJ020_OPDN" (:list_of_cols_val_tab_del, :transaction_type, :error, :error_message);
    END IF;

    -- (5) Multiple handlers for the same object type (different sub-systems)
    IF :object_type = '202' AND (:transaction_type = 'A' OR :transaction_type = 'U') THEN
        CALL "MYAPP_TN_OBJ202_OWOR_CORE" (:list_of_cols_val_tab_del, :transaction_type, :error, :error_message);
        CALL "MYAPP_TN_OBJ202_OWOR_SYNC" (:list_of_cols_val_tab_del, :transaction_type, :error, :error_message);
    END IF;

    -- (6) Fully commented-out block (alternative disable style — avoids dead IF)
    /*
    IF :object_type = '22' AND (:transaction_type = 'A' OR :transaction_type = 'U') AND :error = 0 THEN
        CALL "MYAPP_TN_OBJ022_OPOR" (:list_of_cols_val_tab_del, :transaction_type, :error, :error_message);
    END IF;
    */

    -------------------------------------------------------

    -- (7) Optional secondary dispatcher — forwards all parameters to another procedure
    IF :error = 0 THEN
        CALL "MYAPP_TN_DISPATCHER" (
            :object_type, :transaction_type,
            :num_of_cols_in_key, :list_of_key_cols_tab_del, :list_of_cols_val_tab_del,
            :error, :error_message
        );
    END IF;

    -- (8) Mandatory return statement
    SELECT :error, :error_message FROM dummy;

END;
```

---

## Pattern Notes

### (1) Initialisation

Always the first two lines. SAP reads the final values of `error` and `error_message` after the procedure completes. If you forget to initialise, the variables contain garbage values.

### (2) Enabled guard

The standard form. `IF` condition tests exact object type code (string, not integer) and transaction type(s). Multiple transaction types use `OR` — there is no `IN` for scalar variables in HANA SQLScript.

### (3) Disabled guard

**Preferred disable method.** Keep the `IF`/`END IF` shell so the guard is visible in code review and easy to re-enable. Add a date comment on the same line as the disabled `CALL`.

### (4) Error-gated guard

Add `:error = 0` to the condition when you want to skip the handler if an earlier handler already failed. Use this for non-critical or dependent handlers. Do **not** gate everything — missing a critical handler because an unrelated handler failed is a common bug.

### (5) Multiple handlers, same object type

Perfectly valid. Each `CALL` runs sequentially in the same `IF` block. Each sub-procedure writes back to the shared `error`/`error_message` INOUT variables — if the first `CALL` sets `error ≠ 0`, the second `CALL` still runs (unless you add an intermediate `:error = 0` check).

### (6) Block-comment disable

Alternative disable style: wrap the entire `IF` block in `/* ... */`. Use when you want the dead code to be invisible to code reviewers. The preferred style (pattern 3) is usually better for auditability.

### (7) Secondary dispatcher

A common pattern in larger projects: after all per-object guards, call a second procedure that receives **all five original parameters** (including `object_type` and the key column metadata). This lets the secondary procedure implement its own routing logic independently of the main procedure. The secondary dispatcher signature is:

```sql
CALL "MY_SECONDARY_DISPATCHER" (
    :object_type, :transaction_type,
    :num_of_cols_in_key, :list_of_key_cols_tab_del, :list_of_cols_val_tab_del,
    :error, :error_message
);
```

Gate it with `:error = 0` so a blocking error from a primary handler stops the chain.

### (8) Return statement

**Mandatory.** SAP reads the INOUT values through this `SELECT`. Without it the procedure compiles but SAP cannot retrieve the return values — all errors are silently swallowed.

```sql
SELECT :error, :error_message FROM dummy;
```

---

## Registration in SAP Business One

1. Open **SAP Business One → Administration → System Initialization → Transaction Notification**.
2. The procedure `SBO_SP_TransactionNotification` is pre-created by SAP in your company database. You do not create a new one.
3. Edit the procedure body in **SAP HANA Studio** or the **SQL Console** (DBA Cockpit), then execute the `ALTER PROCEDURE` statement.
4. The new version takes effect immediately — no SAP restart required.
5. Test by committing a transaction of the relevant object type and checking that the sub-procedure was called (add a trace table insert or verify side-effects).

---

## Enabling / Disabling a Guard Safely

```sql
-- To enable: remove the leading --
IF :object_type = '17' AND (:transaction_type = 'A' OR :transaction_type = 'U') THEN
    CALL "MYAPP_TN_OBJ017_ORDR" (:list_of_cols_val_tab_del, :transaction_type, :error, :error_message);
END IF;

-- To disable: comment the CALL, keep the IF/END IF, add a date note
IF :object_type = '17' AND (:transaction_type = 'A' OR :transaction_type = 'U') THEN
    -- CALL "MYAPP_TN_OBJ017_ORDR" (...);  -- disabled 2026-04-18
END IF;
```

Always `ALTER PROCEDURE` (not `CREATE OR REPLACE`) — the procedure already exists in the SAP database.

---

## Extended Object Type Code Table

Object codes not in the SKILL.md quick-reference:

| Code | Table | Description |
|------|-------|-------------|
| `3`  | ODSC  | Banks |
| `11` | OCPR  | Contact Persons |
| `12` | OUSR  | Users |
| `13` | OINV  | A/R Invoices |
| `14` | ORIN  | A/R Credit Notes |
| `15` | ODLN  | Deliveries |
| `16` | ORDN  | Sales Returns |
| `18` | OPCH  | A/P Invoices |
| `19` | ORPC  | A/P Credit Notes |
| `20` | OPDN  | Goods Receipt PO |
| `21` | ORPD  | Goods Return |
| `22` | OPOR  | Purchase Orders |
| `24` | ORCT  | Incoming Payments |
| `25` | ODPS  | Deposits |
| `30` | OJDT  | Journal Entries |
| `37` | OCRN  | Currencies |
| `38` | OIDX  | Indexes |
| `40` | OCTG  | Payment Terms |
| `43` | OMRC  | Manufacturers |
| `44` | OCQG  | BP Properties |
| `46` | OVPM  | Outgoing Payments |
| `48` | OALC  | Landed Cost Definitions |
| `52` | OITB  | Item Groups |
| `53` | OSLP  | Sales Persons |
| `57` | OCHO  | Checks for Payment |
| `59` | OIGN  | Goods Receipt / Production Receipt |
| `60` | OIGE  | Goods Issue / Production Issue |
| `63` | OPRJ  | Projects |
| `66` | OITT  | Bills of Material |
| `67` | OWTR  | Stock Transfer |
| `69` | OIPF  | Landed Costs |
| `80` | OALT  | Alerts |
| `95` | OFRT  | Financial Report Templates |
| `97` | OOPR  | Sales Opportunities |
| `112` | ODRF | Draft Documents |
| `120` | OWST | Approval Stages |
| `121` | OWTM | Approval Templates |
| `125` | OEXD | Additional Expenses |
| `126` | OSTA | Tax Classes |
| `128` | OSTC | Tax Codes |
| `162` | OMRV | Inventory Revaluation |
| `178` | OWHT | Withholding Tax |
| `202` | OWOR | Production Orders |
| `212` | OORL | BP Relationships |
| `231` | DSC1 | Bank Accounts |
| `540000006` | OPQT | Purchase Quotations |
