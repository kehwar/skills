#!/usr/bin/env python3
"""
common.py
=========
Shared constants, HTTP helpers, HTML parsers, and file utilities used by
both build_index.py and build_docs.py.
"""

from __future__ import annotations

import re
import time
import urllib.parse
from pathlib import Path

import requests
import yaml
from bs4 import BeautifulSoup, NavigableString, Tag

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

INDEX_URL = (
    "https://help.sap.com/doc/089315d8d0f8475a9fc84fb919b501a3/10.0/en-US/"
    "SDKHelp/SAPbobsCOM_P.html"
)
BASE_URL = (
    "https://help.sap.com/doc/089315d8d0f8475a9fc84fb919b501a3/10.0/en-US/SDKHelp/"
)

SKILL_ROOT = Path(__file__).resolve().parent.parent
ASSETS_DIR = SKILL_ROOT / "assets"
DOCS_DIR = ASSETS_DIR / "docs"
INDEX_OUTPUT = ASSETS_DIR / "DI_API_INDEX.yaml"

# Seconds to wait between HTTP requests (be polite to SAP servers)
REQUEST_DELAY = 1.0

REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}

SECTION_KIND_MAP = {
    "SERVICE": "service",
    "CLASS": "class",
    "ENUMERATIONS": "enum",
}

# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------


def fetch_html(url: str, session: requests.Session) -> str:
    """Fetch a URL and return raw HTML text. Raises on HTTP errors."""
    resp = session.get(url, headers=REQUEST_HEADERS, timeout=30, verify=False)
    resp.raise_for_status()
    return resp.text


# ---------------------------------------------------------------------------
# Index parsing
# ---------------------------------------------------------------------------

_TABLE_HREF_RE = re.compile(r"\./[^/]+/([^/]+)\.htm$", re.IGNORECASE)


def _section_kind(heading_text: str) -> str | None:
    cleaned = heading_text.strip().upper()
    return SECTION_KIND_MAP.get(cleaned)


def _parse_desc_cell(desc_cell: Tag) -> tuple[str, list[str]]:
    """Return (description, related_tables) from an index row description cell."""
    related_tables: list[str] = []
    seen_tables: set[str] = set()
    for a in desc_cell.find_all("a"):
        href = a.get("href", "")
        m = _TABLE_HREF_RE.match(href)
        if m:
            table_name = a.get_text(strip=True).upper()
            if table_name and table_name not in seen_tables:
                seen_tables.add(table_name)
                related_tables.append(table_name)

    raw = desc_cell.get_text(" ", strip=True)
    description = re.sub(r"[\s\xa0]+", " ", raw).strip()
    return description, related_tables


def parse_index(html: str) -> list[dict]:
    """Parse the DI API index page HTML.

    Returns a list of dicts: {name, kind, description, related_tables, url, href}
    """
    soup = BeautifulSoup(html, "html.parser")
    entries: list[dict] = []
    current_kind: str | None = None
    seen: set[tuple[str, str]] = set()

    for elem in soup.find_all(["h3", "table"]):
        if elem.name == "h3":
            kind = _section_kind(elem.get_text())
            if kind:
                current_kind = kind
            continue

        if elem.name == "table" and current_kind:
            for row in elem.find_all("tr"):
                cells = row.find_all("td")
                if len(cells) < 2:
                    continue

                name_cell: Tag = cells[0]
                desc_cell: Tag = cells[1]

                link_tag = name_cell.find("a")
                name = (link_tag or name_cell).get_text(strip=True)
                href: str | None = None
                if link_tag and link_tag.get("href"):
                    href = link_tag["href"]

                description, related_tables = _parse_desc_cell(desc_cell)
                url = resolve_detail_url(href) if href else None

                key = (name, current_kind)
                if key in seen:
                    continue
                seen.add(key)

                entries.append(
                    {
                        "name": name,
                        "kind": current_kind,
                        "description": description,
                        "related_tables": related_tables,
                        "url": url,
                        "href": href,
                    }
                )

    return entries


# ---------------------------------------------------------------------------
# Detail page → YAML data
# ---------------------------------------------------------------------------

_FIELD_NAME_RE = re.compile(
    r"[Ff]ield\s+name\s*:\s*([A-Za-z_][A-Za-z0-9_]+)", re.IGNORECASE
)
_LENGTH_RE = re.compile(r"[Ll]ength\s*:\s*(\d+)\s*characters?", re.IGNORECASE)


def _sanitize_filename(name: str) -> str:
    return re.sub(r'[\\/:*?"<>|]', "_", name)


def _clean(text: str) -> str:
    return re.sub(r"[\s\xa0]+", " ", text).strip()


def _extract_field_name(desc_cell: Tag) -> str | None:
    m = _FIELD_NAME_RE.search(desc_cell.get_text(" "))
    return m.group(1) if m else None


