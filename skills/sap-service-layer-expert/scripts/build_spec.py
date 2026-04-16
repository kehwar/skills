#!/usr/bin/env python3
"""
build_spec.py
=============
Fetch the SAP Service Layer API Reference HTML page and regenerate the
per-path YAML files under ``assets/spec/paths/`` and the root
``assets/spec/openapi.yaml``.

Source page
-----------
https://help.sap.com/doc/056f69366b5345a386bb8149f1700c19/10.0/en-US/Service%20Layer%20API%20Reference.html

The page is a static Swagger-style HTML document (not a Swagger UI that
loads an external JSON spec).  Every operation is rendered inside a tree of
``<li class="resource">`` → ``<div class="method">`` →
``<li class="X operation">`` elements.

Usage
-----
    # Full rebuild from live SAP Help Portal page:
    python scripts/build_spec.py

    # Use a previously saved local copy (skip the network fetch):
    python scripts/build_spec.py --input /path/to/saved.html

    # Save the fetched HTML for inspection / offline rebuilds:
    python scripts/build_spec.py --save-html /tmp/sap_sl.html

Output
------
    assets/spec/openapi.yaml          — root spec with $ref entries
    assets/spec/paths/*.yaml          — one file per distinct path URL

The script is idempotent: running it twice produces the same output.
"""

from __future__ import annotations

import argparse
import html as html_module
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import requests
import yaml
from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SOURCE_URL = (
    "https://help.sap.com/doc/056f69366b5345a386bb8149f1700c19/10.0/en-US/"
    "Service%20Layer%20API%20Reference.html"
)
BASE_URL = "https://localhost:50000/b1s/v2"

SKILL_ROOT = Path(__file__).resolve().parent.parent
SPEC_DIR = SKILL_ROOT / "assets" / "spec"
PATHS_DIR = SPEC_DIR / "paths"

STANDARD_RESPONSES = {
    "200": {"description": "Success"},
    "204": {"description": "No content (update/delete)"},
    "400": {"description": "Bad request"},
    "401": {"description": "Unauthorized"},
    "404": {"description": "Not found"},
}

REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _clean_text(text: str) -> str:
    """Strip whitespace, collapse internal whitespace, and unescape HTML entities."""
    # Collapse \r, \n, \t and multiple spaces into a single space
    text = re.sub(r"[\r\n\t]+", " ", text)
    text = re.sub(r" {2,}", " ", text)
    return html_module.unescape(text.strip())


def _path_to_filename(path_str: str) -> str:
    """Convert a path string from the HTML to a YAML filename (no extension).

    Rules
    -----
    ``Orders``             → ``Orders``
    ``Orders(id)``         → ``Orders_id``
    ``Orders(id)/Close``   → ``Orders_id_Close``
    ``OrdersService_Foo``  → ``OrdersService_Foo``
    """
    name = path_str
    # Replace any (placeholder) with _placeholder
    name = _PARAM_RE.sub(lambda m: f"_{m.group(1)}", name)
    # Replace / with _
    name = name.replace("/", "_")
    return name


# Matches any single-word path parameter placeholder like (id) or (guid)
_PARAM_RE = re.compile(r"\(([A-Za-z_][A-Za-z0-9_]*)\)")


def _path_to_openapi_key(path_str: str) -> str:
    """Convert a path string to the OpenAPI path key.

    Rules
    -----
    ``Orders``                  → ``/Orders``
    ``Orders(id)``              → ``/Orders({id})``
    ``Orders(id)/Close``        → ``/Orders({id})/Close``
    ``ShortLinkMappings(guid)`` → ``/ShortLinkMappings({guid})``
    ``OrdersService_Foo``       → ``/OrdersService_Foo``
    """
    return "/" + _PARAM_RE.sub(lambda m: f"({{{m.group(1)}}})", path_str)


def _path_param_name(path_str: str) -> str | None:
    """Return the path parameter name if this path has a placeholder, else None."""
    m = _PARAM_RE.search(path_str)
    return m.group(1) if m else None


