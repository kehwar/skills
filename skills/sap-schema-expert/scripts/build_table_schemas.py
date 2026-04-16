#!/usr/bin/env python3
"""
Seed assets/schemas/<TABLENAME>.yaml for every table in TABLE_INDEX.md.

Reads the URL column from TABLE_INDEX.md (produced by build_table_index.py),
fetches each table's detail page, and writes a YAML schema file with fields,
types, sizes, related links, default values, and constraints.

Run from any directory:
    python scripts/build_table_schemas.py            # all tables
    python scripts/build_table_schemas.py --resume   # skip already-written files
    python scripts/build_table_schemas.py OINV ORDR  # specific tables only

Options:
    --resume        Skip tables whose .yaml file already exists.
    --no-cache      Bypass disk cache and always re-fetch from the web.
    --workers N     Concurrent HTTP workers (default: 8).
    --delay S       Seconds to sleep between requests per worker (default: 0.1).
"""

import argparse
import hashlib
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from pathlib import Path

import yaml

SKILL_ROOT = Path(__file__).parent.parent
INDEX_FILE = SKILL_ROOT / "assets" / "TABLE_INDEX.yaml"
SCHEMAS_DIR = SKILL_ROOT / "assets" / "schemas"
CACHE_DIR = SKILL_ROOT / "assets" / ".html_cache"


# ---------------------------------------------------------------------------
# Parse TABLE_INDEX.yaml
# ---------------------------------------------------------------------------


def read_index(names_filter: set[str] | None = None) -> list[dict]:
    """Return list of {name, module, otype, description, url} dicts."""
    with INDEX_FILE.open(encoding="utf-8") as f:
        raw = yaml.safe_load(f) or []
    entries = []
    for item in raw:
        name = item.get("tablename", "")
        url = item.get("url", "")
        if not name or not url:
            continue
        if names_filter and name not in names_filter:
            continue
        entries.append(
            {
                "name": name,
                "module": item.get("module", ""),
                "otype": item.get("object_type", ""),
                "description": item.get("description", ""),
                "url": url,
            }
        )
    return entries


# ---------------------------------------------------------------------------
# HTML parsing — field detail page
# ---------------------------------------------------------------------------


class _TableParser(HTMLParser):
    """Extract raw cell text rows from an HTML table on a SAP B1 detail page.

    Only rows inside the table with the given ``table_id`` are collected.
    """

    def __init__(self, table_id: str):
        super().__init__()
        self._target_id = table_id
        self._in_target = False
        self._depth = 0  # nested <table> depth inside the target
        self._in_row = False
        self._in_cell = False
        self._cell_buf = ""
        self._current_row: list[str] = []
        self.rows: list[list[str]] = []

    def handle_starttag(self, tag, attrs):
        attr_dict = dict(attrs)
        if tag == "table":
            if attr_dict.get("id") == self._target_id:
                self._in_target = True
                self._depth = 0
            elif self._in_target:
                self._depth += 1
        if not self._in_target or self._depth > 0:
            return
        if tag == "tr":
            self._in_row = True
            self._current_row = []
        elif tag in ("td", "th") and self._in_row:
            self._in_cell = True
            self._cell_buf = ""

    def handle_endtag(self, tag):
        if tag == "table" and self._in_target:
            if self._depth == 0:
                self._in_target = False
            else:
                self._depth -= 1
        if not self._in_target:
            return
        if tag == "tr" and self._in_row:
            self._in_row = False
            if self._current_row:
                self.rows.append(self._current_row[:])
        elif tag in ("td", "th") and self._in_cell:
            self._in_cell = False
            self._current_row.append(self._cell_buf.strip())

    def handle_data(self, data):
        if self._in_cell:
            self._cell_buf += data

    def handle_entityref(self, name):
        if self._in_cell:
            _entities = {"amp": "&", "lt": "<", "gt": ">", "nbsp": "", "quot": '"'}
            self._cell_buf += _entities.get(name, "")

    def handle_charref(self, name):
        if self._in_cell:
            try:
                ch = chr(int(name[1:], 16) if name.startswith("x") else int(name))
                self._cell_buf += "" if ch == "\xa0" else ch
            except (ValueError, OverflowError):
                pass


