#!/usr/bin/env python3
"""Minimal Mobile-API-Mock fuer Simulator-Pruefungen ohne Backend.

    python3 scripts/dev/mock_mobile_api.py [port]            # Default 18090

Dient genau einen Store ("SPAR-Leonding-001") mit dem Layout aus
swift/indooro-EinkaeuferFinal/Tests/IndooroNavigationCoreTests/Resources/store-layout-with-anchors.json
(Eingang plus QR-Anker A1 und A12). Alles andere liefert 404.

App im Simulator gegen den Mock starten (nur DEBUG-Builds lesen die Variable):

    SIMCTL_CHILD_INDOORO_API_BASE_URL=http://127.0.0.1:18090/api \
        xcrun simctl launch booted at.ac.htl.leonding.indooroswift2
"""
import json
import pathlib
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

ROOT = pathlib.Path(__file__).resolve().parents[1].parent
LAYOUT = ROOT / "swift/indooro-EinkaeuferFinal/Tests/IndooroNavigationCoreTests/Resources/store-layout-with-anchors.json"
STORE_ID = json.loads(LAYOUT.read_text(encoding="utf-8"))["storeId"]
STORES = [{
    "id": STORE_ID,
    "storeCode": "SPAR-Leonding-001",
    "name": "EUROSPAR Leonding (Mock)",
    "city": "Leonding",
    "address": "Poststrasse 10, 4060 Leonding",
    "latitude": 48.2680495,
    "longitude": 14.2618747,
}]


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        data = json.dumps(body).encode("utf-8") if not isinstance(body, bytes) else body
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = self.path.split("?", 1)[0].rstrip("/")
        if path == "/api/mobile/stores":
            return self._send(200, STORES)
        if path == "/api/mobile/stores/beacon-identities":
            return self._send(200, [])
        if path == f"/api/mobile/stores/{STORE_ID}/layout/current":
            return self._send(200, LAYOUT.read_bytes())
        return self._send(404, {"error": "not found", "path": path})

    def log_message(self, fmt, *args):
        sys.stderr.write("mock-api %s\n" % (fmt % args))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 18090
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