def _build_schema_from_json(obj, *, depth: int = 0) -> dict:
    """Recursively build a minimal OpenAPI ``schema`` dict from a JSON value."""
    if isinstance(obj, dict):
        props = {}
        for key, val in obj.items():
            props[key] = _build_schema_from_json(val, depth=depth + 1)
        return {"type": "object", "properties": props}
    if isinstance(obj, list):
        if obj:
            item_schema = _build_schema_from_json(obj[0], depth=depth + 1)
        else:
            item_schema = {"type": "object"}
        return {"type": "array", "items": item_schema}
    # Scalar — preserve the actual JSON type
    if isinstance(obj, bool):
        return {"type": "boolean", "example": obj}
    if isinstance(obj, int):
        return {"type": "integer", "example": obj}
    if isinstance(obj, float):
        return {"type": "number", "example": obj}
    return {"type": "string", "example": obj}


def _parse_example_pre(pre_text: str) -> tuple[str, dict | None]:
    """Parse a ``<pre>`` example block.

    Returns ``(example_url, body_dict_or_None)``.

    The pre_text looks like:
        POST https://host/b1s/v2/Orders
        {
            "CardCode": "c001",
            ...
        }
    Tags like ``<br>`` have already been stripped by BeautifulSoup.
    """
    lines = pre_text.strip().splitlines()
    if not lines:
        return "", None

    # First non-empty line is the example URL
    example_url = ""
    body_start = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped:
            example_url = stripped
            body_start = i + 1
            break

    # Remaining lines (if any) may be a JSON body
    body_lines = [ln for ln in lines[body_start:] if ln.strip()]
    body_text = "\n".join(body_lines)
    body_dict = None
    if body_text.startswith("{") or body_text.startswith("["):
        try:
            body_dict = json.loads(body_text)
        except json.JSONDecodeError:
            pass

    return example_url, body_dict


# ---------------------------------------------------------------------------
# Operation record
# ---------------------------------------------------------------------------


class Operation:
    """Holds all data for one HTTP verb + path combination."""

    __slots__ = (
        "resource_name",
        "resource_description",
        "http_method",
        "path_str",
        "description",
        "example_url",
        "body",
    )

    def __init__(
        self,
        *,
        resource_name: str,
        resource_description: str,
        http_method: str,
        path_str: str,
        description: str,
        example_url: str,
        body: dict | None,
    ) -> None:
        self.resource_name = resource_name
        self.resource_description = resource_description
        self.http_method = http_method
        self.path_str = path_str
        self.description = description
        self.example_url = example_url
        self.body = body

    def to_dict(self) -> dict:
        """Render as the OpenAPI operation object."""
        method = self.http_method.lower()
        tag = self.resource_name
        path_label = self.path_str  # e.g. "Orders" or "Orders(id)/Close"

        op: dict = {
            "tags": [tag],
            "summary": f"{self.http_method} {path_label}",
            "description": self.description,
            "operationId": f"{method}_{path_label.replace('/', '_').replace('(', '_').replace(')', '')}",
            "responses": {k: dict(v) for k, v in STANDARD_RESPONSES.items()},
        }

        param_name = _path_param_name(self.path_str)
        if param_name:
            op["parameters"] = [
                {
                    "name": param_name,
                    "in": "path",
                    "required": True,
                    "schema": {"type": "string"},
                }
            ]

        if self.body is not None:
            schema = _build_schema_from_json(self.body)
            op["requestBody"] = {
                "required": True,
                "content": {
                    "application/json": {
                        "schema": schema,
                        "example": self.body,
                    }
                },
            }

        if self.example_url:
            op["x-example-url"] = self.example_url
        if self.resource_description:
            op["x-resource-description"] = self.resource_description

        return {method: op}


# ---------------------------------------------------------------------------
# HTML parsing
# ---------------------------------------------------------------------------