def _extract_length(desc_cell: Tag) -> int | None:
    m = _LENGTH_RE.search(desc_cell.get_text(" "))
    return int(m.group(1)) if m else None


def _render_content_section(section: Tag, lines: list[str]) -> None:
    """Render a section's content as plain text lines."""
    has_block = any(
        isinstance(c, Tag) and c.name in ("p", "ul", "ol", "table", "div")
        for c in section.children
    )
    if not has_block:
        for a in section.find_all("a"):
            a.replace_with(a.get_text())
        text = _clean(section.get_text(" ", strip=True))
        if text:
            lines.append(text)
        return

    for child in section.children:
        if not isinstance(child, Tag):
            text = _clean(str(child))
            if text:
                lines.append(text)
            continue

        tag = child.name

        if tag == "a":
            text = _clean(child.get_text(" ", strip=True))
            if text:
                lines.append(text)

        elif tag == "p":
            for a in child.find_all("a"):
                a.replace_with(a.get_text())
            text = _clean(child.get_text(" ", strip=True))
            if text:
                lines.append(text)

        elif tag in ("ul", "ol"):
            for li in child.find_all("li", recursive=False):
                text = _clean(li.get_text(" ", strip=True))
                if text:
                    lines.append(f"- {text}")
            lines.append("")

        elif tag == "table":
            css = child.get("class") or []
            if "FilteredItemListTable" in css:
                _render_members_table_text(child, lines)

        elif tag == "div":
            _render_content_section(child, lines)


def _render_members_table_text(table: Tag, lines: list[str]) -> None:
    """Render a FilteredItemListTable as Name | Description text lines (unused in YAML path)."""
    for tr in table.find_all("tr"):
        link_cell = tr.find("td", class_="LinkCell")
        desc_cell = tr.find("td", class_="DescriptionCell")
        if not link_cell:
            continue
        a = link_cell.find("a")
        member_name = a.get_text(strip=True) if a else _clean(link_cell.get_text())
        desc = _clean(desc_cell.get_text(" ", strip=True)) if desc_cell else ""
        lines.append(f"- {member_name}: {desc}")


def _section_to_text(section: Tag) -> str:
    lines: list[str] = []
    _render_content_section(section, lines)
    return "\n".join(l for l in lines if l).strip()


def _extract_members_from_table(table: Tag, base_url: str) -> list[dict]:
    """Extract members from a FilteredItemListTable as structured dicts."""
    members = []
    for tr in table.find_all("tr"):
        link_cell = tr.find("td", class_="LinkCell")
        desc_cell = tr.find("td", class_="DescriptionCell")
        if not link_cell:
            continue
        a = link_cell.find("a")
        member_name = a.get_text(strip=True) if a else _clean(link_cell.get_text())
        href = a.get("href", "") if a else ""
        member_url = urllib.parse.urljoin(base_url, href) if href else None
        desc = _clean(desc_cell.get_text(" ", strip=True)) if desc_cell else ""
        member: dict = {"name": member_name}
        if desc:
            member["description"] = desc
        if member_url:
            member["url"] = member_url
        if desc_cell:
            field_name = _extract_field_name(desc_cell)
            if field_name and field_name != member_name:
                member["field_name"] = field_name
            length = _extract_length(desc_cell)
            if length is not None:
                member["length"] = length
        members.append(member)
    return members


def html_to_data(html: str, name: str, url: str, kind: str) -> dict:
    """Convert a SAP DI API detail page HTML to a structured dict."""
    soup = BeautifulSoup(html, "html.parser")

    h2 = soup.select_one("li.resource .heading h2")
    title = re.sub(r"[\s\xa0]+", " ", h2.get_text(" ", strip=True)) if h2 else name

    data: dict = {"name": name, "title": title, "kind": kind, "url": url}

    for method in soup.select(".method"):
        heading = method.select_one(".heading h3")
        section = method.select_one(".section")
        if not heading or not section:
            continue

        section_name = re.sub(r"[\s\xa0]+", " ", heading.get_text(" ", strip=True))

        if section_name in ("Object Model", "See Also", "Example"):
            continue

        if section_name == "Description":
            text = re.sub(r"\s+", " ", _section_to_text(section)).strip()
            if text:
                data["description"] = text
        elif section_name == "Remarks":
            text = re.sub(r"\s+", " ", _section_to_text(section)).strip()
            if text:
                data["remarks"] = text

    return data


