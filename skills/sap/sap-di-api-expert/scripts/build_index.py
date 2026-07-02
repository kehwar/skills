#!/usr/bin/env python3
"""
build_index.py
==============
Scrape the SAP DI API index page and produce assets/DI_API_INDEX.yaml.

Usage
-----
    # Fetch index from SAP Help Portal and build YAML:
    python scripts/build_index.py

    # Use a previously saved local copy of the index HTML:
    python scripts/build_index.py --input /tmp/di_api_index.html

    # Save fetched HTML for offline use:
    python scripts/build_index.py --save-html /tmp/di_api_index.html

    # Rebuild YAML index from already-cached docs (no network):
    python scripts/build_index.py --from-cache

Source page:
    https://help.sap.com/doc/089315d8d0f8475a9fc84fb919b501a3/10.0/en-US/SDKHelp/SAPbobsCOM_P.html
"""

from __future__ import annotations

import argparse
from pathlib import Path

import requests
import urllib3
from common import (
    INDEX_URL,
    _index_record,
    build_index_from_cache,
    doc_path,
    fetch_html,
    parse_index,
    write_yaml_index,
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Build assets/DI_API_INDEX.yaml.")
    p.add_argument(
        "--input",
        metavar="FILE",
        help="Use a local HTML file instead of fetching from the web.",
    )
    p.add_argument(
        "--save-html", metavar="FILE", help="Save the fetched index HTML to FILE."
    )
    p.add_argument(
        "--from-cache",
        action="store_true",
        help="Rebuild index from already-cached docs without network.",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    session = requests.Session()

    if args.input:
        print(f"Reading index HTML from {args.input}")
        index_html = Path(args.input).read_text(encoding="utf-8", errors="replace")
    else:
        print(f"Fetching index from {INDEX_URL} …")
        index_html = fetch_html(INDEX_URL, session)
        if args.save_html:
            Path(args.save_html).write_text(index_html, encoding="utf-8")
            print(f"Saved index HTML → {args.save_html}")

    entries = parse_index(index_html)
    print(
        f"Parsed index: "
        f"{sum(1 for e in entries if e['kind']=='service')} services, "
        f"{sum(1 for e in entries if e['kind']=='class')} classes, "
        f"{sum(1 for e in entries if e['kind']=='enum')} enumerations"
    )

    if args.from_cache:
        index_records = build_index_from_cache(entries)
        write_yaml_index(index_records, "build_index.py")
        print("Done (from cache).")
        return

    index_records = [_index_record(e, doc_path(e["name"], e["kind"])) for e in entries]
    write_yaml_index(index_records, "build_index.py")
    print("Done.")


if __name__ == "__main__":
    main()
