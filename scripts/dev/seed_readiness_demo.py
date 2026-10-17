#!/usr/bin/env python3
"""Legt Demodaten fuer die Pilot-Bereitschaftspruefung an (nur lokale Entwicklung).

Ueber die Admin-API entstehen:
  * Region  DEMO-REGION
  * Store   DEMO-MITTE  - aktives Layout (Eingang, 6 Regale, 5 Beacons, 12 Produkte).
            Gemischtes Ergebnis: 2 Produkte ohne Regal (blockierend), 2 Warnungen
            (Regal ohne Produkte, duenne Beacon-Abdeckung).
  * Store   DEMO-LEER   - ohne aktives Layout (Blocker-Zustand NO_ACTIVE_LAYOUT).

Wiederholtes Ausfuehren ist sicher: Region und Stores werden per Code wiederverwendet,
Beacons per Beacon-Code, Produkte per ID (Upsert), und ein bereits aktives Layout wird
nicht erneut gespeichert.

Die Produkte werden ueber POST /api/admin/products mit storeId/storeCode der Filiale
angelegt (IDs 9100001 bis 9100012). Die Admin-Oberflaeche und die Beacon-Identitaeten
sind nur fuer diese Demo-Filiale verwendet.

Umgebungsvariablen (optional, nur localhost erlaubt):
  INDOORO_KEYCLOAK_URL    Standard http://localhost:18180
  INDOORO_BACKEND_URL     Standard http://localhost:18080
  INDOORO_OPENSEARCH_URL  Standard http://localhost:19200
  INDOORO_ADMIN_PASSWORD  Passwort von indooro-admin; sonst aus keycloak/realm/indooro-realm.json
  INDOORO_CLIENT_SECRET   Client-Secret von indooro-admin-web; sonst aus der Realm-Datei

Aufruf:  python3 scripts/dev/seed_readiness_demo.py

Es werden keine Tokens oder Passwoerter ausgegeben.
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
REALM_FILE = os.path.join(REPO_ROOT, "keycloak", "realm", "indooro-realm.json")

REALM = "indooro"
CLIENT_ID = "indooro-admin-web"
ADMIN_USER = "indooro-admin"

KEYCLOAK_URL = os.environ.get("INDOORO_KEYCLOAK_URL", "http://localhost:18180").rstrip("/")
BACKEND_URL = os.environ.get("INDOORO_BACKEND_URL", "http://localhost:18080").rstrip("/")
OPENSEARCH_URL = os.environ.get("INDOORO_OPENSEARCH_URL", "http://localhost:19200").rstrip("/")
PRODUCTS_INDEX = "products"

# storeId/storeCode muessen keyword sein: StoreProductSource filtert mit term-Abfragen auf die
# ganze UUID. Bei dynamischem Mapping (text) findet die Abfrage keine Treffer.
PRODUCTS_MAPPING = {
    "mappings": {
        "properties": {
            "id": {"type": "long"},
            "name": {"type": "text", "fields": {"keyword": {"type": "keyword", "ignore_above": 256}}},
            "price": {"type": "float"},
            "layoutCode": {"type": "text", "fields": {"keyword": {"type": "keyword", "ignore_above": 256}}},
            "storeId": {"type": "keyword"},
            "storeCode": {"type": "keyword"},
        }
    }
}

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}

REGION = {
    "code": "DEMO-REGION",
    "name": "Demo Region",
    "description": "Lokale Demodaten fuer die Pilot-Bereitschaftspruefung.",
}

STORE_MITTE = {
    "storeCode": "DEMO-MITTE",
    "name": "Demo Markt Mitte",
    "street": "Hauptstrasse 1",
    "zipCode": "1010",
    "city": "Wien",
    "country": "Oesterreich",
    "latitude": 48.2082,
    "longitude": 16.3738,
    "notes": "Demodaten fuer die Pilot-Bereitschaftspruefung (scripts/dev/seed_readiness_demo.py).",
}

STORE_LEER = {
    "storeCode": "DEMO-LEER",
    "name": "Demo Markt Leer",
    "street": "Testgasse 2",
    "zipCode": "1020",
    "city": "Wien",
    "country": "Oesterreich",
    "latitude": 48.2100,
    "longitude": 16.4000,
    "notes": "Demo-Filiale ohne aktives Layout (Blocker-Zustand).",
}

BEACON_UUID = "7d3c1f2a-5b8e-4c9d-a1f0-2e6b9d4c8a13"
BEACON_MAJOR = 100
# (beaconCode, minor, x, y) - Positionen im Raster 30 x 20
BEACONS = [
    ("DEMO-MITTE-B1", 1, 2, 2),
    ("DEMO-MITTE-B2", 2, 14, 2),
    ("DEMO-MITTE-B3", 3, 26, 2),
    ("DEMO-MITTE-B4", 4, 8, 14),
    ("DEMO-MITTE-B5", 5, 22, 14),
]

GRID = {"width": 30, "height": 20}

# Regale: (category, label, x, y, width, height, meter)
SHELVES = [
    ("520/1", "Milchprodukte", 4, 3, 6, 1, 1),
    ("520/2", "Joghurt und Desserts", 4, 6, 6, 1, 2),
    ("310/1", "Obst", 14, 3, 6, 1, 1),
    ("310/2", "Gemuese", 14, 6, 6, 1, 2),
    ("530/1", "Tiefkuehl", 4, 13, 6, 1, 1),
    ("530/2", "Tiefkuehl Snacks", 14, 13, 6, 1, 2),  # bewusst ohne Produkte -> Warnung
]

# (id, name, price, layoutCode)
PRODUCTS = [
    (9100001, "Vollmilch 1 l", 1.19, "520/1/1/1"),
    (9100002, "Frischmilch 1,5 %", 1.09, "520/1/2/1"),
    (9100003, "Butter 250 g", 2.49, "520/1/3/1"),
    (9100004, "Naturjoghurt 500 g", 1.59, "520/2/1/1"),
    (9100005, "Vanillepudding", 0.79, "520/2/2/1"),
    (9100006, "Aepfel Gala 1 kg", 2.99, "310/1/1/1"),
    (9100007, "Bananen 1 kg", 1.79, "310/1/2/1"),
    (9100008, "Karotten 1 kg", 1.29, "310/2/1/1"),
    (9100009, "Erbsen tiefgekuehlt 1 kg", 2.19, "530/1/1/1"),
    (9100010, "Pommes frites 750 g", 2.49, "530/1/2/1"),
    # Blocker: kein Regal fuer diese Layout-Codes vorhanden
    (9100011, "Roggenbrot", 3.29, "540/1/1/1"),
    (9100012, "Rotwein 0,75 l", 7.90, "520/9/1/1"),
]


class SeedError(Exception):
    pass


def require_local(url):
    host = urllib.parse.urlparse(url).hostname or ""
    if host not in LOCAL_HOSTS and not host.endswith(".localhost"):
        raise SeedError(f"{url} ist kein lokaler Host. Das Skript laeuft nur gegen localhost.")


def load_realm_credentials():
    """Liest Passwort und Client-Secret aus der Realm-Datei, ohne sie auszugeben."""
    password = os.environ.get("INDOORO_ADMIN_PASSWORD")
    secret = os.environ.get("INDOORO_CLIENT_SECRET")
    if password and secret:
        return password, secret
    try:
        with open(REALM_FILE, encoding="utf-8") as handle:
            realm = json.load(handle)
    except (OSError, ValueError) as exc:
        raise SeedError(f"Realm-Datei nicht lesbar: {REALM_FILE} ({exc.__class__.__name__})")
    if not password:
        user = next((u for u in realm.get("users", []) if u.get("username") == ADMIN_USER), None)
        cred = next((c for c in (user or {}).get("credentials", []) if c.get("type") == "password"), None)
        if not cred or not cred.get("value"):
            raise SeedError(f"Kein Passwort fuer {ADMIN_USER} in der Realm-Datei gefunden.")
        password = cred["value"]
        if password.startswith("${"):
            raise SeedError("Realm-Datei enthaelt Platzhalter: INDOORO_ADMIN_PASSWORD (KC_DEMO_ADMIN_PASSWORD aus .env) setzen.")
    if not secret:
        client = next((c for c in realm.get("clients", []) if c.get("clientId") == CLIENT_ID), None)
        if not client or not client.get("secret"):
            raise SeedError(f"Kein Client-Secret fuer {CLIENT_ID} in der Realm-Datei gefunden.")
        secret = client["secret"]
        if secret.startswith("${"):
            raise SeedError("Realm-Datei enthaelt Platzhalter: Client-Secret (KC_ADMIN_WEB_CLIENT_SECRET aus .env) per Umgebung setzen.")
    return password, secret


def fetch_token():
    password, secret = load_realm_credentials()
    url = f"{KEYCLOAK_URL}/realms/{REALM}/protocol/openid-connect/token"
    body = urllib.parse.urlencode({
        "grant_type": "password",
        "client_id": CLIENT_ID,
        "client_secret": secret,
        "username": ADMIN_USER,
        "password": password,
    }).encode("utf-8")
    request = urllib.request.Request(url, data=body, method="POST",
                                     headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        reason = "unbekannt"
        try:
            reason = json.loads(exc.read().decode("utf-8")).get("error", reason)
        except (ValueError, AttributeError):
            pass
        raise SeedError(f"Token-Abruf fehlgeschlagen (HTTP {exc.code}, {reason}).")
    except urllib.error.URLError as exc:
        raise SeedError(f"Keycloak nicht erreichbar unter {KEYCLOAK_URL}: {exc.reason}")
    token = payload.get("access_token")
    if not token:
        raise SeedError("Keycloak lieferte kein access_token.")
    return token


class Api:
    def __init__(self, base_url, token):
        self.base_url = base_url
        self.token = token

    def call(self, method, path, body=None):
        data = None
        headers = {"Authorization": f"Bearer {self.token}", "Accept": "application/json"}
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self.base_url + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                raw = response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:300]
            raise SeedError(f"{method} {path} -> HTTP {exc.code}: {detail}")
        except urllib.error.URLError as exc:
            raise SeedError(f"Backend nicht erreichbar unter {self.base_url}: {exc.reason}")
        if not raw:
            return None
        try:
            return json.loads(raw.decode("utf-8"))
        except ValueError:
            raise SeedError(f"{method} {path} lieferte kein JSON (eventuell Login-Redirect, Token abgelaufen?).")


def ensure_region(api):
    for region in api.call("GET", "/api/regions") or []:
        if region.get("code") == REGION["code"]:
            print(f"Region {REGION['code']} vorhanden, wird wiederverwendet: {region['id']}")
            return region
    region = api.call("POST", "/api/regions", REGION)
    print(f"Region {REGION['code']} angelegt: {region['id']}")
    return region


def ensure_store(api, region, spec):
    page = api.call("GET", "/api/stores?" + urllib.parse.urlencode({"query": spec["storeCode"], "size": 100})) or {}
    for store in page.get("content", []):
        if store.get("storeCode") == spec["storeCode"]:
            print(f"Store {spec['storeCode']} vorhanden, wird wiederverwendet: {store['id']}")
            return store
    body = dict(spec, regionId=region["id"])
    store = api.call("POST", "/api/stores", body)
    print(f"Store {spec['storeCode']} angelegt: {store['id']}")
    return store


def ensure_beacons(api, store):
    existing = {b["beaconCode"]: b for b in (api.call("GET", "/api/beacons") or [])}
    for code, minor, _x, _y in BEACONS:
        beacon = existing.get(code)
        if beacon is None:
            beacon = api.call("POST", "/api/beacons", {
                "beaconCode": code,
                "uuid": BEACON_UUID,
                "major": BEACON_MAJOR,
                "minor": minor,
                "notes": "Demo-Beacon (scripts/dev/seed_readiness_demo.py)",
            })
            print(f"Beacon {code} angelegt: {beacon['id']}")
        current = beacon.get("currentStore")
        if current and current.get("id") == store["id"]:
            continue
        if current:
            raise SeedError(f"Beacon {code} ist einer anderen Filiale zugeordnet ({current.get('storeCode')}).")
        api.call("POST", f"/api/beacons/{beacon['id']}/assign", {"storeId": store["id"]})
        print(f"Beacon {code} der Filiale {store['storeCode']} zugeordnet.")


def beacon_layout_elements(first_id):
    uuid_plain = BEACON_UUID.replace("-", "")
    elements = []
    for offset, (code, minor, x, y) in enumerate(BEACONS):
        elements.append({
            "id": first_id + offset,
            "type": "beacon",
            "x": x,
            "y": y,
            "beaconId": code,
            "beaconUUID": BEACON_UUID,
            "beaconMajor": BEACON_MAJOR,
            "beaconMinor": minor,
            "identityKey": f"{uuid_plain}:{BEACON_MAJOR}:{minor}",
        })
    return elements


def build_layout_mitte():
    elements = [{
        "id": 1,
        "type": "entrance",
        "category": None,
        "x": 0,
        "y": 9,
        "width": 1,
        "height": 3,
        "label": "Eingang",
        "color": "#E5E7EB",
    }]
    for index, (category, label, x, y, width, height, meter) in enumerate(SHELVES):
        elements.append({
            "id": 2 + index,
            "type": "shelf",
            "category": category,
            "x": x,
            "y": y,
            "width": width,
            "height": height,
            "label": label,
            "color": "#2196F3",
            "meter": meter,
        })
    elements.extend(beacon_layout_elements(2 + len(SHELVES)))
    return {"shopName": STORE_MITTE["name"], "gridSize": dict(GRID), "elements": elements}


def ensure_products_index():
    """Legt den Index mit korrektem Mapping an, falls er fehlt. Ein vorhandener Index wird nicht veraendert."""
    url = f"{OPENSEARCH_URL}/{PRODUCTS_INDEX}"
    try:
        with urllib.request.urlopen(f"{url}/_mapping", timeout=15) as response:
            mapping = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code != 404:
            raise SeedError(f"OpenSearch-Mapping nicht lesbar (HTTP {exc.code}).")
        body = json.dumps(PRODUCTS_MAPPING).encode("utf-8")
        request = urllib.request.Request(url, data=body, method="PUT",
                                         headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=30) as response:
            response.read()
        print(f"Index {PRODUCTS_INDEX} mit keyword-Mapping fuer storeId/storeCode angelegt.")
        return
    except urllib.error.URLError as exc:
        raise SeedError(f"OpenSearch nicht erreichbar unter {OPENSEARCH_URL}: {exc.reason}")
    properties = mapping.get(PRODUCTS_INDEX, {}).get("mappings", {}).get("properties", {})
    if properties.get("storeId", {}).get("type") != "keyword":
        raise SeedError(
            f"Index {PRODUCTS_INDEX} hat storeId nicht als keyword gemappt; die Store-Abfrage findet dann keine Produkte. "
            f"Nur in der Demo-Umgebung: curl -X DELETE {url} und das Skript erneut starten."
        )
    print(f"Index {PRODUCTS_INDEX} mit passendem Mapping vorhanden.")


def ensure_products(api, store):
    ensure_products_index()
    for product_id, name, price, layout_code in PRODUCTS:
        api.call("POST", "/api/admin/products", {
            "id": product_id,
            "name": name,
            "price": price,
            "layoutCode": layout_code,
            "storeId": store["id"],
            "storeCode": store["storeCode"],
        })
    # OpenSearch macht neue Dokumente erst nach einem Refresh durchsuchbar; sonst sieht die
    # Auswertung direkt nach dem Schreiben noch keine Produkte.
    refresh = urllib.request.Request(f"{OPENSEARCH_URL}/{PRODUCTS_INDEX}/_refresh", data=b"", method="POST")
    try:
        with urllib.request.urlopen(refresh, timeout=30) as response:
            response.read()
    except urllib.error.URLError as exc:
        raise SeedError(f"OpenSearch-Refresh fehlgeschlagen: {exc.reason}")
    print(f"{len(PRODUCTS)} Produkte fuer {store['storeCode']} geschrieben (Upsert, Index aktualisiert).")


def ensure_active_layout(api, store):
    versions = api.call("GET", f"/api/stores/{store['id']}/layout/versions") or []
    active = next((v for v in versions if v.get("status") == "ACTIVE"), None)
    if active:
        print(f"Aktives Layout vorhanden (Version {active.get('versionNo')}), wird nicht erneut gespeichert.")
        return
    saved = api.call("POST", f"/api/stores/{store['id']}/layout/versions", {
        "layoutName": "Demo Layout Mitte",
        "changeNote": "Demodaten fuer Pilot-Bereitschaftspruefung",
        "activate": True,
        "layout": build_layout_mitte(),
    })
    print(f"Layout gespeichert und aktiviert (Version {saved.get('versionNo')}).")


def fetch_readiness(api, store):
    return api.call("GET", f"/api/stores/{store['id']}/readiness")


def print_report(store, report):
    print()
    print(f"=== {store.get('name')} ({store['storeCode']}) ===")
    print(f"Store-ID:          {store['id']}")
    print(f"Gesamtstatus:      {report['status']}")
    print(f"Blockierend:       {report['blockingCount']}")
    print(f"Warnungen:         {report['warningCount']}")
    counts = report.get("counts", {})
    print("Zaehler:           " + ", ".join(f"{k}={v}" for k, v in counts.items()))
    for finding in report.get("findings", []):
        print(f"  [{finding['severity']}] {finding['code']}: {finding['message']}")


def main():
    for url in (KEYCLOAK_URL, BACKEND_URL, OPENSEARCH_URL):
        require_local(url)

    token = fetch_token()
    api = Api(BACKEND_URL, token)

    region = ensure_region(api)
    mitte = ensure_store(api, region, STORE_MITTE)
    leer = ensure_store(api, region, STORE_LEER)

    ensure_beacons(api, mitte)
    ensure_products(api, mitte)
    ensure_active_layout(api, mitte)

    print()
    print("Store-IDs:")
    print(f"  DEMO-MITTE: {mitte['id']}")
    print(f"  DEMO-LEER:  {leer['id']}")

    print_report(mitte, fetch_readiness(api, mitte))
    print_report(leer, fetch_readiness(api, leer))


if __name__ == "__main__":
    try:
        main()
    except SeedError as error:
        print(f"Fehler: {error}", file=sys.stderr)
        sys.exit(1)
