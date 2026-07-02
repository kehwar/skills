# SAP DI API Expert — Reference

## Index lookup

```python
import yaml, pathlib

index = yaml.safe_load(
    pathlib.Path("assets/DI_API_INDEX.yaml").read_text()
)

# Find by exact name
matches = [e for e in index if e["name"] == "Documents"]

# Find by keyword in name or description
matches = [e for e in index if "BusinessPartner" in e["name"]]

# Filter by kind: "service", "class", or "enum"
services = [e for e in index if e["kind"] == "service"]
```

Each entry has keys: `name`, `kind`, `description`, `doc_path`, `url`, `related_tables`.

Load a reference YAML:

```python
doc_yaml = yaml.safe_load(
    (pathlib.Path("assets/docs") / entry["doc_path"]).read_text()
)
```

---

## Services API (DI API 2005+)

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

## Fetching member detail pages

Each YAML doc exposes a `url` key per member. Fetch it when the short `description` is insufficient (parameter signatures, return types, edge cases).

### Get the member URL

```python
doc = yaml.safe_load(
    pathlib.Path("assets/docs/class/Documents.yaml").read_text()
)
prop = next(p for p in doc.get("properties", []) if p["name"] == "CardCode")
print(prop["url"])
# → https://help.sap.com/doc/.../SAPbobsCOM~Documents~CardCode.html
```

> **Tip:** Member URLs follow `SAPbobsCOM~<ClassName>~<MemberName>.html` — constructable without reading the YAML.

### Fetch options

- **In-agent**: pass URL to the `fetch_webpage` tool with a query (e.g. "CardCode description and allowed values").
- **Script**: `fetch_html(url, session)` from `scripts/common.py`.
- **Browser**: `"$BROWSER" "<url>"`

### Detail page sections

| Section | Contents |
|---|---|
| Description | Full prose, constraints, business rules |
| Syntax | Parameter names, types, return type |
| Remarks | Edge cases, version notes |
| Example | Inline code (if available) |
| See Also | Related properties / objects |

---

## COM vs DB column names

DI API uses **COM property names** (SAPbobsCOM type library) — not raw HANA column names.

| COM property (DI API) | DB column (HANA SQL) |
|---|---|
| `FederalTaxID` | `OCRD.LicTradNum` |
| `Mother` | `OCRD.FatherCard` |
| `DiscountPercent` | `OINV.TradeDisc` |
| `InventoryUOM` | `OITM.InvntryUom` |
