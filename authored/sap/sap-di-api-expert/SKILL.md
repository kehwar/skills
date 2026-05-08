---
name: sap-di-api-expert
description: Expert guidance for writing Python code that interacts with the SAP Business One DI API (SAPbobsCOM namespace) via COM automation or the B1iP .NET bridge. Use when working with SAP B1 Services, Class objects, enumerations, connecting to a company database, reading/writing business objects (Documents, BusinessPartners, Items, etc.), or looking up object properties and method signatures from the bundled reference docs.
---

# SAP DI API Expert

## Quick start

1. Search `assets/DI_API_INDEX.yaml` by `name`, `kind` (`service`/`class`/`enum`), or keyword to find the right object.
2. Read `assets/docs/<kind>/<Name>.yaml` for properties, methods, and enumerations.
3. Connect to the company, then call `GetBusinessObject` with the appropriate `BoObjectTypes` enum.

See [REFERENCE.md](REFERENCE.md) for index lookup code, Services API, and member detail fetching.

---

## Connect to a company

```python
import win32com.client

company = win32com.client.Dispatch("SAPbobsCOM.Company")
company.Server = "192.168.1.100"
company.LicenseServer = "192.168.1.100:30000"
company.DbServerType = win32com.client.constants.dst_HANADB
company.CompanyDB = "MY_DB"
company.UserName = "manager"
company.Password = "secret"

ret_code = company.Connect()
if ret_code != 0:
    raise RuntimeError(company.GetLastErrorDescription())
```

## Read / write a business object

```python
docs = company.GetBusinessObject(win32com.client.constants.oInvoices)
docs.CardCode = "C10000"
docs.DocDate = "20260101"
docs.Lines.ItemCode = "ITEM001"
docs.Lines.Quantity = 5
docs.Lines.Add()

ret = docs.Add()
if ret != 0:
    raise RuntimeError(company.GetLastErrorDescription())
```

## Reference docs

All scraped reference pages are in `assets/docs/`:

```
assets/docs/
├── service/   # e.g. AccountsService.yaml
├── class/     # e.g. Documents.yaml
└── enum/      # e.g. BoObjectTypes.yaml
```

Use `assets/DI_API_INDEX.yaml` to map any name to its `doc_path`.

> ⚠️ **COM property names ≠ DB column names.** Always verify property names in
> `assets/docs/class/<ClassName>.yaml`. Example: `FederalTaxID` (COM) vs `LicTradNum` (HANA).

## Related skills

| Skill | When to use |
|---|---|
| `sap-schema-expert` | DB column names, table structure, encoded values |
| `sap-service-layer-expert` | Read/write SAP B1 data via REST API |
| `sap-dtw-expert` | Bulk import/export via DTW TSV files |

Service Layer and DTW share the same COM property names as the DI API — no remapping is needed between those three. Only when writing raw HANA SQL (via `sap-schema-expert`) do you need to convert COM property names to DB column names.
