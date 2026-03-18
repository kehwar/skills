#!/usr/bin/env python3
"""
Save a Frappe DocType from a JSON file using Frappe's document engine.

Behaviour mirrors a developer saving a DocType via the Frappe UI in developer mode:
  - New DocType: inserts the document, exports canonical JSON, scaffolds .py/.js/test_.py
  - Existing DocType: full-replaces all fields/permissions/properties, re-exports JSON

The JSON file must represent the COMPLETE desired state of the DocType.
For existing DocTypes, read the current .json first, modify it, then pass it here.

Usage (from frappe-bench root):
    env/bin/python <skill_dir>/scripts/save_doctype.py <path_to_json> [--site development.localhost]

Arguments:
    json_file   Path to the DocType JSON file (complete desired state)
    --site      Frappe site name (default: development.localhost)
    --bench     Path to frappe-bench root (default: auto-detected from cwd or known locations)
"""

import argparse
import json
import os
import sys


def find_bench_root(hint: str | None) -> str | None:
    if hint:
        return hint
    candidates = [
        os.getcwd(),
        "/workspace/development/frappe-bench",
        os.path.expanduser("~/frappe-bench"),
    ]
    for c in candidates:
        if os.path.isdir(os.path.join(c, "sites")) and os.path.isdir(
            os.path.join(c, "apps")
        ):
            return c
    return None


def main():
    parser = argparse.ArgumentParser(
        description="Save a Frappe DocType from a JSON file via Frappe's document engine."
    )
    parser.add_argument(
        "json_file", help="Path to the DocType JSON file (complete desired state)"
    )
    parser.add_argument(
        "--site",
        default="development.localhost",
        help="Frappe site name (default: development.localhost)",
    )
    parser.add_argument(
        "--bench",
        default=None,
        help="Path to frappe-bench root (default: auto-detected)",
    )
    args = parser.parse_args()

    # Resolve bench root
    bench_root = find_bench_root(args.bench)
    if not bench_root:
        print(
            "ERROR: Could not find frappe-bench root. Run from bench root or use --bench <path>.",
            file=sys.stderr,
        )
        sys.exit(1)

    sites_path = os.path.join(bench_root, "sites")

    # Load and validate JSON
    json_path = os.path.abspath(args.json_file)
    if not os.path.exists(json_path):
        print(f"ERROR: File not found: {json_path}", file=sys.stderr)
        sys.exit(1)

    with open(json_path) as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError as e:
            print(f"ERROR: Invalid JSON in {json_path}: {e}", file=sys.stderr)
            sys.exit(1)

    if data.get("doctype") != "DocType":
        print('ERROR: JSON must have "doctype": "DocType"', file=sys.stderr)
        sys.exit(1)

    name = data.get("name")
    if not name:
        print("ERROR: JSON must have a 'name' field", file=sys.stderr)
        sys.exit(1)

    # Bootstrap Frappe
    # frappe.utils.logger uses os.path.join("..", "logs", logfile) as a RELATIVE
    # path, resolved from cwd. Bench normally runs from bench_root/sites/ so that
    # "../logs/" resolves to bench_root/logs/. We replicate that here.
    import frappe

    os.chdir(sites_path)
    frappe.init(site=args.site, sites_path=".")
    frappe.connect()

    try:
        if frappe.db.exists("DocType", name):
            print(f"Updating existing DocType: {name}")
            doc = frappe.get_doc("DocType", name)
            doc.update(data)
            doc.save(ignore_permissions=True)
            action = "updated"
        else:
            print(f"Creating new DocType: {name}")
            doc = frappe.get_doc(data)
            doc.insert(ignore_permissions=True)
            action = "created"

        frappe.db.commit()

        # Report output path
        module_path = frappe.get_module_path(frappe.scrub(doc.module))
        doctype_dir = os.path.join(module_path, "doctype", frappe.scrub(doc.name))
        print(f"✓ DocType '{name}' {action} successfully.")
        print(f"  Exported to: {doctype_dir}")
        print(f"  Run 'bench migrate' if DB schema changed.")

    except Exception as e:
        frappe.db.rollback()
        print(f"ERROR saving DocType '{name}': {e}", file=sys.stderr)
        import traceback

        traceback.print_exc()
        sys.exit(1)
    finally:
        frappe.destroy()


if __name__ == "__main__":
    main()
