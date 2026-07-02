---
name: sap-dtw-expert
description: Expert guidance for producing correct DTW (Data Transfer Workbench) import files for SAP Business One. Use when recommending templates for bulk import operations, generating TSV files from the bundled templates, understanding multi-table object requirements, identifying mandatory vs optional columns, adding custom fields, or choosing between DTW and Service Layer for a given task.
---

# SAP DTW Expert

## Quick start

1. Search `assets/TEMPLATE_INDEX.yaml` by `table_code` or `object_name` to find the right template(s).
2. Read the target `.tsv` file — **row 1** is the DI API field name (used by DTW), **row 2** is a label (ignored by DTW).
3. Fill data from row 3 onward; every column in row 1 is available, only a subset is mandatory.

## Template lookup

```python
import yaml, pathlib

index = yaml.safe_load(pathlib.Path("assets/TEMPLATE_INDEX.yaml").read_text())

matches = [e for e in index if e["table_code"] == "OCRD"]
matches = [e for e in index if "BusinessPartner" in e["object_name"]]
matches = [e for e in index if e["module"] == "Business Partners"]

template_path = pathlib.Path("assets/templates") / matches[0]["path"]
rows = template_path.read_text(encoding="utf-8").splitlines()
di_fieldnames = rows[0].split("\t")   # row 1 — DI API field names used by DTW
labels        = rows[1].split("\t")   # row 2 — labels (ignored by DTW)
```

Each index entry has: `table_code`, `object_name`, `module`, `category`, `path`.

## Key rules

- **Row 1** = DI API field names (what DTW maps to DB). Never change row 1 structure.
- **Row 2** = display labels — free to rename, ignored by DTW.
- **Multi-table objects**: produce one TSV per table, load header first; child tables link via `ParentKey`.
- **Custom fields**: append `U_FieldName` to the end of row 1; DTW rejects unrecognised names.
- **Encoding**: UTF-8 without BOM; no tab characters inside data values.
- **DTW vs Service Layer**: DTW for bulk migrations; Service Layer for real-time/programmatic writes.
- **DTW vs DI API field names**: DTW uses DI API COM property names (e.g. `FederalTaxID`), not raw HANA column names (e.g. `LicTradNum`). Use `sap-schema-expert` to map them.
- **Service Layer field names**: Service Layer is independent of the DI API — it shares most property names by convention but has exceptions. Always verify against the Service Layer OpenAPI spec, not DI API docs.

## Reference

See [REFERENCE.md](REFERENCE.md) for:

- `make_tsv()` generation helper
- Multi-table objects table with ParentKey rules
- Mandatory column minimums per object type (OCRD, OITM, document lines)
- DTW vs Service Layer decision matrix
- Common pitfalls and fixes
- COM property ↔ DB column mapping examples
