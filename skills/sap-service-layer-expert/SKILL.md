---
name: sap-service-layer-expert
description: Expert guidance for writing correct, runnable Python scripts that interact with SAP Business One Service Layer REST API. Use when creating, reading, updating, or deleting SAP B1 data via the Service Layer, producing two-file output contracts (_data.json + _run.py), writing OData query strings, understanding PATCH vs PUT semantics, or looking up endpoint schemas from the bundled OpenAPI spec.
---

# SAP Service Layer Expert

## Quick start

1. Read [SESSION.md](SESSION.md) for the complete `ServiceLayer` context-manager class — copy it into any new script.
2. Copy `assets/script_template.py` as the starting point for every new script.
3. Look up the endpoint schema in `assets/spec/paths/{ResourceName}.yaml` when you need field names or request shapes.

---

## Base URL

```
{scheme}://{host}:{port}/b1s/v2
```

`SAP_SL_HOST` is the full origin including port, e.g. `https://192.168.1.100:50000`. It may optionally include a path suffix — the template always extracts only the scheme+host+port and appends `/b1s/v2`.

---

## Authentication

SAP Service Layer uses **cookie-based sessions** (no API key / Bearer token).

| Step | Request |
|---|---|
| Login | `POST /b1s/v2/Login` with `{"UserName":"…","Password":"…","CompanyDB":"…"}` |
| Work | Any API call — session cookie `B1SESSION` sent automatically by `requests.Session` |
| Logout | `POST /b1s/v2/Logout` |

Sessions expire after 30 min of inactivity. Always log out in a `finally` block (the `ServiceLayer.__exit__` method does this). See [SESSION.md](SESSION.md) for the full context-manager implementation.

---

## OData query parameters

Append as URL query strings:

| Parameter | Purpose | Example |
|---|---|---|
| `$filter` | Filter records | `$filter=CardType eq 'C' and Balance gt 0` |
| `$select` | Return only named fields | `$select=CardCode,CardName,Phone1` |
| `$top` | Limit result count | `$top=20` |
| `$skip` | Skip N records (pagination) | `$skip=40` |
| `$orderby` | Sort | `$orderby=CardCode asc` |

```python
result = sl.get(
    "BusinessPartners",
    **{
        "$filter": "CardType eq 'C'",
        "$select": "CardCode,CardName,Phone1",
        "$top": "50",
        "$orderby": "CardCode asc",
    },
)
records = result["value"]  # list of dicts
```

---

## HTTP method semantics

| Method | When to use |
|---|---|
| `GET /Resource` | List collection (with `$filter`, `$select`, etc.) |
| `GET /Resource(key)` | Fetch single record |
| `POST /Resource` | Create a new record |
| `PATCH /Resource(key)` | **Partial update** — only supplied fields are changed |
| `PUT /Resource(key)` | **Full replace** — omitted fields are reset to defaults; rarely needed |
| `DELETE /Resource(key)` | Delete a record |

> **Always prefer PATCH over PUT** for updates. PUT will overwrite every field with defaults for anything not included in the payload.

### Key formats

String keys: `BusinessPartners('C001')`  
Integer keys: `Orders(12345)`  
Composite keys: `SpecialPrices(CardCode='C001',ItemCode='ITEM01',PriceListNo=1)`

---

## Error extraction

SAP error responses follow this shape:

```json
{
  "error": {
    "code": -2028,
    "message": { "lang": "en-us", "value": "Business partner not found [OCRD.CardCode]" }
  }
}
```

The `ServiceLayer._raise()` method in the template extracts `error.message.value` automatically and raises `RuntimeError` with a descriptive message.

---

## Two-file output contract

Every agent-produced mutation script ships **exactly two files**, placed under `.temp/` in the root of the main repository for the current workspace:

| File | Contents |
|---|---|
| `.temp/<operation>_data.json` | Pure data — records to create/update/delete; no credentials or boilerplate |
| `.temp/<operation>_run.py` | `assets/script_template.py` with `main()` filled in |

