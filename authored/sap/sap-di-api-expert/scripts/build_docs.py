#!/usr/bin/env python3
"""
build_docs.py
=============
Fetch individual SAP DI API detail pages and save them as YAML files under
assets/docs/<kind>/<Name>.yaml.

Reads the entry list from assets/DI_API_INDEX.yaml (build that first with
build_index.py).  The script is idempotent: already-cached files are skipped.

Usage
-----
    # Fetch all pages (reads index from assets/DI_API_INDEX.yaml):
    python scripts/build_docs.py

    # Limit to N fetches (useful for testing):
    python scripts/build_docs.py --limit 10

    # Force re-fetch even if the file exists:
    python scripts/build_docs.py --force

    # Only fetch entries of a specific kind:
    python scripts/build_docs.py --kind class
    python scripts/build_docs.py --kind service
    python scripts/build_docs.py --kind enum
"""

from __future__ import annotations

import argparse

import requests
import urllib3
import yaml
from common import (
    ASSETS_DIR,
    DOCS_DIR,
    INDEX_OUTPUT,
    SKILL_ROOT,
    doc_path,
    fetch_and_cache_page,
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Fetch SAP DI API detail pages as YAML.")
    p.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Limit fetches to N entries (0 = unlimited).",
    )
    p.add_argument(
        "--force",
        action="store_true",
        help="Re-fetch pages even if the file already exists.",
    )
    p.add_argument(
        "--kind",
        choices=["service", "class", "enum"],
        help="Only fetch entries of this kind.",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    if not INDEX_OUTPUT.exists():
        print(f"ERROR: {INDEX_OUTPUT} not found. Run build_index.py first.")
        raise SystemExit(1)

    with INDEX_OUTPUT.open(encoding="utf-8") as f:
        index_records = yaml.safe_load(f)

    entries = [r for r in index_records if r.get("url")]
    if args.kind:
        entries = [e for e in entries if e["kind"] == args.kind]

    if args.force:
        for entry in entries:
            target = DOCS_DIR / doc_path(entry["name"], entry["kind"])
            if target.exists():
                target.unlink()

    to_fetch = entries if not args.limit else entries[: args.limit]
    print(f"Fetching {len(to_fetch)} pages (kind={args.kind or 'all'}) …")

    session = requests.Session()
    for i, entry in enumerate(to_fetch, 1):
        # Ensure href is present (index records store url; derive href from it)
        if not entry.get("href"):
            from common import BASE_URL

            entry["href"] = entry["url"].replace(BASE_URL, "")
        dp = fetch_and_cache_page(entry, session)
        target = DOCS_DIR / dp
        status = "fetched" if target.exists() else "stub"
        print(
            f"  [{i:4d}/{len(to_fetch)}] {entry['kind']:8s}  {entry['name']}  ({status})"
        )

    total = sum(
        1 for e in entries if (DOCS_DIR / doc_path(e["name"], e["kind"])).exists()
    )
    print(f"\nDone. {total} / {len(entries)} docs cached.")


if __name__ == "__main__":
    main()
