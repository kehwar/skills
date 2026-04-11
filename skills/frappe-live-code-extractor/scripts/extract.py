#!/usr/bin/env python3
"""frappe-live-code-extractor  —  extract.py

Queries the live Frappe database (read-only) and writes every DB-resident
code artifact as a plain file under  <app>/live/<doctype-slug>/[<subtype>/]<slug>/.

All doctypes — built-in Frappe types or custom app types — are treated
uniformly.  Each extracted doctype uses a config.json that lives at:

    <app>/live/<doctype-slug>/config.json

Config resolution follows a 3-step fallback per doctype:
  1. <app>/live/<doctype-slug>/config.json  — app-local customisation
  2. skills/.agents/.../assets/<name>.json  — skill-bundled default, copied
                                              into the app tree on first run
  3. (agent responsibility) interview the user / infer from context

Continues processing even if individual artifacts fail — errors are collected
and reported at the end. Safe to run at any time; never writes to the database.

Run from the bench directory:

    cd /workspace/development/frappe-bench
    ./env/bin/python skills/.agents/skills/frappe-live-code-extractor/scripts/extract.py [--site SITE] [--app APP]

Defaults:
    --site  development.localhost
    --app   required; pass the Frappe app name explicitly
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import traceback
from datetime import date, datetime
from pathlib import Path
from typing import Any

# Suppress frappe's file-based logging — we don't need site log files when
# running the extractor as a standalone script outside the bench daemon.
os.environ.setdefault("FRAPPE_STREAM_LOGGING", "1")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _json_default(obj: object) -> str:
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    return str(obj)


def write_json(path: Path, raw: str) -> None:
    """Write *raw* JSON string to *path*, pretty-printed with indent=2.

    Falls back to writing the raw string unchanged if it cannot be parsed
    (e.g. empty or malformed content stored in the DB field).
    """
    try:
        parsed = json.loads(raw)
        text = json.dumps(parsed, indent=2, ensure_ascii=False) + "\n"
    except (json.JSONDecodeError, TypeError):
        text = raw
    path.write_text(text, encoding="utf-8")


def slugify(name: str) -> str:
    """Lower-case name; replace runs of non-alphanumeric chars with hyphens."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "unnamed"


def build_slug_map(names: list[str]) -> dict[str, str]:
    """
    Return a mapping from each artifact name to a unique slug within the group.

    Collision strategy: sort names ascending, then assign the bare slug to the
    first, '<slug>-2' to the second, '<slug>-3' to the third, etc.  This is
    deterministic as long as the set of names is unchanged.
    """
    slug_counts: dict[str, int] = {}
    name_to_slug: dict[str, str] = {}
    for name in sorted(names):
        base = slugify(name)
        n = slug_counts.get(base, 0) + 1
        slug_counts[base] = n
        name_to_slug[name] = base if n == 1 else f"{base}-{n}"
    return name_to_slug


def cleanup_stale(base_dir: Path, valid_slugs: set[str]) -> int:
    """
    Remove any immediate subdirectory of *base_dir* whose name is not in
    *valid_slugs*.  Returns the number of directories removed.
    """
    if not base_dir.is_dir():
        return 0
    deleted = 0
    for entry in base_dir.iterdir():
        if entry.is_dir() and entry.name not in valid_slugs:
            shutil.rmtree(entry)
            deleted += 1
    return deleted


# ---------------------------------------------------------------------------
# Config loading
# ---------------------------------------------------------------------------


def _load_assets(assets_dir: Path) -> dict[str, tuple[Path, dict[str, Any]]]:
    """Return a mapping of {doctype_name: (asset_path, config)} from assets/*.json."""
    result: dict[str, tuple[Path, dict[str, Any]]] = {}
    if not assets_dir.is_dir():
        return result
    for config_file in sorted(assets_dir.glob("*.json")):
        try:
            config = json.loads(config_file.read_text(encoding="utf-8"))
            if isinstance(config, dict) and config.get("doctype"):
                result[config["doctype"]] = (config_file, config)
            else:
                print(
                    f"Warning: {config_file.name} does not contain a valid config",
                    file=sys.stderr,
                )
        except Exception as e:
            print(f"Warning: could not load {config_file.name}: {e}", file=sys.stderr)
    return result