def parse_operations(html_content: str) -> list[Operation]:
    """Parse all operations from the SAP Service Layer API Reference HTML."""
    soup = BeautifulSoup(html_content, "html.parser")
    operations: list[Operation] = []

    for resource_li in soup.find_all("li", class_="resource"):
        # --- Resource name ---
        heading_div = resource_li.find("div", class_="heading")
        if not heading_div:
            continue
        h2 = heading_div.find("h2")
        if not h2:
            continue
        resource_name = _clean_text(h2.get_text())

        # --- Resource-level description (first <p> inside <div class="methods">) ---
        methods_div = resource_li.find("div", class_="methods")
        resource_description = ""
        if methods_div:
            first_p = methods_div.find("p", recursive=False)
            if first_p:
                resource_description = _clean_text(first_p.get_text())

        # --- Operations ---
        if not methods_div:
            continue

        for method_div in methods_div.find_all("div", class_="method"):
            for op_li in method_div.find_all("li", class_=re.compile(r"\boperation\b")):
                # HTTP method from class list, e.g. "get operation"
                css_classes = op_li.get("class", [])
                http_method = None
                for cls in css_classes:
                    if cls in ("get", "post", "patch", "put", "delete"):
                        http_method = cls.upper()
                        break
                if not http_method:
                    continue

                # Path string from <span class="path"><a>
                path_span = op_li.find("span", class_="path")
                if not path_span:
                    continue
                path_a = path_span.find("a")
                if not path_a:
                    continue
                path_str = _clean_text(path_a.get_text())

                # Operation description from <div class="content"><p>
                content_div = op_li.find("div", class_="content")
                op_description = ""
                if content_div:
                    desc_p = content_div.find("p")
                    if desc_p:
                        op_description = _clean_text(desc_p.get_text())

                # Example from <pre>
                example_url = ""
                body: dict | None = None
                if content_div:
                    pre = content_div.find("pre")
                    if pre:
                        pre_text = pre.get_text(separator="\n")
                        example_url, body = _parse_example_pre(pre_text)

                operations.append(
                    Operation(
                        resource_name=resource_name,
                        resource_description=resource_description,
                        http_method=http_method,
                        path_str=path_str,
                        description=op_description,
                        example_url=example_url,
                        body=body,
                    )
                )

    return operations


# ---------------------------------------------------------------------------
# YAML serialisation
# ---------------------------------------------------------------------------


class _LiteralStr(str):
    """Marker class: serialised as a YAML literal block scalar."""


def _literal_representer(dumper: yaml.Dumper, data: _LiteralStr) -> yaml.Node:
    return dumper.represent_scalar("tag:yaml.org,2002:str", data, style="|")


class _FlowDict(dict):
    """Marker class: serialised on one line."""


class _FlowList(list):
    """Marker class: serialised on one line."""


def _setup_yaml_dumper() -> type[yaml.Dumper]:
    class _Dumper(yaml.Dumper):
        pass

    _Dumper.add_representer(_LiteralStr, _literal_representer)

    # str representer: avoid unwanted quoting for plain strings
    def _str_representer(dumper: yaml.Dumper, data: str) -> yaml.Node:
        # Strings that look like dates or contain special YAML chars need quoting
        if re.match(r"^\d{4}-\d{2}-\d{2}$", data):
            return dumper.represent_scalar("tag:yaml.org,2002:str", data, style="'")
        return dumper.represent_scalar("tag:yaml.org,2002:str", data)

    _Dumper.add_representer(str, _str_representer)
    # Preserve insertion order for dicts
    _Dumper.add_representer(
        dict,
        lambda dumper, data: dumper.represent_mapping(
            "tag:yaml.org,2002:map", data.items()
        ),
    )
    return _Dumper


_YAML_DUMPER = _setup_yaml_dumper()


def _to_yaml(data: object) -> str:
    return yaml.dump(
        data,
        Dumper=_YAML_DUMPER,
        allow_unicode=True,
        default_flow_style=False,
        sort_keys=False,
        width=120,
    )