def parse_members_page(html: str, base_url: str) -> dict:
    """Extract methods/properties/values from a _members.html page."""
    soup = BeautifulSoup(html, "html.parser")
    result: dict = {}
    for method in soup.select(".method"):
        heading = method.select_one(".heading h3")
        section = method.select_one(".section")
        if not heading or not section:
            continue
        section_name = re.sub(r"[\s\xa0]+", " ", heading.get_text(" ", strip=True))
        table = section.find("table", class_="FilteredItemListTable")
        if not table:
            continue
        members = _extract_members_from_table(table, base_url)
        if "Method" in section_name:
            result["methods"] = members
        elif "Propert" in section_name:
            result["properties"] = members
        elif "Value" in section_name or "Member" in section_name:
            result["values"] = members
    return result


def extract_members_href(html: str) -> str | None:
    """Return the _members.html href from the See Also section, if present."""
    soup = BeautifulSoup(html, "html.parser")
    for method in soup.select(".method"):
        heading = method.select_one(".heading h3")
        if not heading or "See Also" not in heading.get_text():
            continue
        section = method.select_one(".section")
        if section:
            for a in section.find_all("a"):
                href = a.get("href", "")
                if "_members.html" in href:
                    return href
    return None


# ---------------------------------------------------------------------------
# File utilities
# ---------------------------------------------------------------------------


def resolve_detail_url(href: str) -> str:
    if href.startswith("http"):
        return href
    return urllib.parse.urljoin(BASE_URL, href)


def kind_dir(kind: str) -> Path:
    return DOCS_DIR / kind


def doc_path(name: str, kind: str) -> str:
    return f"{kind}/{_sanitize_filename(name)}.yaml"


def _write_yaml_doc(target: Path, data: dict) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("w", encoding="utf-8") as f:
        yaml.dump(
            data,
            f,
            allow_unicode=True,
            sort_keys=False,
            default_flow_style=False,
            width=float("inf"),
        )


def _index_record(entry: dict, dp: str | None) -> dict:
    record: dict = {"name": entry["name"], "kind": entry["kind"]}
    description = entry.get("description") or ""
    if description:
        record["description"] = description
    record["doc_path"] = dp
    record["url"] = entry.get("url")
    tables = entry.get("related_tables") or []
    if tables:
        record["related_tables"] = tables
    return record


def write_yaml_index(entries: list[dict], script_name: str = "build_index.py") -> None:
    INDEX_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with INDEX_OUTPUT.open("w", encoding="utf-8") as f:
        f.write(
            f"# SAP DI API Index — auto-generated by scripts/{script_name}\n"
            "# Keys: name, kind (service|class|enum), description, doc_path, url, related_tables\n"
        )
        yaml.dump(
            entries,
            f,
            allow_unicode=True,
            sort_keys=False,
            default_flow_style=False,
            width=float("inf"),
        )
    print(f"Written → {INDEX_OUTPUT.relative_to(SKILL_ROOT)}")


def fetch_and_cache_page(
    entry: dict, session: requests.Session, *, dry_run: bool = False
) -> str:
    """Fetch the detail page for ``entry`` and save as YAML. Returns relative doc_path."""
    href = entry.get("href")
    kind = entry["kind"]
    name = entry["name"]

    if not href:
        target = kind_dir(kind) / f"{_sanitize_filename(name)}.yaml"
        if not target.exists():
            stub = {"name": name, "kind": kind}
            desc = entry.get("description", "")
            if desc:
                stub["description"] = desc
            stub["note"] = "No dedicated reference page available."
            _write_yaml_doc(target, stub)
        return doc_path(name, kind)

    url = resolve_detail_url(href)
    target = kind_dir(kind) / f"{_sanitize_filename(name)}.yaml"

    if target.exists():
        return doc_path(name, kind)

    if dry_run:
        return doc_path(name, kind)

    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        time.sleep(REQUEST_DELAY)
        html = fetch_html(url, session)
        data = html_to_data(html, name, url, kind)

        members_href = extract_members_href(html)
        if members_href:
            members_url = urllib.parse.urljoin(url, members_href)
            try:
                time.sleep(REQUEST_DELAY)
                members_html = fetch_html(members_url, session)
                members_data = parse_members_page(members_html, members_url)
                data.update(members_data)
            except Exception:  # noqa: BLE001
                pass

        _write_yaml_doc(target, data)
        return doc_path(name, kind)
    except Exception as exc:  # noqa: BLE001
        print(f"  WARNING: failed to fetch {url}: {exc}")
        stub = {"name": name, "kind": kind, "url": url}
        desc = entry.get("description", "")
        if desc:
            stub["description"] = desc
        stub["error"] = str(exc)
        _write_yaml_doc(target, stub)
        return doc_path(name, kind)


def build_index_from_cache(entries: list[dict]) -> list[dict]:
    result = []
    for entry in entries:
        dp = doc_path(entry["name"], entry["kind"])
        full = DOCS_DIR / dp
        result.append(_index_record(entry, dp if full.exists() else None))
    return result