def discover_all_configs(
    live_dir: Path,
    assets_dir: Path,
) -> list[dict[str, Any]]:
    """
    Resolve configs for all known doctypes using the 3-step fallback:

    1. Check <app>/live/<doctype-slug>/config.json       — use if present
    2. Check skill assets/*.json                         — copy into app tree then use
    3. (Agent responsibility) interview user             — not handled here

    Also picks up any live/<slug>/config.json not covered by assets.
    Returns a list of parsed config dicts (one per doctype).
    """
    assets_by_doctype = _load_assets(assets_dir)
    resolved: dict[str, dict[str, Any]] = {}  # doctype_name -> config

    # Steps 1 & 2: process every known asset config
    for doctype, (asset_path, asset_config) in assets_by_doctype.items():
        slug = slugify(doctype)
        app_config_path = live_dir / slug / "config.json"
        if app_config_path.exists():
            # Step 1: app has a local override — prefer it
            parsed = parse_config_json(app_config_path)
            if parsed:
                resolved[doctype] = parsed
        else:
            # Step 2: seed the app tree from the skill asset
            app_config_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(asset_path, app_config_path)
            resolved[doctype] = asset_config

    # Discover any app-side configs not already covered by assets
    if live_dir.is_dir():
        for entry in sorted(live_dir.iterdir()):
            if not entry.is_dir():
                continue
            config_path = entry / "config.json"
            if not config_path.is_file():
                continue
            parsed = parse_config_json(config_path)
            if parsed and parsed.get("doctype") not in resolved:
                resolved[parsed["doctype"]] = parsed

    return list(resolved.values())


# ---------------------------------------------------------------------------
# Error tracking
# ---------------------------------------------------------------------------


class ExtractionError:
    """Stores information about a failed extraction for a single artifact."""

    def __init__(self, artifact_type: str, artifact_name: str, error: Exception):
        self.artifact_type = artifact_type
        self.artifact_name = artifact_name
        self.error = error
        self.traceback = traceback.format_exc()

    def __str__(self) -> str:
        return (
            f"  [{self.artifact_type}] {self.artifact_name}\n"
            f"    {type(self.error).__name__}: {self.error}"
        )


class ErrorCollector:
    """Collects extraction errors that occur during the run."""

    def __init__(self):
        self.errors: list[ExtractionError] = []

    def add(self, artifact_type: str, artifact_name: str, error: Exception) -> None:
        """Record an extraction error."""
        self.errors.append(ExtractionError(artifact_type, artifact_name, error))

    def has_errors(self) -> bool:
        """Return True if any errors were collected."""
        return len(self.errors) > 0

    def print_summary(self) -> None:
        """Print a summary of all errors to stderr."""
        if not self.errors:
            return

        print("\n⚠️  Extraction errors occurred:", file=sys.stderr)
        for err in self.errors:
            print(str(err), file=sys.stderr)


# ---------------------------------------------------------------------------
# Config-driven DocType extraction
# ---------------------------------------------------------------------------


