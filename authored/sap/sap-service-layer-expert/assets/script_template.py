"""
SAP Service Layer script template.

Usage
-----
1. Copy this file and rename it: e.g. ``patch_business_partners_run.py``
2. Create a companion data file: e.g. ``patch_business_partners_data.json``
3. Implement ``main(data, sl)`` with your logic.
4. Run: ``python patch_business_partners_run.py``

Output contract
---------------
Every agent-produced script ships two files:

    <operation>_data.json   — pure data (no credentials, no boilerplate)
    <operation>_run.py      — this template with main() filled in

Both files live under ``.temp/`` at the main repo root.
The ``__main__`` block below loads ``_data.json`` automatically;
just keep the naming convention.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

import requests
import urllib3
from dotenv import load_dotenv

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Service Layer session
# ---------------------------------------------------------------------------


class ServiceLayer:
    """Thin context-manager wrapper around SAP Service Layer REST API."""

    BASE_URL = (lambda u: f"{u.scheme}://{u.netloc}/b1s/v2")(
        urlparse(os.environ["SAP_SL_HOST"])
    )

    def __init__(self):
        self.session = requests.Session()
        self.session.verify = False

    def __enter__(self) -> "ServiceLayer":
        resp = self.session.post(
            f"{self.BASE_URL}/Login",
            json={
                "UserName": os.environ["SAP_SL_USER"],
                "Password": os.environ["SAP_SL_PASSWORD"],
                "CompanyDB": os.environ["SAP_SL_COMPANY_DB"],
            },
        )
        resp.raise_for_status()
        log.info("Logged in to %s", self.BASE_URL)
        return self

    def __exit__(self, *_):
        try:
            self.session.post(f"{self.BASE_URL}/Logout")
            log.info("Logged out")
        finally:
            self.session.close()

    # ------------------------------------------------------------------ #
    # HTTP helpers — all raise RuntimeError on non-2xx                    #
    # ------------------------------------------------------------------ #

    def _raise(self, resp: requests.Response) -> None:
        if not resp.ok:
            try:
                msg = resp.json().get("error", {}).get("message", {})
                if isinstance(msg, dict):
                    msg = msg.get("value", resp.text)
            except Exception:
                msg = resp.text
            raise RuntimeError(f"SL {resp.status_code}: {msg}")

    def get(self, path: str, **params) -> dict:
        resp = self.session.get(f"{self.BASE_URL}/{path}", params=params)
        self._raise(resp)
        return resp.json()

    def post(self, path: str, payload: dict) -> dict:
        resp = self.session.post(f"{self.BASE_URL}/{path}", json=payload)
        self._raise(resp)
        return resp.json() if resp.content else {}

    def patch(self, path: str, payload: dict) -> None:
        """PATCH merges only the supplied fields (partial update). Returns None."""
        resp = self.session.patch(f"{self.BASE_URL}/{path}", json=payload)
        self._raise(resp)

    def delete(self, path: str) -> None:
        resp = self.session.delete(f"{self.BASE_URL}/{path}")
        self._raise(resp)


# ---------------------------------------------------------------------------
# Business logic — implement this function
# ---------------------------------------------------------------------------


def main(data: dict, sl: ServiceLayer) -> None:
    """
    Implement the operation here.

    ``data``  — contents of the companion _data.json file
    ``sl``    — authenticated ServiceLayer instance
    """
    # TODO: implement
    raise NotImplementedError("Implement main() before running this script")


# ---------------------------------------------------------------------------
# Entry point — loads _data.json and runs main() inside a managed session
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Derive companion data file name from this script's name
    # e.g. patch_business_partners_run.py → patch_business_partners_data.json
    script_name = Path(sys.argv[0]).stem  # e.g. "patch_business_partners_run"
    data_name = script_name.removesuffix("_run") + "_data.json"
    data_path = Path(__file__).parent / data_name

    if not data_path.exists():
        log.error("Data file not found: %s", data_path)
        sys.exit(1)

    with open(data_path) as f:
        data = json.load(f)

    with ServiceLayer() as sl:
        main(data, sl)
