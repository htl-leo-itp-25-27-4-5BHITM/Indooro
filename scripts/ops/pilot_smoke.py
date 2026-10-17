#!/usr/bin/env python3
"""Smoke-Check fuer die mobilen Pilot-Endpunkte des Backends.

Aufruf (Beispiel):
    python3 scripts/ops/pilot_smoke.py https://it220209.cloud.htl-leonding.ac.at <storeId> apfel

Geprueft wird per GET:
    /api/mobile/stores                            Pflicht: HTTP 200, Liste, storeId enthalten
    /api/mobile/stores/<storeId>/layout/current   Pflicht: HTTP 200, mindestens 1 Regal
    /api/products/search?q=<query>                Pflicht: HTTP 200, mindestens 1 Treffer
    /api/categories                               nur Information; HTTP 5xx zaehlt als Fehler

Exit 0 nur wenn alle Pflichtpruefungen OK sind, sonst 1. Nur Standardbibliothek.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable, Optional, Sequence

DEFAULT_TIMEOUT = 20.0
ALLOWED_SCHEMES = ("http", "https")
USER_AGENT = "indooro-pilot-smoke/1.0"

# Reihenfolge und Zuordnung fuer die Zusammenfassungszeile.
SUMMARY_SOURCES = (
    ("stores", "stores", "stores"),
    ("shelves", "layout", "shelves"),
    ("beacons", "layout", "beacons"),
    ("products", "search", "products"),
)


@dataclass(frozen=True)
class FetchResult:
    """Antwort eines GET. status ist None bei Netzwerkfehler oder Timeout."""

    status: Optional[int]
    body: str = ""
    error: str = ""


@dataclass
class CheckResult:
    """Ergebnis einer Pruefung; numbers enthaelt die gezaehlten Werte."""

    name: str
    ok: bool
    status: Optional[int]
    message: str
    numbers: dict[str, int] = field(default_factory=dict)
    required: bool = True


Fetch = Callable[[str, float], FetchResult]


# ---------------------------------------------------------------------------
# Argumente
# ---------------------------------------------------------------------------

def parse_base_url(value: str) -> str:
    raw = value.strip()
    parts = urllib.parse.urlsplit(raw)
    if parts.scheme.lower() not in ALLOWED_SCHEMES or not parts.netloc:
        raise argparse.ArgumentTypeError("nur http:// oder https:// mit Host erlaubt")
    return raw.rstrip("/")


def _non_empty(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise argparse.ArgumentTypeError("darf nicht leer sein")
    return stripped


def _positive_float(value: str) -> float:
    try:
        number = float(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("Zahl erwartet") from exc
    if number <= 0:
        raise argparse.ArgumentTypeError("muss groesser 0 sein")
    return number


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Prueft die mobilen Pilot-Endpunkte (Stores, Layout, Suche) des Backends.",
    )
    parser.add_argument("base_url", type=parse_base_url, metavar="base-url",
                        help="Basis-URL, z. B. https://it220209.cloud.htl-leonding.ac.at")
    parser.add_argument("store_id", type=_non_empty, metavar="storeId",
                        help="UUID des Pilot-Stores")
    parser.add_argument("query", type=_non_empty, metavar="query",
                        help="Suchbegriff fuer /api/products/search")
    parser.add_argument("--timeout", type=_positive_float, default=DEFAULT_TIMEOUT,
                        help="Timeout je Anfrage in Sekunden (Standard: 20)")
    return parser


# ---------------------------------------------------------------------------
# Reine Auswertung (ohne Netzwerk)
# ---------------------------------------------------------------------------

def build_urls(base_url: str, store_id: str, query: str) -> dict[str, str]:
    base = base_url.rstrip("/")
    store_part = urllib.parse.quote(store_id, safe="")
    return {
        "stores": f"{base}/api/mobile/stores",
        "layout": f"{base}/api/mobile/stores/{store_part}/layout/current",
        "search": f"{base}/api/products/search?" + urllib.parse.urlencode({"q": query}),
        "categories": f"{base}/api/categories",
    }


def _failure(name: str, status: Optional[int], message: str,
             numbers: Optional[dict[str, int]] = None) -> CheckResult:
    return CheckResult(name=name, ok=False, status=status, message=message,
                       numbers=numbers or {})


def _http_problem(status: Optional[int], body: str) -> str:
    """Leerer Text, wenn HTTP 200 mit Inhalt; sonst Fehlerbeschreibung."""
    if status is None:
        return "keine Antwort"
    if status != 200:
        return f"HTTP {status} statt 200"
    if not body.strip():
        return "leerer Inhalt"
    return ""


def _parse_json(body: str) -> tuple[Any, str]:
    try:
        return json.loads(body), ""
    except json.JSONDecodeError as exc:
        return None, f"kaputtes JSON ({exc.msg})"


def evaluate_stores(status: Optional[int], body: str, store_id: str) -> CheckResult:
    name = "stores"
    problem = _http_problem(status, body)
    if problem:
        return _failure(name, status, problem, {"stores": 0, "target_found": 0})
    data, error = _parse_json(body)
    if error:
        return _failure(name, status, error, {"stores": 0, "target_found": 0})
    if not isinstance(data, list):
        return _failure(name, status, "Antwort ist kein JSON-Array", {"stores": 0, "target_found": 0})
    count = len(data)
    if count == 0:
        return _failure(name, status, "keine Stores geliefert", {"stores": 0, "target_found": 0})
    wanted = store_id.strip().lower()
    found = any(
        isinstance(item, dict) and str(item.get("id", "")).strip().lower() == wanted
        for item in data
    )
    numbers = {"stores": count, "target_found": 1 if found else 0}
    if not found:
        return _failure(name, status, "Ziel-Store-ID nicht in der Liste", numbers)
    return CheckResult(name, True, status, "Ziel-Store enthalten", numbers)


_LAYOUT_KINDS = {"shelf": "shelves", "beacon": "beacons", "anchor": "anchors"}


def evaluate_layout(status: Optional[int], body: str) -> CheckResult:
    name = "layout"
    empty = {"shelves": 0, "beacons": 0, "anchors": 0}
    problem = _http_problem(status, body)
    if problem:
        return _failure(name, status, problem, empty)
    data, error = _parse_json(body)
    if error:
        return _failure(name, status, error, empty)
    layout = data.get("layout") if isinstance(data, dict) else None
    if not isinstance(layout, dict):
        return _failure(name, status, "Feld layout fehlt", empty)
    elements = layout.get("elements")
    if not isinstance(elements, list):
        return _failure(name, status, "layout.elements fehlt oder ist keine Liste", empty)
    counts = dict(empty)
    for element in elements:
        if isinstance(element, dict):
            key = _LAYOUT_KINDS.get(element.get("type"))
            if key:
                counts[key] += 1
    if counts["shelves"] == 0:
        return _failure(name, status, "keine Regale im Layout", counts)
    message = "Regale vorhanden" if counts["beacons"] else "Regale vorhanden, aber keine Beacons"
    return CheckResult(name, True, status, message, counts)


def evaluate_search(status: Optional[int], body: str) -> CheckResult:
    name = "search"
    problem = _http_problem(status, body)
    if problem:
        return _failure(name, status, problem, {"products": 0})
    data, error = _parse_json(body)
    if error:
        return _failure(name, status, error, {"products": 0})
    if not isinstance(data, list):
        return _failure(name, status, "Antwort ist kein JSON-Array", {"products": 0})
    count = len(data)
    if count == 0:
        return _failure(name, status, "keine Treffer fuer die Suche", {"products": 0})
    return CheckResult(name, True, status, "Treffer vorhanden", {"products": count})


def evaluate_categories(status: Optional[int], body: str) -> CheckResult:
    """Nur Information: ok bei HTTP 200 mit Liste. Blockiert nur bei 5xx."""
    name = "categories"
    if status is None:
        return CheckResult(name, False, None, "keine Antwort", {}, required=False)
    if status != 200:
        return CheckResult(name, False, status, f"HTTP {status} (nur Information)", {}, required=False)
    data, error = _parse_json(body)
    if error or not isinstance(data, list):
        return CheckResult(name, False, status, error or "kein JSON-Array", {}, required=False)
    return CheckResult(name, True, status, "Kategorien gelesen", {"categories": len(data)}, required=False)


def is_blocking(result: CheckResult) -> bool:
    return result.required or (result.status is not None and result.status >= 500)


def format_result(result: CheckResult) -> str:
    if result.ok:
        label = "OK"
    elif is_blocking(result):
        label = "FAIL"
    else:
        label = "INFO"
    status = "-" if result.status is None else str(result.status)
    parts = [f"{key}={value}" for key, value in result.numbers.items()]
    line = " ".join([label, result.name, f"status={status}", *parts])
    if result.message:
        line += f" - {result.message}"
    return line


def summary_line(results: Sequence[CheckResult]) -> str:
    by_name = {result.name: result for result in results}
    parts = []
    for label, check, key in SUMMARY_SOURCES:
        result = by_name.get(check)
        value = result.numbers.get(key) if result is not None else None
        parts.append(f"{label}={'-' if value is None else value}")
    return " ".join(parts)


# ---------------------------------------------------------------------------
# I/O
# ---------------------------------------------------------------------------

def http_get(url: str, timeout: float) -> FetchResult:
    request = urllib.request.Request(
        url, headers={"Accept": "application/json", "User-Agent": USER_AGENT}, method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            status = response.status
            body = response.read().decode("utf-8", errors="replace")
        return FetchResult(status=status, body=body)
    except urllib.error.HTTPError as exc:
        try:
            body = exc.read().decode("utf-8", errors="replace")
        except (OSError, ValueError):
            body = ""
        return FetchResult(status=exc.code, body=body)
    except (urllib.error.URLError, OSError, ValueError) as exc:
        return FetchResult(status=None, error=str(getattr(exc, "reason", exc)))


def run_checks(fetch: Fetch, base_url: str, store_id: str, query: str,
               timeout: float) -> list[CheckResult]:
    urls = build_urls(base_url, store_id, query)
    evaluators: list[tuple[str, bool, Callable[[Optional[int], str], CheckResult]]] = [
        ("stores", True, lambda status, body: evaluate_stores(status, body, store_id)),
        ("layout", True, evaluate_layout),
        ("search", True, evaluate_search),
        ("categories", False, evaluate_categories),
    ]
    results: list[CheckResult] = []
    for name, required, evaluate in evaluators:
        response = fetch(urls[name], timeout)
        if response.status is None:
            results.append(CheckResult(
                name, False, None,
                f"keine Antwort: {response.error or 'Netzwerkfehler'}", {}, required=required,
            ))
            continue
        results.append(evaluate(response.status, response.body))
    return results


def main(argv: Optional[Sequence[str]] = None, fetch: Fetch = http_get) -> int:
    args = build_parser().parse_args(argv)
    results = run_checks(fetch, args.base_url, args.store_id, args.query, args.timeout)
    for result in results:
        print(format_result(result))
    print(summary_line(results))
    failed = [result for result in results if not result.ok and is_blocking(result)]
    if failed:
        print(f"Ergebnis: FAIL ({len(failed)} Pruefung(en) fehlgeschlagen)")
        return 1
    print("Ergebnis: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