def parse_config_json(config_path: Path) -> dict[str, Any] | None:
    """
    Parse a config.json file for DocType extraction.

    Expected JSON structure:
    {
      "doctype": "DocType Name",
      "group_by_field": "field_name" or null,
      "code_fields": [
        {
          "field": "field_name",
          "filename": "filename.ext",
          "ext_from_field": "optional_selector_field",
          "ext_map": {"value": ".ext"},
          "ext_default": ".txt"
        }
      ],
      "description": "Optional human-readable description"
    }

    Returns the parsed config dict or None if parsing fails.
    """
    try:
        content = config_path.read_text(encoding="utf-8")
    except Exception as e:
        print(
            f"Warning: could not read {config_path}: {e}",
            file=sys.stderr,
        )
        return None

    try:
        config = json.loads(content)
    except json.JSONDecodeError as e:
        print(
            f"Warning: could not parse JSON in {config_path}: {e}",
            file=sys.stderr,
        )
        return None

    if not isinstance(config, dict):
        print(
            f"Warning: {config_path} does not contain a JSON object",
            file=sys.stderr,
        )
        return None

    doctype = config.get("doctype")
    if not doctype:
        print(
            f"Warning: {config_path} missing 'doctype' field",
            file=sys.stderr,
        )
        return None

    code_fields = config.get("code_fields", [])
    if not isinstance(code_fields, list):
        print(
            f"Warning: {config_path} 'code_fields' is not a list",
            file=sys.stderr,
        )
        return None

    return config


def extract_doctype(
    live_dir: Path,
    frappe,  # noqa: ANN001
    config: dict[str, Any],
    errors: ErrorCollector,
) -> tuple[int, int]:
    """
    Extract all records of a doctype according to the config.

    Output directory is always ``live_dir / slugify(doctype)``.
    Group subdirectories are created inside that root when the config
    specifies ``group_by_field``.

    Args:
        live_dir: Base live directory for the app
        frappe: Frappe module instance
        config: Parsed config dictionary
        errors: Error collector for tracking failures

    Returns (total_written, total_deleted).
    """
    doctype = config["doctype"]
    group_by_field = config.get("group_by_field")
    group_by_map = config.get("group_by_map", {})
    code_fields_config = config.get("code_fields", [])
    filters = config.get("filters", {})

    # Fetch records with optional filters
    try:
        records = frappe.get_all(
            doctype,
            fields=["*"],
            filters=filters if filters else None,
            limit_page_length=0,
            order_by="name asc",
        )
    except Exception as e:
        print(
            f"Warning: could not fetch records for DocType '{doctype}': {e}",
            file=sys.stderr,
        )
        return 0, 0

    # All doctypes output to live/<doctype-slug>/
    base_root = live_dir / slugify(doctype)
    base_root.mkdir(parents=True, exist_ok=True)

    total_written = 0
    total_deleted = 0

    if isinstance(group_by_field, list):
        # Multi-field grouping:
        #   <field_name>/<value_slug>/<record_slug>/   — first non-empty field wins
        #   _ungrouped/<record_slug>/                  — no field has a value

        # Build nested dict: {field_name: {value_slug: [records]}}
        # _ungrouped is stored as {"_ungrouped": {"": [records]}} for uniformity.
        multi_groups: dict[str, dict[str, list]] = {}
        for r in records:
            matched_field: str | None = None
            matched_value: str | None = None
            for field in group_by_field:
                val = r.get(field)
                if val:
                    matched_field = field
                    matched_value = str(val)
                    break
            if matched_field is None:
                multi_groups.setdefault("_ungrouped", {}).setdefault("", []).append(r)
            else:
                value_slug = group_by_map.get(matched_value, slugify(matched_value))
                multi_groups.setdefault(matched_field, {}).setdefault(
                    value_slug, []
                ).append(r)

        active_top_dirs = set(multi_groups.keys())

        # Clean up stale top-level dirs (files like config.json are preserved)
        for entry in base_root.iterdir():
            if entry.is_file():
                continue
            if entry.is_dir() and entry.name not in active_top_dirs:
                shutil.rmtree(entry)

        for top_key, value_groups in multi_groups.items():
            top_dir = base_root / top_key
            top_dir.mkdir(parents=True, exist_ok=True)

            if top_key == "_ungrouped":
                # Flat: records directly under _ungrouped/<record_slug>/
                flat_records = value_groups.get("", [])
                names = [r.name for r in flat_records]
                slug_map = build_slug_map(names)
                total_deleted += cleanup_stale(top_dir, set(slug_map.values()))
                for r in flat_records:
                    total_written += _extract_doctype_record(
                        top_dir,
                        r,
                        slug_map,
                        code_fields_config,
                        doctype,
                        "_ungrouped",
                        errors,
                    )
            else:
                # Nested: <value_slug>/<record_slug>/
                active_value_dirs = set(value_groups.keys())
                for entry in top_dir.iterdir():
                    if entry.is_dir() and entry.name not in active_value_dirs:
                        for slug_entry in entry.iterdir():
                            if slug_entry.is_dir():
                                total_deleted += 1
                        shutil.rmtree(entry)

                for value_slug, value_records in value_groups.items():
                    value_dir = top_dir / value_slug
                    value_dir.mkdir(parents=True, exist_ok=True)
                    names = [r.name for r in value_records]
                    slug_map = build_slug_map(names)
                    total_deleted += cleanup_stale(value_dir, set(slug_map.values()))
                    for r in value_records:
                        total_written += _extract_doctype_record(
                            value_dir,
                            r,
                            slug_map,
                            code_fields_config,
                            doctype,
                            value_slug,
                            errors,
                        )

    elif group_by_field:
        # Single-group: use field value (slugified) as folder
        by_group: dict[str, list] = {}
        for r in records:
            group_value = r.get(group_by_field) or "_ungrouped"
            group_slug = group_by_map.get(group_value, slugify(str(group_value)))
            by_group.setdefault(group_slug, []).append(r)

        active_groups: set[str] = set(by_group.keys())

        # Clean up group directories that no longer exist
        # (files like config.json at the root are preserved)
        for entry in base_root.iterdir():
            if entry.is_file():
                continue
            if entry.is_dir() and entry.name not in active_groups:
                for slug_entry in entry.iterdir():
                    if slug_entry.is_dir():
                        total_deleted += 1
                shutil.rmtree(entry)

        for group_slug, group_records in by_group.items():
            group_dir = base_root / group_slug
            names = [r.name for r in group_records]
            slug_map = build_slug_map(names)
            total_deleted += cleanup_stale(group_dir, set(slug_map.values()))
            for r in group_records:
                total_written += _extract_doctype_record(
                    group_dir,
                    r,
                    slug_map,
                    code_fields_config,
                    doctype,
                    group_slug,
                    errors,
                )

    else:
        # Flat structure (no grouping)
        names = [r.name for r in records]
        slug_map = build_slug_map(names)
        total_deleted += cleanup_stale(base_root, set(slug_map.values()))
        for r in records:
            total_written += _extract_doctype_record(
                base_root, r, slug_map, code_fields_config, doctype, None, errors
            )

    return total_written, total_deleted


