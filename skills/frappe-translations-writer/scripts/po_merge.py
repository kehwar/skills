#!/usr/bin/env python3
"""Merge translations from a partial PO file back into the main PO file.

Usage:
    python po_merge.py --main <file> --patch <file> [--out <file>] [--dry-run]

Options:
    --main FILE     Full PO file to update (required)
    --patch FILE    Partial PO file with filled-in translations (required)
    --out FILE      Output path (default: overwrite --main in place)
    --dry-run       Print a summary of what would change, without writing anything
    --clear-fuzzy   Remove the 'fuzzy' flag from entries that receive a translation

Only entries in the patch that have a non-empty msgstr are applied.
Entries that are still untranslated in the patch are silently skipped.
Entries in the patch that do not exist in the main file are also skipped
(this is a pure update, not an append).

Examples:
    # Apply translations from a draft back to the full file
    python po_merge.py --main <app>/locale/es_PE.po --patch locale/drafts/es_PE.untranslated.po

    # Preview changes without writing
    python po_merge.py --main <app>/locale/es_PE.po --patch locale/drafts/es_PE.untranslated.po --dry-run

    # Write to a new file instead of overwriting
    python po_merge.py --main <app>/locale/es_PE.po --patch locale/drafts/es_PE.untranslated.po \\
        --out <app>/locale/es_PE.po.new
"""

import argparse
import sys
from pathlib import Path


def parse_args():
    p = argparse.ArgumentParser(
        description="Merge a partial PO file with translations back into the full PO."
    )
    p.add_argument("--main", required=True, help="Full PO file path")
    p.add_argument("--patch", required=True, help="Partial PO file with translations")
    p.add_argument("--out", help="Output file path (default: overwrite --main)")
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would change without writing",
    )
    p.add_argument(
        "--clear-fuzzy",
        action="store_true",
        help="Remove the fuzzy flag from entries that receive a translation",
    )
    return p.parse_args()


def make_key(msg):
    """Return the lookup key for a message: (id, context) or id."""
    if msg.context:
        return (msg.id, msg.context)
    return msg.id


def main():
    args = parse_args()

    main_path = Path(args.main)
    patch_path = Path(args.patch)

    for path in (main_path, patch_path):
        if not path.exists():
            print(f"Error: file not found: {path}", file=sys.stderr)
            sys.exit(1)

    from babel.messages import pofile

    with main_path.open("rb") as f:
        main_cat = pofile.read_po(f)

    with patch_path.open("rb") as f:
        patch_cat = pofile.read_po(f)

    applied = []
    skipped_empty = 0
    skipped_missing = 0

    for patch_msg in patch_cat:
        if not patch_msg.id:
            continue  # header
        if not patch_msg.string:
            skipped_empty += 1
            continue  # not translated in patch

        key = make_key(patch_msg)
        main_msg = main_cat.get(patch_msg.id, patch_msg.context)

        if main_msg is None:
            skipped_missing += 1
            continue  # not present in main

        old_string = main_msg.string
        main_msg.string = patch_msg.string

        if args.clear_fuzzy:
            main_msg.flags.discard("fuzzy")

        applied.append((key, old_string, patch_msg.string))

    # Summary
    print(f"Applied : {len(applied)}", file=sys.stderr)
    print(f"Skipped (empty in patch)  : {skipped_empty}", file=sys.stderr)
    print(f"Skipped (missing in main) : {skipped_missing}", file=sys.stderr)

    if args.dry_run:
        print("\nDry run — no files written.", file=sys.stderr)
        if applied:
            print("\nChanges that would be made:", file=sys.stderr)
            for key, old, new in applied:
                label = repr(key)
                print(f"  {label}", file=sys.stderr)
                print(f"    before: {repr(old)}", file=sys.stderr)
                print(f"    after:  {repr(new)}", file=sys.stderr)
        return

    out_path = Path(args.out) if args.out else main_path
    import io

    buf = io.BytesIO()
    pofile.write_po(buf, main_cat, width=76, omit_header=False)
    out_path.write_bytes(buf.getvalue())
    print(f"Written to {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
