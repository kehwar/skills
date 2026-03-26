#!/usr/bin/env python3
"""
add_customization.py

Merge Custom Fields and Property Setters into a Frappe sync_on_migrate JSON file.
Output format mirrors frappe.as_json: indent=1, sort_keys=True.

Usage:
    python add_customization.py <target.json> <spec.json>

    target.json  Path to the customisation file (created if it doesn't exist).
    spec.json    File containing one of:
                   1. {"doctype": "X", "custom_fields": [...], "property_setters": [...]}
                   2. {"dt": "X", "fieldname": "y", ...}         — single Custom Field
                   3. {"doc_type": "X", "property": "z", ...}    — single Property Setter
"""

import json
import sys
from datetime import datetime
from pathlib import Path


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")


# ──────────────────────────────────────────────────────────────────────────────
# Schema defaults (mirrors frappe.get_all("Custom Field"/"Property Setter", fields="*"))
# ──────────────────────────────────────────────────────────────────────────────

CUSTOM_FIELD_DEFAULTS: dict = {
    "_assign": None,
    "_comments": None,
    "_liked_by": None,
    "_user_tags": None,
    "allow_on_submit": 0,
    "bold": 0,
    "collapsible": 0,
    "collapsible_depends_on": None,
    "columns": 0,
    "default": None,
    "depends_on": None,
    "description": None,
    "docstatus": 0,
    "fetch_from": None,
    "fetch_if_empty": 0,
    "hidden": 0,
    "idx": 0,
    "ignore_user_permissions": 0,
    "ignore_xss_filter": 0,
    "in_global_search": 0,
    "in_list_view": 0,
    "in_standard_filter": 0,
    "length": 0,
    "modified_by": "Administrator",
    "no_copy": 0,
    "options": None,
    "owner": "Administrator",
    "parent": None,
    "parentfield": None,
    "parenttype": None,
    "permlevel": 0,
    "precision": "",
    "print_hide": 0,
    "print_hide_if_no_value": 0,
    "print_width": None,
    "read_only": 0,
    "report_hide": 0,
    "reqd": 0,
    "search_index": 0,
    "translatable": 0,
    "unique": 0,
    "width": None,
}

PROPERTY_SETTER_DEFAULTS: dict = {
    "_assign": None,
    "_comments": None,
    "_liked_by": None,
    "_user_tags": None,
    "docstatus": 0,
    "doctype_or_field": "DocField",
    "is_system_generated": 0,
    "modified_by": "Administrator",
    "module": None,
    "owner": "Administrator",
    "parent": None,
    "parentfield": None,
    "parenttype": None,
    "row_name": None,
}

_EMPTY_FILE: dict = {
    "custom_fields": [],
    "custom_perms": [],
    "links": [],
    "property_setters": [],
    "sync_on_migrate": 1,
}


# ──────────────────────────────────────────────────────────────────────────────
# Normalizers
# ──────────────────────────────────────────────────────────────────────────────


def normalize_custom_field(spec: dict) -> dict:
    """Merge spec over defaults; compute name and timestamps if absent."""
    entry = {**CUSTOM_FIELD_DEFAULTS, **spec}
    now = _now()
    entry.setdefault("creation", now)
    entry.setdefault("modified", now)
    if not entry.get("name"):
        entry["name"] = f"{entry['dt']}-{entry['fieldname']}"
    return entry


def normalize_property_setter(spec: dict) -> dict:
    """Merge spec over defaults; compute name and timestamps if absent."""
    entry = {**PROPERTY_SETTER_DEFAULTS, **spec}
    now = _now()
    entry.setdefault("creation", now)
    entry.setdefault("modified", now)
    if not entry.get("name"):
        field = entry.get("field_name") or entry.get("row_name") or "main"
        entry["name"] = f"{entry['doc_type']}-{field}-{entry['property']}"
    # Auto-set doctype_or_field for DocType-level setters
    if not entry.get("field_name") and entry.get("doctype_or_field") == "DocField":
        entry["doctype_or_field"] = "DocType"
    return entry


