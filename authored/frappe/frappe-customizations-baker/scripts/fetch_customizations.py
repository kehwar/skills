#!/usr/bin/env python3
"""
fetch_customizations.py

Query the active Frappe site for all Custom Fields and Property Setters,
enriched with doctype ownership metadata for the "bake-in" workflow.

Usage (run from frappe-bench root):
    env/bin/python <path>/fetch_customizations.py [--site <site>] [--app <app>]

Output: JSON printed to stdout.
    {
        "custom_fields": [...],
        "property_setters": [...],
        "doctype_app_map": {"DocType Name": "app_name", ...}
    }

Each custom_field row has:
    dt, fieldname, label, fieldtype, insert_after, options, module,
    is_system_generated, is_custom_doctype,
    + all properties relevant for baking (reqd, hidden, bold, read_only, etc.)

Each property_setter row has:
    doc_type, field_name, property, value, property_type, doctype_or_field,
    module, is_system_generated, is_custom_doctype

doctype_app_map maps every referenced DocType to the app that owns it
(determined by scanning apps/<app> directory structure and modules.txt).
"""

import argparse
import json
import os
import sys
from pathlib import Path


def _find_bench_root() -> Path:
    """Walk up from CWD until we find a sites/ directory."""
    p = Path.cwd()
    for _ in range(8):
        if (p / "sites").is_dir() and (p / "apps").is_dir():
            return p
        p = p.parent
    raise RuntimeError("Cannot locate frappe-bench root. Run from bench root or a sub-directory.")


def _build_module_to_app_map(bench_root: Path) -> dict[str, str]:
    """
    Return {module_title: app_name} by reading every app's modules.txt.
    module_title is normalised to lowercase for case-insensitive lookup.
    """
    mapping: dict[str, str] = {}
    apps_dir = bench_root / "apps"
    for app_dir in sorted(apps_dir.iterdir()):
        if not app_dir.is_dir():
            continue
        app_name = app_dir.name
        # modules.txt lives at apps/<app>/<app>/modules.txt
        modules_txt = app_dir / app_name / "modules.txt"
        if not modules_txt.exists():
            continue
        for line in modules_txt.read_text().splitlines():
            mod = line.strip()
            if mod:
                mapping[mod.lower()] = app_name
    return mapping


def _build_doctype_app_map(bench_root: Path, doctypes: list[str]) -> dict[str, str]:
    """
    For each doctype in `doctypes`, find the owning app by looking for
        apps/<app>/<app>/<module_dir>/doctype/<dt_scrubbed>/<dt_scrubbed>.json
    Returns {DocType: app_name}.  Doctypes not found in any app get "" (unknown).
    """
    apps_dir = bench_root / "apps"
    result: dict[str, str] = {}
    dt_scrubbed_map = {dt: dt.lower().replace(" ", "_") for dt in doctypes}

    for dt, scrubbed in dt_scrubbed_map.items():
        found = ""
        for app_dir in sorted(apps_dir.iterdir()):
            if not app_dir.is_dir():
                continue
            app_name = app_dir.name
            inner = app_dir / app_name
            if not inner.is_dir():
                continue
            # Search all module folders inside app
            for module_dir in inner.iterdir():
                if not module_dir.is_dir():
                    continue
                candidate = module_dir / "doctype" / scrubbed / f"{scrubbed}.json"
                if candidate.exists():
                    found = app_name
                    break
            if found:
                break
        result[dt] = found

    return result


def _is_custom_doctype_set(doctype_app_map: dict[str, str]) -> set[str]:
    """Doctypes with no app file → likely custom (user-created) doctypes."""
    return {dt for dt, app in doctype_app_map.items() if not app}