def _extract_doctype_record(
    base_dir: Path,
    r: dict,  # noqa: ANN401
    slug_map: dict[str, str],
    code_fields_config: list[dict[str, Any]],
    doctype: str,
    current_group: str | None,
    errors: ErrorCollector,
) -> int:
    """
    Extract a single doctype record. Returns 1 if successful, 0 if failed.

    Args:
        base_dir: Directory to extract into
        r: Record dictionary from frappe.get_all()
        slug_map: Name to slug mapping
        code_fields_config: List of code field configurations
        doctype: DocType name (for error reporting)
        current_group: If grouped, the current group slug (for group filtering)
        errors: Error collector
    """
    try:
        slug = slug_map[r.name]
        slug_dir = base_dir / slug
        slug_dir.mkdir(parents=True, exist_ok=True)
        record = dict(r)
        extracted: dict[str, str] = {}

        for field_config in code_fields_config:
            field = field_config.get("field")
            if not field:
                continue

            # Check group filters
            only_for_groups = field_config.get("only_for_groups", [])
            exclude_for_groups = field_config.get("exclude_for_groups", [])

            if only_for_groups and current_group not in only_for_groups:
                continue
            if exclude_for_groups and current_group in exclude_for_groups:
                continue

            filename = field_config.get("filename")
            skip_if_field_populated = field_config.get("skip_if_field_populated")
            skip_if_field_false = field_config.get("skip_if_field_false")
            ext_from_field = field_config.get("ext_from_field")
            ext_map = field_config.get("ext_map", {})
            ext_default = field_config.get("ext_default", "")

            content = record.pop(field, None) or ""

            # Always skip empty fields
            if not content.strip():
                continue

            if skip_if_field_populated:
                other_content = record.get(skip_if_field_populated) or ""
                if other_content.strip():
                    continue

            if skip_if_field_false:
                truthy_field = record.get(skip_if_field_false)
                if not truthy_field:
                    continue

            # Determine filename/extension
            if ext_from_field:
                # Extension derived from another field
                selector_value = record.get(ext_from_field) or ""
                ext = ext_map.get(selector_value, ext_default)
                # filename is field name + extension
                final_filename = f"{field}{ext}"
            elif filename:
                final_filename = filename
            else:
                # Fallback: field + .txt
                final_filename = f"{field}.txt"

            # Write the file
            if final_filename.endswith(".json"):
                write_json(slug_dir / final_filename, content)
            else:
                (slug_dir / final_filename).write_text(content, encoding="utf-8")

            extracted[field] = final_filename

        record["_extracted"] = extracted

        with (slug_dir / "meta.json").open("w", encoding="utf-8") as f:
            json.dump(record, f, indent=2, default=_json_default)
            f.write("\n")

        return 1
    except Exception as e:
        errors.add(doctype, r.name, e)
        return 0


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract Frappe DB-resident code to files",
    )
    parser.add_argument(
        "--site",
        default="development.localhost",
        help="Frappe site name (default: development.localhost)",
    )
    parser.add_argument(
        "--app",
        required=True,
        help="App name (required)",
    )
    parser.add_argument(
        "--doctype",
        metavar="DOCTYPE",
        help="Extract only this DocType (exact name, case-insensitive). "
        "Can be a standard Frappe DocType (e.g. 'Report') or a custom one.",
    )
    args = parser.parse_args()

    # Locate bench: must be run from the bench root, or set FRAPPE_BENCH_DIR.
    bench_dir = Path(os.environ.get("FRAPPE_BENCH_DIR", os.getcwd()))
    sites_path = str(bench_dir / "sites")

    import frappe  # noqa: PLC0415 — must be imported after path is known

    frappe.init(site=args.site, sites_path=sites_path)
    frappe.connect()

    try:
        app = args.app

        app_path = Path(frappe.get_app_path(app))
        live_dir = app_path / "live"
        live_dir.mkdir(exist_ok=True)

        errors = ErrorCollector()
        results: dict[str, tuple[int, int]] = {}

        doctype_filter = args.doctype.casefold() if args.doctype else None

        # Resolve configs for all doctypes (3-step: app → assets → skip)
        script_dir = Path(__file__).parent
        assets_dir = script_dir.parent / "assets"
        all_configs = discover_all_configs(live_dir, assets_dir)

        for config in all_configs:
            doctype = config["doctype"]
            if doctype_filter and doctype.casefold() != doctype_filter:
                continue
            result_key = slugify(doctype)
            results[result_key] = extract_doctype(
                live_dir, frappe, config, errors=errors
            )

        total_written = sum(w for w, _ in results.values())
        total_deleted = sum(d for _, d in results.values())

        for type_name, (w, d) in results.items():
            del_str = f" ({d} deleted)" if d else ""
            print(f"  {type_name}: {w}{del_str}")

        print(f"Total: {total_written} extracted, {total_deleted} deleted")

        if errors.has_errors():
            errors.print_summary()
            sys.exit(1)

    finally:
        frappe.destroy()


if __name__ == "__main__":
    main()