def _cell(row: list[str], idx: int) -> str:
    """Return stripped cell text or empty string."""
    return row[idx].strip() if idx < len(row) else ""


def _coerce(raw: str) -> int | float | str:
    """Convert a string to int or float when possible, else return as-is."""
    if not raw:
        return raw
    try:
        return int(raw)
    except ValueError:
        pass
    try:
        return float(raw)
    except ValueError:
        return raw


# SAP B1 types whose default values should be coerced to numbers
_NUMERIC_TYPES = {"int", "num", "smallint", "tinyint", "bigint"}


def _coerce_default(raw: str, field_type: str) -> int | float | str:
    """Coerce default to a number only for numeric field types."""
    if not raw:
        return raw
    if field_type.lower() in _NUMERIC_TYPES:
        return _coerce(raw)
    return raw


def parse_fields(html: str) -> list[dict]:
    """Parse AutoNumber1 (field definitions) from a SAP B1 table detail page.

    Returns a list of field dicts with: field, description, type, size, and
    optionally related, default, and constraints (list of {key, label}).

    Constraint continuation rows (blank field name, populated key/label cols)
    are merged into the preceding field's constraints list.
    """
    parser = _TableParser("AutoNumber1")
    parser.feed(html)

    fields: list[dict] = []
    current_field: dict | None = None
    header_seen = False

    for row in parser.rows:
        col0 = _cell(row, 0)

        if col0.lower() == "field":
            header_seen = True
            continue

        if not header_seen:
            continue

        # Continuation row: col0 empty → extra constraint value for previous field
        if not col0:
            if current_field is not None:
                ck = _cell(row, 6)
                cv = _cell(row, 7)
                if ck or cv:
                    current_field.setdefault("constraints", []).append(
                        {"key": ck, "label": cv}
                    )
            continue

        # Main field row
        field: dict = {
            "field": col0,
            "description": _cell(row, 1),
            "type": _cell(row, 2),
            "size": _coerce(_cell(row, 3)),
        }

        related = _cell(row, 4)
        if related and related != "-":
            field["related"] = related

        default = _cell(row, 5)
        if default:
            field["default"] = _coerce_default(default, field["type"])

        ck = _cell(row, 6)
        cv = _cell(row, 7)
        if ck or cv:
            field["constraints"] = [{"key": ck, "label": cv}]

        fields.append(field)
        current_field = field

    return fields


def parse_indexes(html: str) -> list[dict]:
    """Parse AutoNumber2 (index/key definitions) from a SAP B1 table detail page.

    Returns a list of index dicts: {key, unique, fields: [...]}.
    Index continuation rows (blank key name) append their field to the
    preceding index's fields list.
    """
    parser = _TableParser("AutoNumber2")
    parser.feed(html)

    indexes: list[dict] = []
    current_index: dict | None = None
    header_seen = False

    for row in parser.rows:
        col0 = _cell(row, 0)

        if col0.lower() == "key":
            header_seen = True
            continue

        if not header_seen:
            continue

        field_name = _cell(row, 2)

        # Continuation row: key name is blank → extra field for previous index
        if not col0:
            if current_index is not None and field_name:
                current_index["fields"].append(field_name)
            continue

        index: dict = {
            "key": col0,
            "unique": _cell(row, 1).lower() == "yes",
            "fields": [field_name] if field_name else [],
        }
        indexes.append(index)
        current_index = index

    return indexes


# ---------------------------------------------------------------------------
# Fetch (with disk cache)
# ---------------------------------------------------------------------------


class RateLimitError(Exception):
    """Raised when the server returns HTTP 429 or 503."""


def _cache_path(url: str) -> Path:
    key = hashlib.sha1(url.encode()).hexdigest()
    return CACHE_DIR / f"{key}.html"


