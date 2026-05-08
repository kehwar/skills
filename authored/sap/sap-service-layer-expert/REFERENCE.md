# SAP Service Layer — Reference

## Base URL and authentication

```
{scheme}://{host}:{port}/b1s/v2
```

`SAP_SL_HOST` is the full origin including port, e.g. `https://192.168.1.100:50000`.

Authentication is cookie-based — no Bearer token.

1. `POST /b1s/v2/Login` with `{"UserName":"…","Password":"…","CompanyDB":"…"}`
2. Session cookie `B1SESSION` is sent automatically by `requests.Session`
3. `POST /b1s/v2/Logout` in `finally` — `ServiceLayer.__exit__` handles this

Sessions expire after 30 min of inactivity.

---

## OData query parameters

Append as URL query strings on any `GET` collection call:

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
| `PUT /Resource(key)` | **Full replace** — omitted fields reset to defaults; rarely needed |
| `DELETE /Resource(key)` | Delete a record |

> **Always prefer PATCH over PUT** for updates.

### Key formats

| Type | Example |
|---|---|
| String | `BusinessPartners('C001')` |
| Integer | `Orders(12345)` |
| Composite | `SpecialPrices(CardCode='C001',ItemCode='ITEM01',PriceListNo=1)` |

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

`ServiceLayer._raise()` extracts `error.message.value` and raises `RuntimeError` with a descriptive message.

---

## Endpoint schema lookup

1. Resource path segment → `assets/spec/paths/{ResourceName}.yaml` (collection: list + create)
2. Single-record operations → `assets/spec/paths/{ResourceName}_id.yaml` (GET one, PATCH, PUT, DELETE)
3. Action functions → `assets/spec/paths/{Resource}_id_{ActionName}.yaml`

```
assets/spec/paths/
  BusinessPartners.yaml        ← GET list, POST create
  BusinessPartners_id.yaml     ← GET one, PATCH, PUT, DELETE
  Orders_id_Cancel.yaml        ← action: POST Orders(id)/Cancel
```

Read the file directly when you need the full field schema.

---

## Header + lines documents

Most sales and purchasing documents are **header + lines** objects: header fields at the top level, lines in `DocumentLines`.

```python
order_payload = {
    "CardCode": "C001",
    "DocDate": "2026-04-16",
    "DocDueDate": "2026-04-30",
    "DocumentLines": [
        {"ItemCode": "ITEM-001", "Quantity": 10, "UnitPrice": 50.00, "WarehouseCode": "01"},
        {"ItemCode": "ITEM-002", "Quantity": 5,  "UnitPrice": 120.00, "WarehouseCode": "01"},
    ],
}
response = sl.post("Orders", order_payload)
doc_entry = response["DocEntry"]
```

### Document chaining (BaseType / BaseEntry / BaseLine)

When creating a downstream document (e.g. Delivery from Order), supply all three on every line:

| Field | Meaning |
|---|---|
| `BaseType` | Object type of the source document |
| `BaseEntry` | `DocEntry` of the source document |
| `BaseLine` | 0-based line number in the source document |

```python
delivery_payload = {
    "CardCode": "C001",
    "DocumentLines": [
        {"BaseType": 17, "BaseEntry": doc_entry, "BaseLine": 0},
    ],
}
sl.post("DeliveryNotes", delivery_payload)
```

> Leave `BaseEntry` as `null` in `_data.json` when the value is not known at authoring time; populate it at runtime from the prior POST response.

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

RPC-style operations called with `POST /Resource({key})/{ActionName}` and an empty body `{}`.

```python
sl.post(f"Orders({doc_entry})/Cancel", {})
sl.post(f"DeliveryNotes({doc_entry})/Close", {})
response = sl.post(f"Invoices({doc_entry})/CreateCancellationDocument", {})
```

| Action | Effect |
|---|---|
| `Cancel` | Cancels the document |
| `Close` | Closes the document (manual close) |
| `Reopen` | Reopens a closed document |
| `CreateCancellationDocument` | Creates a mirror reversal document |

See [ENDPOINTS.md](ENDPOINTS.md) for the full per-resource action list.

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

## Two-file output contract — full spec

### Data file (`.temp/<operation>_data.json`)

Contains only the records array — no credentials, no boilerplate:

```json
[
  {"CardCode": "C001", "Phone1": "555-1001"},
  {"CardCode": "C002", "Phone1": "555-1002"}
]
```

### Run file (`.temp/<operation>_run.py`)

Starts from `assets/script_template.py`. Fill in `main()` only:

```python
def main(data: list, sl: ServiceLayer) -> None:
    for record in data:
        card_code = record.pop("CardCode")
        sl.patch(f"BusinessPartners('{card_code}')", record)
        log.info("Patched %s", card_code)
```

Naming convention — `snake_case`, verb first:
- `patch_business_partners`
- `create_sales_order`
- `delete_price_list_entries`

---

## Schema resolution

### ⚠️ Bundled OpenAPI spec is incomplete — fill gaps before writing scripts

The spec files in `assets/spec/paths/` document available endpoints and HTTP methods but **do not contain full request body schemas**. Most operations work by passing a JSON body whose structure is not fully described in the spec.

When the user does not know which fields are required or available, use these strategies in order:

1. **Fetch a live sample** — `GET` an existing record and inspect its shape. The response body reveals all writable property names, child array structures, and current values:
   ```python
   record = sl.get("Items('A1001')")
   ```
2. **Cross-reference `sap-di-api-expert`** — DI API class docs (e.g. `Items.yaml`) list scalar properties and their underlying DB column names (`field_name`). Property names often match the Service Layer by convention.
3. **Cross-reference `sap-schema-expert`** — HANA table schemas (e.g. `OITM.yaml`) show all columns, types, and allowed values. Use the DB column name to identify the matching Service Layer property.

Never guess field names. If none of the above resolves the schema, tell the user which fields are uncertain and ask them to confirm before writing the script.

### ⚠️ Service Layer property names differ from raw DB column names

The Service Layer is an independent REST API — it does **not** use the DI API (SAPbobsCOM) under the hood. However, like the DI API, its property names do not always match the underlying HANA column names. By convention the two APIs share many property names, but there can be differences between them.

Always look up the correct property name in `assets/spec/paths/{Resource}_id.yaml` — **do not assume the DB column name or DI API property name is valid**.

Known divergences (non-exhaustive):

| Service Layer property name | DB column (HANA SQL) |
|---|---|
| `FederalTaxID` | `OCRD.LicTradNum` |
| `Mother` | `OCRD.FatherCard` |
| `DiscountPercent` | `OINV.TradeDisc` |
| `InventoryUOM` | `OITM.InvntryUom` |

When cross-referencing with `sap-schema-expert` (HANA SQL), remap Service Layer property names to DB column names. Service Layer and DI API names often match by convention, but verify against the OpenAPI spec when in doubt.