The main repository root is derived from the workspace context (e.g. the app folder that owns the current task). Create `.temp/` if it does not exist.

**Naming convention**: use `snake_case` with the HTTP verb first:
`patch_business_partners`, `create_sales_order`, `delete_price_list_entries`

### Example data file (`.temp/patch_business_partners_data.json`)

```json
[
  {"CardCode": "C001", "Phone1": "555-1001"},
  {"CardCode": "C002", "Phone1": "555-1002"},
  {"CardCode": "C003", "Phone1": "555-1003"}
]
```

### Example `main()` in the run file

```python
def main(data: list, sl: ServiceLayer) -> None:
    for record in data:
        card_code = record.pop("CardCode")
        sl.patch(f"BusinessPartners('{card_code}')", record)
        log.info("Patched %s", card_code)
```

---

## Endpoint schema lookup

When you need field names, required fields, or the request body shape for an endpoint:

1. The resource name is the path segment: e.g. `BusinessPartners` → file is `assets/spec/paths/BusinessPartners.yaml`
2. The `_id` variant covers single-record operations: `assets/spec/paths/BusinessPartners_id.yaml`
3. Action functions follow the pattern `{Resource}_{ActionName}`: `assets/spec/paths/Orders_id_Cancel.yaml`

```
assets/spec/paths/
  BusinessPartners.yaml        ← GET list, POST create
  BusinessPartners_id.yaml     ← GET one, PATCH, PUT, DELETE
  Orders.yaml
  Orders_id.yaml
  Orders_id_Cancel.yaml        ← action function: POST Orders(id)/Cancel
  DeliveryNotes.yaml
  ...
```

Read the relevant file directly when you need the full schema.

---

## Header + lines documents

Most sales and purchasing documents in SAP B1 are **header + lines** objects. The header fields live at the top level of the JSON body; the lines are in a `DocumentLines` array.

```python
# Minimal Sales Order payload
order_payload = {
    "CardCode": "C001",
    "DocDate": "2026-04-16",
    "DocDueDate": "2026-04-30",
    "DocumentLines": [
        {
            "ItemCode": "ITEM-001",
            "Quantity": 10,
            "UnitPrice": 50.00,
            "WarehouseCode": "01",
        },
        {
            "ItemCode": "ITEM-002",
            "Quantity": 5,
            "UnitPrice": 120.00,
            "WarehouseCode": "01",
        },
    ],
}
response = sl.post("Orders", order_payload)
doc_entry = response["DocEntry"]
```

### Chaining documents (base document linking)

When creating a downstream document (e.g. Delivery from Order, Invoice from Delivery), supply `BaseType`, `BaseEntry`, and `BaseLine` **on every line**:

| Field | Meaning |
|---|---|
| `BaseType` | Object type of the source document (17 = Order, 15 = Delivery, 13 = Invoice) |
| `BaseEntry` | `DocEntry` of the source document |
| `BaseLine` | 0-based line number in the source document |

```python
# Create Delivery from Order
delivery_payload = {
    "CardCode": "C001",
    "DocumentLines": [
        {
            "BaseType": 17,          # 17 = Sales Order
            "BaseEntry": doc_entry,  # DocEntry captured from the Order POST
            "BaseLine": 0,
        },
    ],
}
sl.post("DeliveryNotes", delivery_payload)
```

> Leave `BaseEntry` as `null` in `_data.json` when the value is not yet known at authoring time. The `main()` function captures it at runtime from the prior POST response and fills it in before the next call.

### Common object type codes

| Code | Document |
|---|---|
| 13 | A/R Invoice |
| 15 | A/R Delivery |
| 17 | Sales Order |
| 18 | Sales Return |
| 20 | Purchase Order |
| 21 | Goods Receipt PO |
| 23 | A/P Invoice |

