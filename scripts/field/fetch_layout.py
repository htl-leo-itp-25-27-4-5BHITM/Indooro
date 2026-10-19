#!/usr/bin/env python3
"""Holt das aktive Layout eines Marktes (nur lesend, zwei GET-Aufrufe) fuer den Replay.

Der Replay braucht dasselbe Layout wie die App beim Aufnehmen. Die App laedt es von
`GET /mobile/stores` und `GET /mobile/stores/{id}/layout/current`. Dieses Skript tut dasselbe und
schreibt nur das Layout-Objekt (Format `LayoutData`) in eine Datei. Es schreibt nichts ans Backend.

Aufruf (Repo-Wurzel):
    python -I scripts/field/fetch_layout.py --store SPAR-Leonding-002 --out swift/indooro-EinkaeuferFinal/NavigationFixtures/layouts/spar-leonding-002.json
        [--api-base https://.../api] [--allow-fallback]

Die Beacon-Koordinaten im Layout sind der Stand der Registrierung im Backend. Stimmen sie nicht mit dem
Maßband im Raum, ist das Layout falsch und der Replay misst diesen Fehler mit (siehe TESTRAUM_TAG.md).

Exit: 0 geschrieben, 1 Layout ist ein Fallback oder ohne Beacons, 2 Aufruf- oder Netzfehler.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence

DEFAULT_API_BASE = "https://it220209.cloud.htl-leonding.ac.at/api"
TIMEOUT_S = 20


class FetchError(Exception):
    """Netz- oder Formatfehler beim Laden."""


Fetcher = Callable[[str], bytes]


def http_get(url: str) -> bytes:
    request = urllib.request.Request(url, method="GET", headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
            return response.read()
    except (urllib.error.URLError, OSError) as error:
        raise FetchError(f"{url}: {error}")


def _json(data: bytes, url: str) -> object:
    try:
        return json.loads(data)
    except ValueError as error:
        raise FetchError(f"{url}: keine gueltige JSON-Antwort ({error})")


def find_store(stores: object, store_code: str) -> Dict[str, object]:
    items = stores
    if isinstance(stores, dict):
        items = stores.get("stores") or stores.get("items") or stores.get("data") or []
    if not isinstance(items, list):
        raise FetchError("Marktliste hat ein unerwartetes Format")
    wanted = store_code.casefold()
    for item in items:
        if isinstance(item, dict) and str(item.get("storeCode", "")).casefold() == wanted:
            return item
    codes = ", ".join(sorted(str(i.get("storeCode")) for i in items if isinstance(i, dict) and i.get("storeCode")))
    raise FetchError(f"Markt '{store_code}' nicht in der Liste (vorhanden: {codes or 'keine'})")


def fetch_layout(api_base: str, store_code: str, fetch: Fetcher = http_get) -> Dict[str, object]:
    """Antwort von `layout/current` des Marktes. Enthaelt `layout`, `layoutId`, `fallback`."""
    base = api_base.rstrip("/")
    stores_url = f"{base}/mobile/stores"
    store = find_store(_json(fetch(stores_url), stores_url), store_code)
    store_id = store.get("id")
    if not isinstance(store_id, str) or not store_id:
        raise FetchError("Markt ohne 'id' in der Liste")
    layout_url = f"{base}/mobile/stores/{store_id.lower()}/layout/current"
    response = _json(fetch(layout_url), layout_url)
    if not isinstance(response, dict):
        raise FetchError(f"{layout_url}: unerwartetes Format")
    return response


def unwrap_layout(response: Dict[str, object]) -> Dict[str, object]:
    """Das `LayoutData`-Objekt: `response['layout']` bei der Mobile-Antwort, sonst die Antwort selbst."""
    layout = response.get("layout", response)
    if not isinstance(layout, dict) or not isinstance(layout.get("elements"), list) or "gridSize" not in layout:
        raise FetchError("Antwort enthaelt kein Layout (elements, gridSize)")
    return layout


def beacon_rows(layout: Dict[str, object]) -> List[str]:
    rows = []
    for element in layout["elements"]:  # type: ignore[union-attr]
        if isinstance(element, dict) and element.get("type") == "beacon":
            identity = element.get("identityKey") or "{}:{}:{}".format(
                element.get("beaconUUID") or element.get("uuid"),
                element.get("beaconMajor", element.get("major")),
                element.get("beaconMinor", element.get("minor")),
            )
            rows.append(f"  {element.get('beaconId')}  x={element.get('x')} y={element.get('y')}  {identity}")
    return rows


def main(argv: Optional[Sequence[str]] = None, fetch: Fetcher = http_get) -> int:
    parser = argparse.ArgumentParser(description="Aktives Layout eines Marktes lesend holen.")
    parser.add_argument("--store", required=True, metavar="CODE", help="storeCode, z. B. SPAR-Leonding-002")
    parser.add_argument("--out", required=True, type=Path, metavar="FILE.json")
    parser.add_argument("--api-base", default=DEFAULT_API_BASE, metavar="URL")
    parser.add_argument("--allow-fallback", action="store_true", help="auch ein Fallback-Layout schreiben")
    args = parser.parse_args(argv)

    try:
        response = fetch_layout(args.api_base, args.store, fetch)
        layout = unwrap_layout(response)
    except FetchError as error:
        print(f"Fehler: {error}", file=sys.stderr)
        return 2

    rows = beacon_rows(layout)
    is_fallback = response.get("fallback") is True
    if is_fallback and not args.allow_fallback:
        print(f"Abbruch: {args.store} hat kein eigenes aktives Layout (Fallback). Mit --allow-fallback trotzdem schreiben.", file=sys.stderr)
        return 1
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(layout, sort_keys=True, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Geschrieben: {args.out} (layoutId {response.get('layoutId')}, fallback={'ja' if is_fallback else 'nein'})")
    print(f"Beacons im Layout: {len(rows)}")
    for row in rows:
        print(row)
    if not rows:
        print("Warnung: Layout ohne Beacons. Der Replay hat dann nichts zu positionieren.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
