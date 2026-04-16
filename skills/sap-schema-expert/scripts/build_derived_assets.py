#!/usr/bin/env python3
"""
Build derived assets from the pre-seeded schema YAML files.

Produces / updates three files:

  assets/REVERSE_REFS.yaml
      For every table that is referenced by a `related:` annotation in any
      schema file, lists which (table, field) pairs point at it.  Enables
      "what tables reference OITM?" without scanning every YAML.

  assets/OBJ_TYPE_MAP.yaml
      Maps each numeric ObjType code to the document family it represents.
      Forward: ObjType → {header, description, all_tables}.
      Enables "what document is ObjType 17?" without reading schema files.

  assets/TABLE_INDEX.yaml  (in-place update)
      Adds computed keys to every entry:

      parent      The header table for a lines/child table (e.g. INV1 → OINV).
      obj_type    The ObjType numeric code for this table (from schema default).
      related_to  Sorted list of unique FK target tables (outbound `related:`).

Run from any directory:
    python scripts/build_derived_assets.py
"""

from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path

import yaml

SKILL_ROOT = Path(__file__).parent.parent
INDEX_FILE = SKILL_ROOT / "assets" / "TABLE_INDEX.yaml"
SCHEMAS_DIR = SKILL_ROOT / "assets" / "schemas"
REVERSE_REFS_FILE = SKILL_ROOT / "assets" / "REVERSE_REFS.yaml"
OBJ_TYPE_MAP_FILE = SKILL_ROOT / "assets" / "OBJ_TYPE_MAP.yaml"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _load_index() -> list[dict]:
    with INDEX_FILE.open(encoding="utf-8") as f:
        return yaml.safe_load(f) or []


def _load_all_schemas() -> dict[str, dict]:
    """Return {tablename: schema_dict} for every .yaml in schemas/."""
    schemas: dict[str, dict] = {}
    for path in SCHEMAS_DIR.glob("*.yaml"):
        try:
            data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        except Exception as exc:  # noqa: BLE001
            print(f"  WARN: could not parse {path.name}: {exc}", file=sys.stderr)
            continue
        table = data.get("table") or path.stem
        schemas[table] = data
    return schemas


def _infer_parent(tablename: str, known_tables: set[str]) -> str | None:
    """
    Infer the parent header table for a lines/child table.

    Pattern: lines tables are named <PREFIX><digits> (e.g. INV1, INV10, RDR1).
    The parent header is 'O' + <PREFIX> (e.g. OINV, ORDR).
    Returns None if the candidate header is not in known_tables.
    """
    m = re.match(r"^([A-Z]+)\d+$", tablename)
    if not m:
        return None
    candidate = "O" + m.group(1)
    return candidate if candidate in known_tables else None


# ---------------------------------------------------------------------------
# Extract ObjType per table
# ---------------------------------------------------------------------------


def extract_obj_types(schemas: dict[str, dict]) -> dict[str, str]:
    """Return {tablename: obj_type_str} for every table with an ObjType field default."""
    result: dict[str, str] = {}
    for tablename, data in schemas.items():
        for field in data.get("fields") or []:
            if field.get("field") == "ObjType" and field.get("default") is not None:
                result[tablename] = str(field["default"])
                break
    return result


def build_obj_type_map(
    obj_types: dict[str, str],
    index_entries: list[dict],
    known_tables: set[str],
) -> dict[str, dict]:
    """
    Build ObjType → document family mapping.

    For each ObjType, identifies the canonical header table (O-prefix member
    of the family, or the first alphabetically if none exists) and collects
    all tables that share the code.
    """
    # description lookup from index
    desc_map: dict[str, str] = {
        e["tablename"]: e.get("description", "") for e in index_entries
    }

    # Group tables by ObjType
    by_code: dict[str, list[str]] = defaultdict(list)
    for tbl, code in obj_types.items():
        by_code[code].append(tbl)

    result: dict[str, dict] = {}
    for code, tables in sorted(by_code.items(), key=lambda x: _sort_key(x[0])):
        tables_sorted = sorted(tables)
        # Prefer O-prefix table as canonical header
        header = next((t for t in tables_sorted if t.startswith("O")), tables_sorted[0])
        result[code] = {
            "header": header,
            "description": desc_map.get(header, ""),
            "tables": tables_sorted,
        }
    return result


def _sort_key(code: str) -> tuple:
    """Sort ObjType codes numerically where possible, strings last."""
    try:
        return (0, int(code))
    except ValueError:
        return (1, code)


def write_obj_type_map(obj_type_map: dict[str, dict]) -> None:
    OBJ_TYPE_MAP_FILE.write_text(
        yaml.dump(
            obj_type_map,
            allow_unicode=True,
            sort_keys=False,
            default_flow_style=False,
        ),
        encoding="utf-8",
    )
    print(
        f"  Wrote {OBJ_TYPE_MAP_FILE.name}  ({len(obj_type_map)} ObjType codes)",
        file=sys.stderr,
    )