---

## Action functions

Action functions are RPC-style operations that mutate a single document without replacing it. They are called with `POST /Resource({key})/{ActionName}` and an **empty JSON body `{}`**.

```python
# Cancel an order
sl.post(f"Orders({doc_entry})/Cancel", {})

# Close a delivery
sl.post(f"DeliveryNotes({doc_entry})/Close", {})

# Create a cancellation document (generates a mirror credit note / return)
response = sl.post(f"Invoices({doc_entry})/CreateCancellationDocument", {})
cancel_doc_entry = response["DocEntry"]
```

Common action functions (available on most sales / purchasing documents):

| Action | Effect |
|---|---|
| `Cancel` | Cancels the document |
| `Close` | Closes the document (manual close) |
| `Reopen` | Reopens a closed document |
| `CreateCancellationDocument` | Creates a mirror reversal document |

See [ENDPOINTS.md](ENDPOINTS.md) for the full list of actions per resource.

---

## ENDPOINTS.md quick lookup

`ENDPOINTS.md` (next to this file) lists the most commonly used resources grouped by module (Business Partners, Items & Inventory, Sales, Purchasing, Payments, Accounting, Pricing, Master Data). Each entry shows:

- Available HTTP methods for the collection and single-record URLs
- All action functions available for that resource

Check ENDPOINTS.md first when you need to know what actions are available on a resource. Use `assets/spec/paths/{Resource}.yaml` and `assets/spec/paths/{Resource}_id.yaml` when you need the full field schema.

---

## Common resources quick reference

| Resource | Key field | Key format | Notes |
|---|---|---|---|
| `BusinessPartners` | `CardCode` | `string` | `CardType`: `C`=Customer, `S`=Supplier, `L`=Lead |
| `Items` | `ItemCode` | `string` | Item master data |
| `Orders` | `DocEntry` | `integer` | Sales Orders |
| `Invoices` | `DocEntry` | `integer` | A/R Invoices |
| `DeliveryNotes` | `DocEntry` | `integer` | Delivery / goods issue |
| `PurchaseOrders` | `DocEntry` | `integer` | Purchase Orders |
| `PurchaseInvoices` | `DocEntry` | `integer` | A/P Invoices |
| `IncomingPayments` | `DocEntry` | `integer` | Customer payments |
| `VendorPayments` | `DocEntry` | `integer` | Supplier payments |
| `Warehouses` | `WarehouseCode` | `string` | Warehouse master |
| `ChartOfAccounts` | `Code` | `string` | G/L accounts |

---

## Script checklist

When producing a new script pair:

- [ ] Derive the main repo root from workspace context
- [ ] Create `.temp/` under that root if it does not exist
- [ ] Name files `.temp/<operation>_data.json` and `.temp/<operation>_run.py`
- [ ] `_data.json` contains only data — no credentials, no boilerplate
- [ ] `_run.py` starts from `assets/script_template.py`
- [ ] `main(data, sl)` implements the full logic
- [ ] Use `sl.patch()` for updates (not `sl.post()` or PUT)
- [ ] Log each record processed with `log.info()`
- [ ] Verify key field names against `assets/spec/paths/{Resource}_id.yaml` before patching
- [ ] After creating both files, tell the user they can review and ask you to run the script

---

## Running a script

When the user asks to run a script:

1. **Run it directly** — do not check for `.env` files or environment variables beforehand. The script validates its own environment on startup and will print a clear error if credentials are missing.
2. **Working directory**: the main repo root (derived from workspace context — the app folder that owns the current task). Scripts live under `.temp/` within that root, but `cd` to the repo root so that `python-dotenv` finds the `.env` file there.
3. **Python interpreter**: use the bench virtualenv Python at `/workspace/development/frappe-bench/env/bin/python`.

```bash
cd <main-repo-root>
/workspace/development/frappe-bench/env/bin/python .temp/<operation>_run.py
```
