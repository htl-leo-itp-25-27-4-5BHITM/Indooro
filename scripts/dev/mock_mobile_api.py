#!/usr/bin/env python3
"""Minimal Mobile-API-Mock fuer Simulator-Pruefungen ohne Backend.

    python3 scripts/dev/mock_mobile_api.py [port]            # Default 18090, nur localhost
    MOCK_HOST=0.0.0.0 python3 scripts/dev/mock_mobile_api.py   # fuer ein iPhone im selben WLAN
    MOCK_DATASET=ui-test-store python3 scripts/dev/mock_mobile_api.py   # Datensatz fuer die XCUITests

Datensaetze (Umgebungsvariable MOCK_DATASET):
- nicht gesetzt (Default): zwei Stores "MOCK-QR-001" (Anker A1, A12) und "MOCK-QR-002" (Anker B1, B7) mit dem
  Layout aus swift/indooro-EinkaeuferFinal/Tests/IndooroNavigationCoreTests/Resources/store-layout-with-anchors.json.
  Alles andere liefert 404.
- ui-test-store: Stores "UITEST-001" (UI-Testmarkt) und "UITEST-002" (UI-Testmarkt 2) mit den Layouts und den
  30 Produkten aus swift/indooro-EinkaeuferFinal/Fixtures/ui-test-store/. Dazu die Produktsuche
  (/products/search?q=&size= und /products?size=) und /layout/current als Default-Layout.
  Fuer scripts/ios/run-ui-tests.sh und die CI.

App im Simulator gegen den Mock starten (nur DEBUG-Builds lesen die Variable):

    SIMCTL_CHILD_INDOORO_API_BASE_URL=http://127.0.0.1:18090/api \
        xcrun simctl launch booted at.ac.htl.leonding.indooroswift2
"""
import json
import os
import pathlib
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

ROOT = pathlib.Path(__file__).resolve().parents[1].parent
APP_ROOT = ROOT / "swift/indooro-EinkaeuferFinal"
DATASET = os.environ.get("MOCK_DATASET", "default")


def _default_dataset():
    layout_file = APP_ROOT / "Tests/IndooroNavigationCoreTests/Resources/store-layout-with-anchors.json"
    layout_1 = json.loads(layout_file.read_text(encoding="utf-8"))
    store_id = layout_1["storeId"]

    # Zweiter Store zum Testen des Store-Wechsels per Scan: gleiche Geometrie, andere Anker (B1, B7).
    store_id_2 = "9a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5e"
    layout_2 = json.loads(layout_file.read_text(encoding="utf-8"))
    layout_2["storeId"] = store_id_2
    layout_2["layout"]["shopName"] = "QR-Testmarkt 2 (Mock)"
    for element in layout_2["layout"]["elements"]:
        if element.get("type") == "anchor":
            element["anchorId"] = {"A12": "B7", "A1": "B1"}.get(element["anchorId"], element["anchorId"])
    stores = [{
        "id": store_id,
        "storeCode": "MOCK-QR-001",
        "name": "QR-Testmarkt (Mock)",
        "city": "Leonding",
        "address": "Poststrasse 10, 4060 Leonding",
        "latitude": 48.2680495,
        "longitude": 14.2618747,
    }, {
        "id": store_id_2,
        "storeCode": "MOCK-QR-002",
        "name": "QR-Testmarkt 2 (Mock)",
        "city": "Leonding",
        "address": "Teststrasse 2, 4060 Leonding",
        "latitude": 48.2701,
        "longitude": 14.2650,
    }]
    return {
        "stores": stores,
        "layouts": {
            store_id: layout_file.read_bytes(),
            store_id_2: layout_2,
        },
        "default_layout": None,
        "products": None,
    }


def _ui_test_store_dataset():
    fixture_dir = APP_ROOT / "Fixtures/ui-test-store"
    stores = json.loads((fixture_dir / "stores.json").read_text(encoding="utf-8"))
    layout_1 = json.loads((fixture_dir / "layout.json").read_text(encoding="utf-8"))
    layout_2 = json.loads((fixture_dir / "layout-2.json").read_text(encoding="utf-8"))
    products = json.loads((fixture_dir / "products.json").read_text(encoding="utf-8"))
    return {
        "stores": stores,
        "layouts": {
            layout_1["storeId"]: layout_1,
            layout_2["storeId"]: layout_2,
        },
        # Default-Layout (/api/layout/current) ist der Store 1 als nacktes Layout-Objekt.
        "default_layout": layout_1["layout"],
        "products": products,
    }


DATASETS = {
    "default": _default_dataset,
    "ui-test-store": _ui_test_store_dataset,
}

if DATASET not in DATASETS:
    sys.exit(f"Unbekannter MOCK_DATASET '{DATASET}' (erlaubt: {', '.join(DATASETS)})")

CONFIG = DATASETS[DATASET]()


def _layout_bytes(payload):
    # Layouts liegen im Default-Datensatz als Rohbytes vor, im UI-Test-Datensatz als geparste Objekte.
    if isinstance(payload, bytes):
        return payload
    return json.dumps(payload).encode("utf-8")


def _search_products(query, size):
    needle = query.casefold()
    matches = [p for p in CONFIG["products"] if needle in p["name"].casefold()]
    return matches[:size]


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        data = json.dumps(body).encode("utf-8") if not isinstance(body, bytes) else body
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _size(self, query_params, default):
        try:
            return max(1, int(query_params.get("size", [default])[0]))
        except ValueError:
            return default

    def do_GET(self):
        parts = urlsplit(self.path)
        path = parts.path.rstrip("/")
        query_params = parse_qs(parts.query, keep_blank_values=True)
        stores = CONFIG["stores"]
        layouts = CONFIG["layouts"]

        if path == "/api/mobile/stores":
            return self._send(200, stores)
        if path == "/api/mobile/stores/beacon-identities":
            return self._send(200, [])
        if path.startswith("/api/mobile/stores/") and path.endswith("/layout/current"):
            store_id = path[len("/api/mobile/stores/"):-len("/layout/current")]
            if store_id in layouts:
                return self._send(200, _layout_bytes(layouts[store_id]))
            return self._send(404, {"error": "not found", "path": path})

        if DATASET == "ui-test-store":
            if path == "/api/layout/current":
                return self._send(200, CONFIG["default_layout"])
            if path == "/api/products/search":
                query = query_params.get("q", [""])[0]
                return self._send(200, _search_products(query, self._size(query_params, 50)))
            if path == "/api/products":
                return self._send(200, CONFIG["products"][: self._size(query_params, 500)])

        return self._send(404, {"error": "not found", "path": path})

    def log_message(self, fmt, *args):
        sys.stderr.write("mock-api %s\n" % (fmt % args))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 18090
    ThreadingHTTPServer((os.environ.get("MOCK_HOST", "127.0.0.1"), port), Handler).serve_forever()
