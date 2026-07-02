#!/usr/bin/env python3
"""Extract a filtered subset of entries from a PO file into a reviewable partial PO.

Usage:
    python po_query.py --po <file> [OPTIONS]

Options:
    --po FILE          Source PO file (required)
    --out FILE         Output path. Relative paths are resolved under <po_dir>/drafts/.
                       Absolute paths are used as-is. Omit to write to stdout.
    --untranslated     Include only entries with empty msgstr
    --fuzzy            Include only fuzzy entries
    --path PATTERN     Include entries whose reference path matches PATTERN
                       Supports fnmatch globs, e.g. "<module>/**"
                       Can be given multiple times (OR logic between paths)
    --format FORMAT    Output format: po (default), tsv, json
                       po   — valid PO file
                       tsv  — tab-separated msgid\tcontext\tmsgstr
                       json — JSON array of {id, context, string}

Filters are combined with AND (e.g. --untranslated --path <module>/**
returns untranslated entries that come from that path).

When --out is given the output is saved to disk (relative paths land in
<po_dir>/drafts/); otherwise everything goes to stdout.

Examples:
    # All untranslated strings → stdout
    python po_query.py --po <app>/locale/es_PE.po --untranslated

    # Untranslated strings from a specific module → stdout
    python po_query.py --po <app>/locale/es_PE.po --untranslated \\
        --path "<module>/**"

    # All fuzzy entries → stdout
    python po_query.py --po <app>/locale/es_PE.po --fuzzy

    # Save PO with relative path  →  <app>/locale/drafts/review.po
    python po_query.py --po <app>/locale/es_PE.po --untranslated --out review.po

    # Save PO with absolute path
    python po_query.py --po <app>/locale/es_PE.po --untranslated --out /tmp/review.po

    # Dump untranslated strings to stdout as TSV (for agent / script consumption)
    python po_query.py --po <app>/locale/es_PE.po --untranslated --format tsv

    # Save TSV to a file
    python po_query.py --po <app>/locale/es_PE.po --untranslated --format tsv --out strings.tsv

    # Dump as JSON
    python po_query.py --po <app>/locale/es_PE.po --untranslated --format json

    # Save JSON to a file
    python po_query.py --po <app>/locale/es_PE.po --untranslated --format json --out strings.json
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
        "--out",
        help=(
            "Output file path. Relative paths are resolved under <po_dir>/drafts/. "
            "Absolute paths are used as-is. Omit to write to stdout."
        ),
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
    p.add_argument(
        "--format",
        choices=["po", "tsv", "json"],
        default="po",
        help=(
            "Output format. "
            "po (default): write a PO file to --out or auto-named path. "
            "tsv: print tab-separated msgid\\tmsgstr to stdout. "
            "json: print a JSON array of {id, context, string} to stdout."
        ),
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


def _resolve_out_path(po_path: Path, out: str) -> Path:
    """Resolve --out to an absolute path.

    Relative paths are placed under <po_dir>/drafts/.
    Absolute paths are used as-is.
    """
    p = Path(out)
    if p.is_absolute():
        return p
    drafts_dir = po_path.parent / "drafts"
    drafts_dir.mkdir(exist_ok=True)
    return drafts_dir / p


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

    if args.out:
        out_path = _resolve_out_path(po_path, args.out)
        if args.format in ("tsv", "json"):
            with out_path.open("w", encoding="utf-8") as fh:
                _dump(sub, args.format, fh)
            print(f"Wrote {count} entries to {out_path}", file=sys.stderr)
        else:
            out_path.write_bytes(content)
            print(f"Wrote {count} entries to {out_path}", file=sys.stderr)
    else:
        if args.format in ("tsv", "json"):
            _dump(sub, args.format, sys.stdout)
        else:
            sys.stdout.buffer.write(content)
        print(f"# {count} entries", file=sys.stderr)


def _dump(sub, fmt, out):
    """Write catalog entries in tsv or json format to the given text stream."""
    import json

    messages = [
        {
            "id": msg.id if isinstance(msg.id, str) else msg.id[0],
            "context": msg.context or "",
            "string": msg.string if isinstance(msg.string, str) else msg.string[0],
        }
        for msg in sub
        if msg.id
    ]

    if fmt == "tsv":
        print("msgid\tcontext\tmsgstr", file=out)
        for m in messages:
            msgid = m["id"].replace("\n", " ").replace("\t", " ")
            msgstr = m["string"].replace("\n", " ").replace("\t", " ")
            ctx = m["context"].replace("\n", " ").replace("\t", " ")
            print(f"{msgid}\t{ctx}\t{msgstr}", file=out)
    elif fmt == "json":
        print(json.dumps(messages, ensure_ascii=False, indent=2), file=out)


if __name__ == "__main__":
    main()
