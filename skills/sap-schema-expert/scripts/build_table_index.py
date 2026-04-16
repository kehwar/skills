#!/usr/bin/env python3
"""
Build assets/TABLE_INDEX.yaml from the SAP B1 Table Overview page.

Fetches the master table list from:
    https://help.sap.com/doc/089315d8d0f8475a9fc84fb919b501a3/10.0/en-US/SDKHelp/Table_Overview.htm

Produces:
    assets/TABLE_INDEX.yaml  — machine-readable index (input for build_table_schemas.py)

Run from any directory:
    python scripts/build_table_index.py
    python scripts/build_table_index.py --no-cache   # force re-fetch from web
"""

from __future__ import annotations

import re
import sys
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

import yaml

SKILL_ROOT = Path(__file__).parent.parent
INDEX_YAML = SKILL_ROOT / "assets" / "TABLE_INDEX.yaml"

BASE_URL = (
    "https://help.sap.com/doc/089315d8d0f8475a9fc84fb919b501a3/10.0/en-US/SDKHelp/"
)
OVERVIEW_URL = BASE_URL + "Table_Overview.htm"

_CACHE_FILE = SKILL_ROOT / "assets" / ".html_cache" / "_table_overview.html"
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    "Accept": "text/html",
}


# ---------------------------------------------------------------------------
# HTML fetching
# ---------------------------------------------------------------------------


def _fetch(url: str, *, no_cache: bool = False) -> str:
    """Fetch *url*, using a disk cache unless *no_cache* is True."""
    if not no_cache and _CACHE_FILE.exists():
        print(f"  Using cached overview page ({_CACHE_FILE.name})", file=sys.stderr)
        return _CACHE_FILE.read_text(encoding="utf-8")

    print(f"  GET {url}", file=sys.stderr)
    req = urllib.request.Request(url, headers=_HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        html = resp.read().decode("utf-8", errors="replace")

    _CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    _CACHE_FILE.write_text(html, encoding="utf-8")
    return html


# ---------------------------------------------------------------------------
# HTML parsing
# ---------------------------------------------------------------------------


class _OverviewParser(HTMLParser):
    """Parse the ``AutoNumber1`` table from the SAP Table Overview page.

    Collects every ``<tr>`` inside the table as a list of
    ``(cell_text, href_or_None)`` tuples — one per ``<td>``/``<th>``.
    """

    def __init__(self) -> None:
        super().__init__()
        self._in_table: bool = False
        self._depth: int = 0  # nested <table> count inside target
        self._in_row: bool = False
        self._in_cell: bool = False
        self._cell_buf: str = ""
        self._cell_href: str | None = None
        self._current_row: list[tuple[str, str | None]] = []
        self.rows: list[list[tuple[str, str | None]]] = []

    def handle_starttag(self, tag: str, attrs: list) -> None:
        attr_dict = dict(attrs)
        if tag == "table":
            if attr_dict.get("id") == "AutoNumber1":
                self._in_table = True
                self._depth = 0
            elif self._in_table:
                self._depth += 1
        if not self._in_table or self._depth > 0:
            return
        if tag == "tr":
            self._in_row = True
            self._current_row = []
        elif tag in ("td", "th") and self._in_row:
            self._in_cell = True
            self._cell_buf = ""
            self._cell_href = None
        elif tag == "a" and self._in_cell:
            self._cell_href = attr_dict.get("href")

    def handle_endtag(self, tag: str) -> None:
        if tag == "table" and self._in_table:
            if self._depth == 0:
                self._in_table = False
            else:
                self._depth -= 1
        if not self._in_table:
            return
        if tag == "tr" and self._in_row:
            self._in_row = False
            if self._current_row:
                self.rows.append(self._current_row[:])
        elif tag in ("td", "th") and self._in_cell:
            self._in_cell = False
            self._current_row.append((self._cell_buf.strip(), self._cell_href))

    def handle_data(self, data: str) -> None:
        if self._in_cell:
            self._cell_buf += data


# ---------------------------------------------------------------------------
# Object-type inference
# ---------------------------------------------------------------------------


def _infer_tabletype(name: str) -> str:
    """Infer ``tabletype`` from the table name using SAP B1 naming conventions.

    Rules (evaluated in order):
    - ``@`` prefix → ``udt``
    - ``A`` prefix → ``history``  (archive/audit copies, e.g. ADOC, AIT1)
    - ``O`` prefix → ``header``  (any O-prefix table, e.g. OINV, OCRD, OAT1)
    - Letters + trailing digits → ``lines``  (e.g. INV1, RDR1)
    - Anything else → ``standalone``
    """
    if name.startswith("@"):
        return "udt"
    if name.startswith("A"):
        return "history"
    if name.startswith("O"):
        return "header"
    if re.match(r"^[A-Z]+\d+$", name):
        return "lines"
    return "standalone"


# ---------------------------------------------------------------------------
# Row → entry conversion
# ---------------------------------------------------------------------------


def _parse_entries(rows: list[list[tuple[str, str | None]]]) -> list[dict]:
    """Convert raw HTML rows to sorted index entry dicts."""
    entries: list[dict] = []
    for cells in rows:
        if len(cells) < 3:
            continue
        name_text, href = cells[0]
        desc_text = cells[1][0]

        name = name_text.strip()
        # Skip the header row
        if not name or name.lower() in ("tablename", "table name", "table"):
            continue
        if href is None:
            continue

        # Resolve URL: BASE_URL + href without leading ./
        rel = href.lstrip("./")
        url = BASE_URL + rel

        # Module = first path segment of the relative URL
        # e.g. "Administration/AAD1.htm" → "Administration"
        #      "Business_Partners/OCRD.htm" → "Business_Partners"
        module = rel.split("/")[0] if "/" in rel else ""

        entries.append(
            {
                "tablename": name,
                "module": module,
                "tabletype": _infer_tabletype(name),
                "description": desc_text.strip(),
                "url": url,
            }
        )

    return sorted(entries, key=lambda e: e["tablename"])


# ---------------------------------------------------------------------------
# Writers
# ---------------------------------------------------------------------------


def _write_yaml(entries: list[dict]) -> None:
    INDEX_YAML.write_text(
        yaml.dump(
            entries,
            allow_unicode=True,
            sort_keys=False,
            default_flow_style=False,
        ),
        encoding="utf-8",
    )
    print(
        f"  Wrote {INDEX_YAML.relative_to(SKILL_ROOT)}  ({len(entries)} entries)",
        file=sys.stderr,
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Force re-fetch from web, ignoring disk cache.",
    )
    args = parser.parse_args()

    print(f"Fetching table overview …", file=sys.stderr)
    html = _fetch(OVERVIEW_URL, no_cache=args.no_cache)

    print("Parsing HTML …", file=sys.stderr)
    p = _OverviewParser()
    p.feed(html)
    print(f"  {len(p.rows)} raw rows", file=sys.stderr)

    entries = _parse_entries(p.rows)
    if not entries:
        print(
            "ERROR: no entries parsed — page structure may have changed.",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"  {len(entries)} table entries", file=sys.stderr)

    _write_yaml(entries)

    from collections import Counter

    counts = Counter(e["tabletype"] for e in entries)
    print(
        "\nDone:\n" + "\n".join(f"  {k}: {v}" for k, v in sorted(counts.items())),
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