# ──────────────────────────────────────────────────────────────────────────────
# Load / save
# ──────────────────────────────────────────────────────────────────────────────


def load(path: Path, doctype: str) -> dict:
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
    else:
        data = {**_EMPTY_FILE, "doctype": doctype}
    # Ensure all required top-level keys exist
    for k, v in _EMPTY_FILE.items():
        data.setdefault(k, v if isinstance(v, int) else [])
    data.setdefault("doctype", doctype)
    return data


def save(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(
        data, indent=1, sort_keys=True, separators=(",", ": "), ensure_ascii=True
    )
    path.write_text(text + "\n", encoding="utf-8")


# ──────────────────────────────────────────────────────────────────────────────
# Merge (update-in-place or append)
# ──────────────────────────────────────────────────────────────────────────────


def merge_custom_fields(existing: list, new_entries: list) -> list:
    index = {e["fieldname"]: i for i, e in enumerate(existing)}
    for spec in new_entries:
        entry = normalize_custom_field(spec)
        key = entry["fieldname"]
        if key in index:
            existing[index[key]].update(entry)
        else:
            existing.append(entry)
            index[key] = len(existing) - 1
    return existing


def merge_property_setters(existing: list, new_entries: list) -> list:
    def ps_key(e: dict) -> tuple:
        return (e.get("doc_type"), e.get("field_name"), e.get("property"))

    index = {ps_key(e): i for i, e in enumerate(existing)}
    for spec in new_entries:
        entry = normalize_property_setter(spec)
        k = ps_key(entry)
        if k in index:
            existing[index[k]].update(entry)
        else:
            existing.append(entry)
            index[k] = len(existing) - 1
    return existing


# ──────────────────────────────────────────────────────────────────────────────
# Spec parsing
# ──────────────────────────────────────────────────────────────────────────────


def parse_spec(raw: dict) -> tuple[str | None, list, list]:
    """Return (doctype, custom_fields, property_setters)."""
    # Envelope format: {"doctype": ..., "custom_fields": [...], "property_setters": [...]}
    if "custom_fields" in raw or "property_setters" in raw:
        return (
            raw.get("doctype"),
            raw.get("custom_fields", []),
            raw.get("property_setters", []),
        )
    # Single Custom Field: has "dt" and "fieldname"
    if "dt" in raw and "fieldname" in raw:
        return raw.get("dt"), [raw], []
    # Single Property Setter: has "doc_type" and "property"
    if "doc_type" in raw and "property" in raw:
        return raw.get("doc_type"), [], [raw]
    raise ValueError(f"Cannot determine spec type from keys: {sorted(raw)}")


# ──────────────────────────────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────────────────────────────


def main() -> None:
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)

    target = Path(sys.argv[1])
    spec_path = Path(sys.argv[2])

    if not spec_path.exists():
        print(f"Error: spec file not found: {spec_path}", file=sys.stderr)
        sys.exit(1)

    raw = json.loads(spec_path.read_text(encoding="utf-8"))
    doctype, custom_fields, property_setters = parse_spec(raw)

    if not doctype and custom_fields:
        doctype = custom_fields[0].get("dt")
    if not doctype and property_setters:
        doctype = property_setters[0].get("doc_type")
    if not doctype:
        print(
            "Error: cannot determine doctype. Add a 'doctype' key to the spec.",
            file=sys.stderr,
        )
        sys.exit(1)

    existed = target.exists()
    data = load(target, doctype)
    data["custom_fields"] = merge_custom_fields(data["custom_fields"], custom_fields)
    data["property_setters"] = merge_property_setters(
        data["property_setters"], property_setters
    )
    save(target, data)

    action = "updated" if existed else "created"
    print(f"✓ {action}: {target}")
    print(f"  custom_fields:    {len(data['custom_fields'])}")
    print(f"  property_setters: {len(data['property_setters'])}")


if __name__ == "__main__":
    main()
