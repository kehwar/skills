#!/usr/bin/env python3
"""Extract a filtered subset of entries from a PO file into a reviewable partial PO.

Usage:
    python po_query.py --po <file> [OPTIONS]

Options:
    --po FILE          Source PO file (required)
    --out FILE         Output path (default: auto-named under locale/drafts/)
    --untranslated     Include only entries with empty msgstr
    --fuzzy            Include only fuzzy entries
    --path PATTERN     Include entries whose reference path matches PATTERN
                       Supports fnmatch globs, e.g. "<module>/**"
                       Can be given multiple times (OR logic between paths)

Filters are combined with AND (e.g. --untranslated --path <module>/**
returns untranslated entries that come from that path).

The output is a valid PO file placed in locale/drafts/, named from the
active filters (e.g. "es_PE.untranslated.po", "es_PE.<module>.po").
It can be opened in Poedit or edited manually, then fed back to po_merge.py.

Examples:
    # All untranslated strings  →  locale/drafts/es_PE.untranslated.po
    python po_query.py --po <app>/locale/es_PE.po --untranslated

    # Untranslated strings from a specific module
    #   →  locale/drafts/es_PE.<module>.untranslated.po
    python po_query.py --po <app>/locale/es_PE.po --untranslated \\
        --path "<module>/**"

    # All fuzzy entries  →  locale/drafts/es_PE.fuzzy.po
    python po_query.py --po <app>/locale/es_PE.po --fuzzy

    # Everything from a module  →  locale/drafts/es_PE.<module>.po
    python po_query.py --po <app>/locale/es_PE.po \\
        --path "<module>/**"

    # Override output path
    python po_query.py --po <app>/locale/es_PE.po --untranslated --out /tmp/review.po
"""

import argparse
import fnmatch
import io
import sys
from pathlib import Path


def parse_args():
    p = argparse.ArgumentParser(
        description="Extract filtered PO entries to a reviewable partial PO file."
    )
    p.add_argument("--po", required=True, help="Source PO file path")
    p.add_argument(
        "--out", help="Output file path (default: auto-named next to the source PO)"
    )
    p.add_argument(
        "--untranslated",
        action="store_true",
        help="Include only entries with empty msgstr",
    )
    p.add_argument(
        "--fuzzy",
        action="store_true",
        help="Include only fuzzy entries",
    )
    p.add_argument(
        "--path",
        action="append",
        dest="paths",
        metavar="PATTERN",
        help="Include entries whose reference path matches PATTERN (fnmatch). Repeatable.",
    )
    return p.parse_args()


def _path_matches(ref_path, pattern):
    """Match ref_path against pattern using fnmatch.

    Patterns that don't start with a wildcard are also tried with a '**/' prefix
    so that '<module>/**' matches '<app>/<module>/doctype/foo.json'.
    """
    if fnmatch.fnmatch(ref_path, pattern):
        return True
    if not pattern.startswith("*"):
        if fnmatch.fnmatch(ref_path, f"**/{pattern}"):
            return True
    return False


def matches_path(msg, patterns):
    """Return True if any message location matches any of the given glob patterns."""
    if not patterns:
        return True
    for ref_path, _lineno in msg.locations:
        for pattern in patterns:
            if _path_matches(ref_path, pattern):
                return True
    return False


def message_matches(msg, args):
    if args.untranslated and msg.string:
        return False
    if args.fuzzy and "fuzzy" not in msg.flags:
        return False
    if args.paths and not matches_path(msg, args.paths):
        return False
    return True


def build_sub_catalog(cat, args):
    from babel.messages.catalog import Catalog

    sub = Catalog()
    sub.header_comment = cat.header_comment
    sub.mime_headers = cat.mime_headers

    for msg in cat:
        if not msg.id:  # skip header entry
            continue
        if message_matches(msg, args):
            sub.add(
                msg.id,
                string=msg.string,
                locations=msg.locations,
                flags=msg.flags,
                auto_comments=msg.auto_comments,
                user_comments=msg.user_comments,
                context=msg.context,
            )
    return sub


def _default_out_path(po_path: Path, args) -> Path:
    """Build a descriptive output filename next to the source PO file."""
    stem = po_path.stem  # e.g. "es_PE"
    parts = []

    # First segment: first path pattern (leaf directory name)
    if args.paths:
        # Take the last non-wildcard segment of the first pattern as a label.
        # "<module>/**" -> "<module>"
        # "<app>/<module>/**" -> "<module>"
        first = args.paths[0].rstrip("/").rstrip("*").rstrip("/")
        label = Path(first).name or first
        if label:
            parts.append(label)

    if args.fuzzy:
        parts.append("fuzzy")
    if args.untranslated:
        parts.append("untranslated")

    if not parts:
        parts.append("review")

    out_name = f"{stem}.{'.' .join(parts)}.po"
    drafts_dir = po_path.parent / "drafts"
    drafts_dir.mkdir(exist_ok=True)
    return drafts_dir / out_name


def main():
    args = parse_args()

    po_path = Path(args.po)
    if not po_path.exists():
        print(f"Error: file not found: {po_path}", file=sys.stderr)
        sys.exit(1)

    from babel.messages import pofile

    with po_path.open("rb") as f:
        cat = pofile.read_po(f)

    sub = build_sub_catalog(cat, args)
    count = sum(1 for msg in sub if msg.id)

    buf = io.BytesIO()
    pofile.write_po(buf, sub, width=76, omit_header=False)
    content = buf.getvalue()

    out_path = Path(args.out) if args.out else _default_out_path(po_path, args)
    out_path.write_bytes(content)
    print(f"Wrote {count} entries to {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