# ---------------------------------------------------------------------------
# Spec writer
# ---------------------------------------------------------------------------


def write_spec(operations: list[Operation], paths_dir: Path, spec_dir: Path) -> None:
    """Write per-path YAML files and the root ``openapi.yaml``."""
    paths_dir.mkdir(parents=True, exist_ok=True)

    # Group operations by path_str (same path, different HTTP verbs → same file)
    by_path: dict[str, list[Operation]] = defaultdict(list)
    for op in operations:
        by_path[op.path_str].append(op)

    # Collect openapi paths in the order they appear in the HTML
    # (deduplicated: first occurrence wins for ordering)
    openapi_paths: dict[str, str] = {}  # openapi_key → relative $ref

    seen_paths: set[str] = set()
    for op in operations:
        path_str = op.path_str
        if path_str in seen_paths:
            continue
        seen_paths.add(path_str)

        filename = _path_to_filename(path_str) + ".yaml"
        openapi_key = _path_to_openapi_key(path_str)
        openapi_paths[openapi_key] = f"paths/{filename}"

    # Write per-path YAML files
    written = 0
    for path_str, ops in by_path.items():
        filename = _path_to_filename(path_str) + ".yaml"
        out_path = paths_dir / filename

        # Merge all methods into a single dict for the path
        path_doc: dict = {}
        for op in ops:
            path_doc.update(op.to_dict())

        out_path.write_text(_to_yaml(path_doc), encoding="utf-8")
        written += 1

    print(f"Written {written} path YAML files to {paths_dir}")

    # Write root openapi.yaml
    openapi_doc = {
        "openapi": "3.0.3",
        "info": {
            "title": "SAP Business One Service Layer API",
            "version": "10.0",
            "description": (
                "OData v4 REST API exposed by SAP Business One Service Layer. "
                f"Base URL: {BASE_URL}"
            ),
        },
        "servers": [{"url": BASE_URL}],
        "components": {
            "securitySchemes": {
                "cookieAuth": {
                    "type": "apiKey",
                    "in": "cookie",
                    "name": "B1SESSION",
                    "description": "Session cookie obtained from POST /Login",
                }
            }
        },
        "security": [{"cookieAuth": []}],
        "paths": {key: {"$ref": ref} for key, ref in openapi_paths.items()},
    }

    openapi_file = spec_dir / "openapi.yaml"
    openapi_file.write_text(_to_yaml(openapi_doc), encoding="utf-8")
    print(f"Written {openapi_file}")
    print(f"Total paths in openapi.yaml: {len(openapi_paths)}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Regenerate the SAP Service Layer OpenAPI spec from the SAP Help Portal HTML."
    )
    parser.add_argument(
        "--input",
        metavar="FILE",
        help="Use a local HTML file instead of fetching from the internet.",
    )
    parser.add_argument(
        "--save-html",
        metavar="FILE",
        help="Save the fetched HTML to a file for offline/debug use.",
    )
    args = parser.parse_args()

    # --- Fetch / load HTML ---
    if args.input:
        print(f"Loading HTML from {args.input} …")
        html_content = Path(args.input).read_text(encoding="utf-8", errors="replace")
    else:
        print(f"Fetching {SOURCE_URL} …")
        resp = requests.get(SOURCE_URL, headers=REQUEST_HEADERS, timeout=60)
        resp.raise_for_status()
        html_content = resp.text
        print(f"  {len(html_content):,} bytes received")

        if args.save_html:
            Path(args.save_html).write_text(html_content, encoding="utf-8")
            print(f"  HTML saved to {args.save_html}")

    # --- Parse ---
    print("Parsing operations …")
    operations = parse_operations(html_content)
    unique_paths = len({op.path_str for op in operations})
    print(f"  {len(operations)} operations across {unique_paths} distinct paths")

    # --- Write ---
    write_spec(operations, PATHS_DIR, SPEC_DIR)
    print("Done.")


if __name__ == "__main__":
    main()