# ---------------------------------------------------------------------------
# Build reverse refs
# ---------------------------------------------------------------------------


def build_reverse_refs(
    schemas: dict[str, dict],
) -> dict[str, list[dict]]:
    """
    Return {target_table: [{table, field}, ...]} sorted by table name.
    """
    refs: dict[str, list[dict]] = defaultdict(list)
    for tablename, data in schemas.items():
        for field in data.get("fields") or []:
            target = field.get("related")
            if target:
                refs[target].append(
                    {"table": tablename, "field": field.get("field", "")}
                )

    # Sort each bucket by table name, then field name
    return {
        target: sorted(sources, key=lambda x: (x["table"], x["field"]))
        for target, sources in sorted(refs.items())
    }


def write_reverse_refs(refs: dict[str, list[dict]]) -> None:
    """Write REVERSE_REFS.yaml."""
    # Build as a plain dict for clean YAML output
    out: dict = {}
    for target, sources in refs.items():
        out[target] = {"referenced_by": sources}

    REVERSE_REFS_FILE.write_text(
        yaml.dump(out, allow_unicode=True, sort_keys=False, default_flow_style=False),
        encoding="utf-8",
    )
    print(f"  Wrote {REVERSE_REFS_FILE.name}  ({len(refs)} tables)", file=sys.stderr)


# ---------------------------------------------------------------------------
# Update TABLE_INDEX.yaml
# ---------------------------------------------------------------------------


def update_index(
    entries: list[dict],
    schemas: dict[str, dict],
    obj_types: dict[str, str],
    known_tables: set[str],
) -> list[dict]:
    """
    Return the entries list with `parent`, `obj_type`, and `related_to`
    added/updated on every entry.
    """
    # Pre-compute outbound FK targets per table
    outbound: dict[str, list[str]] = {}
    for tablename, data in schemas.items():
        targets = sorted(
            {f["related"] for f in (data.get("fields") or []) if f.get("related")}
        )
        outbound[tablename] = targets

    updated = []
    for entry in entries:
        name = entry.get("tablename", "")
        new_entry = dict(entry)  # shallow copy preserves order for existing keys

        parent = _infer_parent(name, known_tables)
        obj_type = obj_types.get(name)
        related_to = outbound.get(name, [])

        if parent:
            new_entry["parent"] = parent
        elif "parent" in new_entry:
            del new_entry["parent"]

        if obj_type is not None:
            new_entry["obj_type"] = obj_type
        elif "obj_type" in new_entry:
            del new_entry["obj_type"]

        if related_to:
            new_entry["related_to"] = related_to
        elif "related_to" in new_entry:
            del new_entry["related_to"]

        updated.append(new_entry)

    return updated


def write_index(entries: list[dict]) -> None:
    INDEX_FILE.write_text(
        yaml.dump(
            entries, allow_unicode=True, sort_keys=False, default_flow_style=False
        ),
        encoding="utf-8",
    )
    print(f"  Wrote {INDEX_FILE.name}  ({len(entries)} entries)", file=sys.stderr)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    print("Loading index …", file=sys.stderr)
    entries = _load_index()
    if not entries:
        print("TABLE_INDEX.yaml is empty or missing — nothing to do.", file=sys.stderr)
        sys.exit(1)

    known_tables: set[str] = {e["tablename"] for e in entries if e.get("tablename")}
    print(f"  {len(known_tables)} tables in index", file=sys.stderr)

    print("Loading schema files …", file=sys.stderr)
    schemas = _load_all_schemas()
    print(f"  {len(schemas)} schema files loaded", file=sys.stderr)

    print("Extracting ObjType codes …", file=sys.stderr)
    obj_types = extract_obj_types(schemas)
    obj_type_map = build_obj_type_map(obj_types, entries, known_tables)
    write_obj_type_map(obj_type_map)

    print("Building reverse refs …", file=sys.stderr)
    refs = build_reverse_refs(schemas)
    write_reverse_refs(refs)

    print("Updating TABLE_INDEX.yaml …", file=sys.stderr)
    updated = update_index(entries, schemas, obj_types, known_tables)
    write_index(updated)

    # Summary stats
    with_parent = sum(1 for e in updated if e.get("parent"))
    with_obj_type = sum(1 for e in updated if e.get("obj_type"))
    with_refs = sum(1 for e in updated if e.get("related_to"))
    total_ref_links = sum(len(e.get("related_to") or []) for e in updated)
    print(
        f"\nDone:\n"
        f"  {len(obj_type_map)} ObjType codes in OBJ_TYPE_MAP.yaml\n"
        f"  {len(refs)} tables have inbound references in REVERSE_REFS.yaml\n"
        f"  {with_parent}/{len(updated)} index entries have a parent inferred\n"
        f"  {with_obj_type}/{len(updated)} index entries have obj_type\n"
        f"  {with_refs}/{len(updated)} index entries have outbound FK targets\n"
        f"  {total_ref_links} total outbound FK links recorded",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