def main():
    parser = argparse.ArgumentParser(description="Fetch Frappe customizations for bake-in analysis")
    parser.add_argument("--site", default=None, help="Frappe site name (default: first site found)")
    parser.add_argument("--app", default=None, help="Only return customizations whose module belongs to this app")
    args = parser.parse_args()

    bench_root = _find_bench_root()
    sys.path.insert(0, str(bench_root / "apps" / "frappe"))

    import frappe  # noqa: PLC0415

    sites_path = str(bench_root / "sites")

    # Determine site
    site = args.site
    if not site:
        sites_dir = bench_root / "sites"
        for entry in sites_dir.iterdir():
            if entry.is_dir() and (entry / "site_config.json").exists():
                site = entry.name
                break
    if not site:
        print("ERROR: No site found. Pass --site <site>", file=sys.stderr)
        sys.exit(1)

    # Change to sites_path so that frappe's relative logging paths work correctly
    # (e.g., "../logs/" resolves from bench_root, not cwd)
    os.chdir(sites_path)
    frappe.init(site=site, sites_path=".")
    frappe.connect()

    module_to_app = _build_module_to_app_map(bench_root)

    # ── Custom Fields ────────────────────────────────────────────────────────
    cf_fields = [
        "name", "dt", "fieldname", "label", "fieldtype", "insert_after",
        "options", "module", "is_system_generated",
        # baking-relevant properties
        "reqd", "hidden", "bold", "read_only", "in_list_view", "in_standard_filter",
        "allow_on_submit", "no_copy", "print_hide", "search_index", "unique",
        "depends_on", "mandatory_depends_on", "read_only_depends_on",
        "description", "default", "fetch_from", "fetch_if_empty",
        "permlevel", "columns", "precision", "length", "translatable",
    ]
    cf_filters = {}
    if args.app:
        # Filter by modules that belong to the requested app
        app_modules = [m for m, a in module_to_app.items() if a == args.app]
        if app_modules:
            # match case-insensitively — module stored as title-case in DB
            cf_filters["module"] = ["in", [m.title() for m in app_modules]]

    raw_cfs = frappe.get_all("Custom Field", filters=cf_filters, fields=cf_fields, limit=0)

    # ── Property Setters ─────────────────────────────────────────────────────
    ps_fields = [
        "name", "doc_type", "field_name", "property", "value",
        "property_type", "doctype_or_field", "module", "is_system_generated",
    ]
    ps_filters = {}
    if args.app:
        app_modules = [m for m, a in module_to_app.items() if a == args.app]
        if app_modules:
            ps_filters["module"] = ["in", [m.title() for m in app_modules]]

    raw_ps = frappe.get_all("Property Setter", filters=ps_filters, fields=ps_fields, limit=0)

    # ── Build doctype → app map ───────────────────────────────────────────────
    unique_dts = {cf["dt"] for cf in raw_cfs} | {ps["doc_type"] for ps in raw_ps}
    dt_app_map = _build_doctype_app_map(bench_root, list(unique_dts))
    custom_dts = _is_custom_doctype_set(dt_app_map)

    # ── Annotate rows ─────────────────────────────────────────────────────────
    custom_fields = []
    for cf in raw_cfs:
        cf = dict(cf)
        dt = cf["dt"]
        cf["doctype_app"] = dt_app_map.get(dt, "")
        cf["is_custom_doctype"] = dt in custom_dts
        cf["customization_app"] = module_to_app.get((cf.get("module") or "").lower(), "")
        custom_fields.append(cf)

    property_setters = []
    for ps in raw_ps:
        ps = dict(ps)
        dt = ps["doc_type"]
        ps["doctype_app"] = dt_app_map.get(dt, "")
        ps["is_custom_doctype"] = dt in custom_dts
        ps["customization_app"] = module_to_app.get((ps.get("module") or "").lower(), "")
        property_setters.append(ps)

    frappe.destroy()

    output = {
        "custom_fields": custom_fields,
        "property_setters": property_setters,
        "doctype_app_map": dt_app_map,
        "module_to_app": module_to_app,
    }
    print(json.dumps(output, indent=2, default=str))


if __name__ == "__main__":
    main()
