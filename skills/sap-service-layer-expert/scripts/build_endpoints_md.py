#!/usr/bin/env python3
"""
build_endpoints_md.py
=====================
Generate ENDPOINTS.md from the bundled OpenAPI spec (assets/spec/).

Usage:
    python scripts/build_endpoints_md.py

Output:
    ENDPOINTS.md  (written to the skill root, next to SKILL.md)
"""

from __future__ import annotations

import os
import re
import textwrap
from pathlib import Path

import yaml

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SKILL_ROOT = Path(__file__).resolve().parent.parent
SPEC_DIR = SKILL_ROOT / "assets" / "spec"
PATHS_DIR = SPEC_DIR / "paths"
OUTPUT_FILE = SKILL_ROOT / "ENDPOINTS.md"

# ---------------------------------------------------------------------------
# Curated module → resource list
# Resources listed here are extracted from the spec; resources NOT in this
# list are omitted from ENDPOINTS.md (they can still be used — look them up
# directly in assets/spec/paths/).
# ---------------------------------------------------------------------------
MODULES: list[tuple[str, list[str]]] = [
    (
        "Business Partners",
        [
            "BusinessPartners",
        ],
    ),
    (
        "Items & Inventory",
        [
            "Items",
            "ItemGroups",
            "Warehouses",
            "InventoryGenEntries",
            "GoodsReturnRequest",
            "StockTransfers",
            "StockTransferDrafts",
        ],
    ),
    (
        "Sales",
        [
            "Quotations",
            "Orders",
            "DeliveryNotes",
            "Returns",
            "Invoices",
            "CreditNotes",
            "DownPayments",
            "Drafts",
        ],
    ),
    (
        "Purchasing",
        [
            "PurchaseQuotations",
            "PurchaseOrders",
            "PurchaseDeliveryNotes",
            "PurchaseReturns",
            "PurchaseInvoices",
            "PurchaseCreditNotes",
            "PurchaseDownPayments",
        ],
    ),
    (
        "Payments & Banking",
        [
            "IncomingPayments",
            "OutgoingPayments",
            "Deposits",
            "CashFlowAssignments",
        ],
    ),
    (
        "Accounting",
        [
            "JournalEntries",
            "ChartOfAccounts",
            "CostCenters",
            "ProfitCenters",
        ],
    ),
    (
        "Pricing",
        [
            "PriceLists",
            "SpecialPrices",
            "SpecialPriceDataAreas",
        ],
    ),
    (
        "Master Data",
        [
            "ContactEmployees",
            "Currencies",
            "PaymentTermsTypes",
            "SalesTaxCodes",
            "VatGroups",
            "Countries",
            "UnitOfMeasurements",
            "UnitOfMeasurementGroups",
            "Employees",
            "SalesPersons",
            "UserDefinedFields",
        ],
    ),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_path_yaml(resource: str, suffix: str = "") -> dict:
    """Load a path YAML file.  suffix is '' | '_id' | '_id_<Action>'."""
    fname = f"{resource}{suffix}.yaml"
    fpath = PATHS_DIR / fname
    if not fpath.exists():
        return {}
    with open(fpath) as f:
        return yaml.safe_load(f) or {}


def _get_description(data: dict) -> str:
    """Extract x-resource-description from the first available method."""
    for method in ("get", "post", "patch", "put", "delete"):
        if method in data:
            desc = data[method].get("x-resource-description", "")
            if desc:
                # Trim boilerplate prefix
                desc = re.sub(
                    r"^This entity enables you to manipulate '[^']+'\.\s*",
                    "",
                    desc,
                )
                return desc.strip()
    return ""


def _get_collection_methods(data: dict) -> list[str]:
    return [m.upper() for m in ("get", "post") if m in data]


def _get_single_methods(data: dict) -> list[str]:
    return [m.upper() for m in ("get", "patch", "put", "delete") if m in data]


def _get_action_functions(resource: str) -> list[str]:
    """Return sorted list of action function names for this resource."""
    prefix = f"{resource}_id_"
    actions = []
    for fname in sorted(PATHS_DIR.glob(f"{prefix}*.yaml")):
        action = fname.stem[len(prefix):]
        actions.append(action)
    return actions


def _find_resource_in_spec(resource: str) -> bool:
    """Return True if this resource exists at all in the spec paths directory."""
    return (PATHS_DIR / f"{resource}.yaml").exists()


def _describe_key(resource: str) -> str:
    """Determine key type (string vs integer) from the x-example-url in _id path file.

    SAP spec always declares parameters as type:string but the example URL
    reveals whether the key is quoted (string) or bare (integer):
      BusinessPartners('c001')  → string
      Orders(123)               → integer
    """
    data = _load_path_yaml(resource, "_id")
    for method in ("get", "patch", "put", "delete"):
        if method in data:
            example_url = data[method].get("x-example-url", "")
            # Match patterns like Resource(123) vs Resource('c001')
            m = re.search(r"\(([^)]+)\)$", example_url)
            if m:
                key_sample = m.group(1)
                # If the sample is wrapped in quotes it's a string key
                if key_sample.startswith("'") or key_sample.startswith('"'):
                    return "string"
                return "integer"
    return "integer"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def build() -> None:
    lines: list[str] = []

    lines.append("# SAP Service Layer — Endpoints Reference")
    lines.append("")
    lines.append(
        "Curated index of the most commonly used Service Layer resources, "
        "grouped by module. For the complete list of ~600 resources, scan "
        "`assets/spec/paths/`."
    )
    lines.append("")
    lines.append(
        "> **How to use**: every resource has a collection URL "
        "(`/Resource`) and a single-record URL (`/Resource({key})`). "
        "Action functions are called with `POST /Resource({key})/{Action}` "
        "and an empty JSON body `{}`."
    )
    lines.append("")

    for module_name, resources in MODULES:
        lines.append(f"## {module_name}")
        lines.append("")

        for resource in resources:
            if not _find_resource_in_spec(resource):
                # Skip resources not present in the spec
                continue

            coll_data = _load_path_yaml(resource)
            single_data = _load_path_yaml(resource, "_id")

            coll_methods = _get_collection_methods(coll_data)
            single_methods = _get_single_methods(single_data)
            actions = _get_action_functions(resource)

            description = _get_description(coll_data) or _get_description(single_data)
            key_type = _describe_key(resource)

            lines.append(f"### `{resource}`")
            lines.append("")
            if description:
                lines.append(textwrap.fill(description, width=100))
                lines.append("")

            # Endpoints table
            lines.append("| URL | Methods |")
            lines.append("|-----|---------|")
            if coll_methods:
                lines.append(f"| `/{resource}` | {', '.join(coll_methods)} |")
            if single_methods:
                key_fmt = "'{key}'" if key_type == "string" else "{key}"
                lines.append(
                    f"| `/{resource}({key_fmt})` | {', '.join(single_methods)} |"
                )
            for action in actions:
                key_fmt = "'{key}'" if key_type == "string" else "{key}"
                lines.append(
                    f"| `/{resource}({key_fmt})/{action}` | POST |"
                )
            lines.append("")

        lines.append("")

    output = "\n".join(lines)
    OUTPUT_FILE.write_text(output, encoding="utf-8")
    print(f"Written: {OUTPUT_FILE}")
    print(f"Lines:   {len(lines)}")


if __name__ == "__main__":
    build()
