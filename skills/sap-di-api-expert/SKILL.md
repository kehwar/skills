---
name: sap-di-api-expert
description: Expert guidance for writing Python code that interacts with the SAP Business One DI API (SAPbobsCOM namespace) via COM automation or the B1iP .NET bridge. Use when working with SAP B1 Services, Class objects, enumerations, connecting to a company database, reading/writing business objects (Documents, BusinessPartners, Items, etc.), or looking up object properties and method signatures from the bundled reference docs.
---

# SAP DI API Expert

## Quick start

1. Search `assets/DI_API_INDEX.yaml` by `name`, `kind` (`service`/`class`/`enum`), or `description` keyword to find the right object.
2. Read the corresponding page in `assets/docs/<kind>/<Name>.md` for properties, methods, and enumerations.
3. Connect to the company using the `Company` object, then call `GetBusinessObject` with the appropriate `BoObjectTypes` enum.

---

## Index lookup procedure

```python
import yaml, pathlib

index = yaml.safe_load(
    pathlib.Path("assets/DI_API_INDEX.yaml").read_text()
)

# Find by exact name
matches = [e for e in index if e["name"] == "Documents"]

# Find by keyword in name or description
matches = [e for e in index if "BusinessPartner" in e["name"]]

# Find all services
services = [e for e in index if e["kind"] == "service"]

# Find all classes
classes = [e for e in index if e["kind"] == "class"]
```

Each entry has keys: `name`, `kind` (`service`, `class`, `enum`), `description`, `doc_path`.

Load the reference page with:
```python
doc = pathlib.Path("assets/docs") / entry["doc_path"]
print(doc.read_text())
```

---

## Connecting to a company (Python via win32com)

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

---

## Getting a business object

```python
# Via SAPbobsCOM.BoObjectTypes enum value
docs = company.GetBusinessObject(win32com.client.constants.oInvoices)

# Set fields
docs.CardCode = "C10000"
docs.DocDate = "20260101"

lines = docs.Lines
lines.ItemCode = "ITEM001"
lines.Quantity = 5
lines.Add()

ret = docs.Add()
if ret != 0:
    raise RuntimeError(company.GetLastErrorDescription())
```

---

## Using Services (DI API 2005+)

```python
bp_service = company.GetCompanyService().GetBusinessService(
    win32com.client.constants.ServiceTypes.stBusinessPartnersService
)
params = bp_service.GetDataInterface(
    win32com.client.constants.BusinessPartnersServiceDataInterfaces.bpsdiBusinessPartnerParams
)
params.Code = "C10000"
bp = bp_service.Get(params)
```

---

## Reference docs location

All scraped reference pages are in `assets/docs/`:

```
assets/docs/
├── service/          # One .md per Service (e.g. AccountsService.md)
├── class/            # One .md per Class (e.g. Documents.md)
└── enum/             # One .md per Enumeration (e.g. BoObjectTypes.md)
```

Use `assets/DI_API_INDEX.yaml` to find the correct `doc_path` for any name.

> **Note:** If `assets/docs/` is empty, run `python scripts/build_index.py` to
> scrape and cache the reference pages (requires network access to SAP Help Portal).
