#!/usr/bin/env python3
"""
Save a Frappe Script Report from a JSON file using Frappe's document engine.

Behaviour mirrors a developer saving a Report via the Frappe UI in developer mode:
  - New report:     inserts the document, exports canonical JSON, scaffolds .py and .js
  - Existing report: full-replaces metadata/roles/columns/filters, re-exports JSON
                     (does NOT overwrite existing .py or .js — only missing files are scaffolded)

The JSON file must represent the COMPLETE desired state of the Report.
For existing reports, read the current .json first, modify it, then pass it here.

Usage (from frappe-bench root):
    env/bin/python <skill_dir>/scripts/save_report.py <path_to_json> [--site development.localhost]

Arguments:
    json_file   Path to the Report JSON file (complete desired state)
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
        description="Save a Frappe Script Report from a JSON file via Frappe's document engine."
    )
    parser.add_argument(
        "json_file", help="Path to the Report JSON file (complete desired state)"
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

    if data.get("doctype") != "Report":
        print('ERROR: JSON must have "doctype": "Report"', file=sys.stderr)
        sys.exit(1)

    if data.get("report_type") != "Script Report":
        print('ERROR: JSON must have "report_type": "Script Report"', file=sys.stderr)
        sys.exit(1)

    report_name = data.get("report_name") or data.get("name")
    if not report_name:
        print("ERROR: JSON must have a 'report_name' field", file=sys.stderr)
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
        if frappe.db.exists("Report", report_name):
            print(f"Updating existing Report: {report_name}")
            doc = frappe.get_doc("Report", report_name)
            doc.update(data)
            doc.save(ignore_permissions=True)
            action = "updated"
        else:
            print(f"Creating new Report: {report_name}")
            doc = frappe.get_doc(data)
            doc.insert(ignore_permissions=True)
            action = "created"

        frappe.db.commit()

        # Compute output directory
        module_path = frappe.get_module_path(frappe.scrub(doc.module))
        report_dir = os.path.join(module_path, "report", frappe.scrub(doc.report_name))
        print(f"✓ Report '{report_name}' {action} successfully.")
        print(f"  Exported to: {report_dir}/")
        if action == "created":
            print(f"  Scaffolded:  {report_dir}/{frappe.scrub(doc.report_name)}.py")
            print(f"               {report_dir}/{frappe.scrub(doc.report_name)}.js")
        print("  No 'bench migrate' required for report changes.")

    except Exception as e:
        frappe.db.rollback()
        print(f"ERROR saving Report '{report_name}': {e}", file=sys.stderr)
        import traceback

        traceback.print_exc()
        sys.exit(1)
    finally:
        frappe.destroy()


if __name__ == "__main__":
    main()
