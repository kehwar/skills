# SAP Service Layer — Session Pattern

## Environment variables

| Variable | Description | Example |
|---|---|---|
| `SAP_SL_HOST` | Base URL including port, no trailing slash | `https://192.168.1.100:50000` |
| `SAP_SL_USER` | SAP B1 username | `manager` |
| `SAP_SL_PASSWORD` | SAP B1 password | `1234` |
| `SAP_SL_COMPANY_DB` | Company database name | `SBODEMO` |

Load from a `.env` file using `python-dotenv`:

```python
from dotenv import load_dotenv
import os

load_dotenv()

SAP_SL_HOST     = os.environ["SAP_SL_HOST"]
SAP_SL_USER     = os.environ["SAP_SL_USER"]
SAP_SL_PASSWORD = os.environ["SAP_SL_PASSWORD"]
SAP_SL_COMPANY_DB = os.environ["SAP_SL_COMPANY_DB"]
```

## Login / logout flow

1. **POST** `{BASE_URL}/b1s/v2/Login` with body `{"UserName": ..., "Password": ..., "CompanyDB": ...}`
2. SAP returns a session cookie `B1SESSION` — send it in every subsequent request.
3. **POST** `{BASE_URL}/b1s/v2/Logout` (with the session cookie) to end the session.

SAP sessions time out after **30 minutes** of inactivity by default.

## Context-manager wrapper (canonical pattern)

```python
import os
import urllib3
import requests
from dotenv import load_dotenv

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
load_dotenv()


class ServiceLayer:
    """Thin context-manager wrapper around SAP Service Layer REST API."""

    BASE_URL = os.environ["SAP_SL_HOST"].rstrip("/") + "/b1s/v2"

    def __init__(self):
        self.session = requests.Session()
        self.session.verify = False  # SAP SL uses self-signed certs by default

    def __enter__(self):
        resp = self.session.post(
            f"{self.BASE_URL}/Login",
            json={
                "UserName": os.environ["SAP_SL_USER"],
                "Password": os.environ["SAP_SL_PASSWORD"],
                "CompanyDB": os.environ["SAP_SL_COMPANY_DB"],
            },
        )
        resp.raise_for_status()
        return self

    def __exit__(self, *_):
        try:
            self.session.post(f"{self.BASE_URL}/Logout")
        finally:
            self.session.close()

    # ------------------------------------------------------------------ #
    # Helpers                                                              #
    # ------------------------------------------------------------------ #

    def _raise(self, resp: requests.Response) -> None:
        """Raise a descriptive RuntimeError on non-2xx responses."""
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
        # 204 No Content → return empty dict
        return resp.json() if resp.content else {}

    def patch(self, path: str, payload: dict) -> None:
        """PATCH updates only the supplied fields. Returns None (204)."""
        resp = self.session.patch(f"{self.BASE_URL}/{path}", json=payload)
        self._raise(resp)

    def delete(self, path: str) -> None:
        resp = self.session.delete(f"{self.BASE_URL}/{path}")
        self._raise(resp)
```

## Usage example

```python
with ServiceLayer() as sl:
    bp = sl.get("BusinessPartners('C001')")
    print(bp["CardName"])

    sl.patch("BusinessPartners('C001')", {"Phone1": "555-1234"})

    new_doc = sl.post("Orders", {...})
    print("Created DocEntry:", new_doc["DocEntry"])
```

## Error extraction path

SAP Service Layer error responses follow this JSON shape:

```json
{
  "error": {
    "code": -2028,
    "message": {
      "lang": "en-us",
      "value": "Business partner not found [OCRD.CardCode]"
    }
  }
}
```

The `_raise()` helper above extracts `error.message.value` for you.