def fetch(url: str, no_cache: bool = False) -> str:
    cache_file = _cache_path(url)
    if not no_cache and cache_file.exists():
        return cache_file.read_text(encoding="utf-8")

    try:
        import requests  # type: ignore[import]

        resp = requests.get(url, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
        if resp.status_code in (429, 503):
            raise RateLimitError(
                f"HTTP {resp.status_code} from {url} — rate limit hit"
            )
        resp.raise_for_status()
        html = resp.text
    except ImportError:
        import urllib.error
        import urllib.request

        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        try:
            with urllib.request.urlopen(req) as r:
                html = r.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            if exc.code in (429, 503):
                raise RateLimitError(
                    f"HTTP {exc.code} from {url} — rate limit hit"
                ) from exc
            raise

    if not no_cache:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(html, encoding="utf-8")

    return html


# ---------------------------------------------------------------------------
# Write schema file
# ---------------------------------------------------------------------------


def write_schema(entry: dict, fields: list[dict], indexes: list[dict]) -> Path:
    out = SCHEMAS_DIR / f"{entry['name']}.yaml"
    data: dict = {
        "table": entry["name"],
        "description": entry["description"],
        "source": entry["url"],
        "fields": fields,
    }
    if indexes:
        data["indexes"] = indexes
    out.write_text(
        yaml.dump(data, allow_unicode=True, sort_keys=False, default_flow_style=False),
        encoding="utf-8",
    )
    return out


# ---------------------------------------------------------------------------
# Process one table
# ---------------------------------------------------------------------------


def process(
    entry: dict, resume: bool, delay: float, no_cache: bool = False
) -> tuple[str, str]:
    """Fetch and write one table schema. Returns (name, status)."""
    out = SCHEMAS_DIR / f"{entry['name']}.yaml"
    if resume and out.exists():
        return entry["name"], "skipped"
    try:
        html = fetch(entry["url"], no_cache=no_cache)
        fields = parse_fields(html)
        if not fields:
            return entry["name"], "empty"
        indexes = parse_indexes(html)
        write_schema(entry, fields, indexes)
        if delay:
            time.sleep(delay)
        return entry["name"], "ok"
    except RateLimitError:
        raise  # propagate so main() can abort early
    except Exception as exc:  # noqa: BLE001
        return entry["name"], f"error: {exc}"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "tables", nargs="*", help="Specific table names to process (default: all)"
    )
    parser.add_argument(
        "--resume", action="store_true", help="Skip tables already written"
    )
    parser.add_argument("--workers", type=int, default=1, metavar="N")
    parser.add_argument("--delay", type=float, default=1.3, metavar="S")
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Bypass disk cache and always re-fetch from the web",
    )
    args = parser.parse_args()

    names_filter = set(args.tables) if args.tables else None
    entries = read_index(names_filter)
    if not entries:
        print(
            "No entries found. Did you run build_table_index.py first?", file=sys.stderr
        )
        sys.exit(1)

    SCHEMAS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Processing {len(entries)} tables → {SCHEMAS_DIR}", file=sys.stderr)

    counters = {"ok": 0, "skipped": 0, "empty": 0, "error": 0}
    rate_limited = False

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(process, e, args.resume, args.delay, args.no_cache): e
            for e in entries
        }
        for i, future in enumerate(as_completed(futures), 1):
            try:
                name, status = future.result()
            except RateLimitError as exc:
                print(f"\n*** RATE LIMIT: {exc}", file=sys.stderr)
                print("Cancelling remaining work and exiting.", file=sys.stderr)
                for f in futures:
                    f.cancel()
                rate_limited = True
                break
            key = "error" if status.startswith("error") else status
            counters[key] += 1
            if status.startswith("error"):
                print(f"  [{i}/{len(entries)}] {name}: {status}", file=sys.stderr)
            elif i % 50 == 0 or i == len(entries):
                print(
                    f"  [{i}/{len(entries)}] ok={counters['ok']} skipped={counters['skipped']} empty={counters['empty']} errors={counters['error']}",
                    file=sys.stderr,
                )

    if rate_limited:
        sys.exit(2)

    print(
        f"\nDone: {counters['ok']} written, {counters['skipped']} skipped, {counters['empty']} empty, {counters['error']} errors",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
