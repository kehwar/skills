#!/usr/bin/env python3
"""
Run code through Frappe's System Console doctype (execute_code method).

Executes Python or SQL code in the exact same sandbox used by the System Console UI.
Output from print() / frappe.log() is printed to stdout. Errors go to stderr.

Usage (from frappe-bench root):
    env/bin/python <skill_dir>/scripts/run_console.py script.py
    echo 'print("hello")' | env/bin/python <skill_dir>/scripts/run_console.py
    env/bin/python <skill_dir>/scripts/run_console.py --commit script.py
    env/bin/python <skill_dir>/scripts/run_console.py --type SQL query.sql

Arguments:
    file        Python/SQL file to execute (reads stdin if omitted)
    --site      Frappe site name (default: development.localhost)
    --bench     Path to frappe-bench root (default: auto-detected from cwd or known locations)
    --commit    Commit after execution (default: rollback)
    --type      Execution type: Python or SQL (default: Python)
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
        description="Run code through Frappe System Console (execute_code method)."
    )
    parser.add_argument("file", nargs="?", help="Python/SQL file to execute (reads stdin if omitted)")
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
    parser.add_argument("--commit", action="store_true", help="Commit after execution (default: rollback)")
    parser.add_argument("--type", default="Python", choices=["Python", "SQL"], help="Execution type (default: Python)")
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

    # Read code from file or stdin
    if args.file:
        file_path = os.path.abspath(args.file)
        if not os.path.exists(file_path):
            print(f"ERROR: File not found: {file_path}", file=sys.stderr)
            sys.exit(1)
        with open(file_path) as f:
            code = f.read()
    elif not sys.stdin.isatty():
        code = sys.stdin.read()
    else:
        parser.error("Provide a file argument or pipe code via stdin")

    # Bootstrap Frappe
    # frappe.utils.logger uses os.path.join("..", "logs", logfile) as a RELATIVE
    # path, resolved from cwd. Bench normally runs from bench_root/sites/ so that
    # "../logs/" resolves to bench_root/logs/. We replicate that here.
    import frappe

    os.chdir(sites_path)
    frappe.init(site=args.site, sites_path=".")
    frappe.connect()
    frappe.set_user("Administrator")

    try:
        from frappe.desk.doctype.system_console.system_console import execute_code

        doc = json.dumps({
            "doctype": "System Console",
            "console": code,
            "type": args.type,
            "commit": args.commit,
        })

        # Suppress stdout during execution because frappe.log() prints repr()
        # to stdout when there's no HTTP request (CLI mode). The actual output
        # is captured in result["output"] via frappe.debug_log.
        old_stdout = sys.stdout
        sys.stdout = open(os.devnull, "w")
        try:
            result = execute_code(doc)
        finally:
            sys.stdout.close()
            sys.stdout = old_stdout

        output = result.get("output", "")
        if output:
            print(output)

    except Exception as e:
        frappe.db.rollback()
        print(f"ERROR: {e}", file=sys.stderr)
        import traceback

        traceback.print_exc()
        sys.exit(1)
    finally:
        frappe.destroy()


if __name__ == "__main__":
    main()
