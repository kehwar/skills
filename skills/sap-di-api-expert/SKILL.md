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

---

## Fetching individual property / method detail pages

Each entry in a `.yaml` doc file exposes a `url` key for every member
(property, method, or enum value).  When the short `description` in the YAML
is insufficient — for example, to see parameter signatures, return types,
allowed values, or full usage notes — fetch that URL and parse it.

### 1 — Identify the member URL from the YAML

```python
import yaml, pathlib

doc = yaml.safe_load(
    (pathlib.Path("assets/docs/class/Documents.yaml")).read_text()
)

# Find a specific property
prop = next(p for p in doc.get("properties", []) if p["name"] == "CardCode")
print(prop["url"])
# → https://help.sap.com/doc/.../SDKHelp/SAPbobsCOM~Documents~CardCode.html

# Find a specific method
method = next(m for m in doc.get("methods", []) if m["name"] == "GetByKey")
print(method["url"])
```

### 2 — Fetch the detail page

**Option A — using the `fetch_webpage` tool (in-agent, no script needed)**

Pass the member URL directly to the `fetch_webpage` tool with a query describing
what you need (e.g. "GetByKey parameters and return type").  The tool returns the
parsed text of the SAP Help page.

**Option B — fetch via script**

```python
import requests, urllib3
from common import REQUEST_HEADERS, fetch_html

urllib3.disable_warnings()
session = requests.Session()
html = fetch_html(member_url, session)
# parse with BeautifulSoup or pass to html_to_data()
```

**Option C — open in browser**

```
"$BROWSER" "<member_url>"
```

### 3 — What the detail page adds

| Section | Contents |
|---|---|
| **Description** | Full prose description, constraints, business rules |
| **Syntax** | Parameter names, types, return type (for methods) |
| **Remarks** | Edge cases, version notes, related properties |
| **Example** | Inline code snippet (if available) |
| **See Also** | Links to sibling properties / related objects |

### 4 — Batch-fetch all member pages for an object (offline cache)

If you expect to need several member pages for the same object, cache them all
at once with `build_docs.py`'s `--kind` filter — but member pages are **not**
saved by `build_docs.py` (it only caches the object-level pages).  Fetch member
pages on demand using Option A or B above.

> **Tip:** Member URLs follow a predictable pattern:
> `SAPbobsCOM~<ClassName>~<MemberName>.html`
> You can construct them without reading the YAML when you already know the class
> and member name.

---

## Related skills

| Skill | When to use |
|---|---|
| `sap-schema-expert` | Look up DB column names, table structure, and encoded values |
| `sap-service-layer-expert` | Read/write SAP B1 data via REST API |
| `sap-dtw-expert` | Bulk import/export via Data Transfer Workbench TSV files |

### ⚠️ DI API uses COM property names — not raw DB column names

The DI API, Service Layer, and DTW all share **COM property names** (SAPbobsCOM type library). These differ from the raw HANA database column names used in SQL queries.

Always verify property names in `assets/docs/class/<ClassName>.yaml` — **do not assume the DB column name transfers directly**.

Known divergences (non-exhaustive):

| COM property name (DI API / Service Layer / DTW) | DB column (HANA SQL) |
|---|---|
| `FederalTaxID` | `OCRD.LicTradNum` |
| `Mother` | `OCRD.FatherCard` |
| `DiscountPercent` | `OINV.TradeDisc` |
| `InventoryUOM` | `OITM.InvntryUom` |

Service Layer and DTW share the same COM property names as the DI API — no remapping is needed between those three. Only when writing raw HANA SQL (via `sap-schema-expert`) do you need to convert COM property names to DB column names.
