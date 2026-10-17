#!/usr/bin/env python3
"""Exportiert alle Produkte des Backends als NDJSON (eine JSON-Zeile pro Produkt).

Aufruf (Beispiel):
    python3 scripts/ops/export_products.py --base-url https://it220209.cloud.htl-leonding.ac.at

Ergebnis: backups/<UTC-Datum>-products.ndjson (Verzeichnis ist git-ignoriert, nie committen).
Wiederholt bei HTTP 5xx und Netzwerkfehlern. Nur Standardbibliothek.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional, Sequence

DEFAULT_SIZE = 10000
DEFAULT_OUT_DIR = "backups"
DEFAULT_TIMEOUT = 30.0
DEFAULT_RETRIES = 2
RETRY_PAUSE_SECONDS = 2.0
ALLOWED_SCHEMES = ("http", "https")
USER_AGENT = "indooro-export-products/1.0"


@dataclass(frozen=True)
class FetchResult:
    """Antwort eines GET. status ist None bei Netzwerkfehler oder Timeout."""

    status: Optional[int]
    body: str = ""
    error: str = ""


Fetch = Callable[[str, float], FetchResult]
Sleep = Callable[[float], None]


# ---------------------------------------------------------------------------
# Argumente
# ---------------------------------------------------------------------------

def parse_base_url(value: str) -> str:
    raw = value.strip()
    parts = urllib.parse.urlsplit(raw)
    if parts.scheme.lower() not in ALLOWED_SCHEMES or not parts.netloc:
        raise argparse.ArgumentTypeError("nur http:// oder https:// mit Host erlaubt")
    return raw.rstrip("/")


def _positive_int(value: str) -> int:
    try:
        number = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("ganze Zahl erwartet") from exc
    if number < 1:
        raise argparse.ArgumentTypeError("muss mindestens 1 sein")
    return number


def _non_negative_int(value: str) -> int:
    try:
        number = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("ganze Zahl erwartet") from exc
    if number < 0:
        raise argparse.ArgumentTypeError("darf nicht negativ sein")
    return number


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
        description="Exportiert alle Produkte als NDJSON nach backups/.",
    )
    parser.add_argument("--base-url", required=True, type=parse_base_url,
                        help="Basis-URL des Backends (nur http/https)")
    parser.add_argument("--size", type=_positive_int, default=DEFAULT_SIZE,
                        help=f"Anzahl Produkte pro Abfrage (Standard: {DEFAULT_SIZE})")
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR,
                        help=f"Zielverzeichnis (Standard: {DEFAULT_OUT_DIR})")
    parser.add_argument("--timeout", type=_positive_float, default=DEFAULT_TIMEOUT,
                        help=f"Timeout je Anfrage in Sekunden (Standard: {DEFAULT_TIMEOUT:g})")
    parser.add_argument("--retries", type=_non_negative_int, default=DEFAULT_RETRIES,
                        help=f"Wiederholungen bei 5xx/Netzwerkfehler (Standard: {DEFAULT_RETRIES})")
    return parser


# ---------------------------------------------------------------------------
# Reine Logik (ohne Netzwerk)
# ---------------------------------------------------------------------------

def products_url(base_url: str, size: int) -> str:
    return f"{base_url.rstrip('/')}/api/products?" + urllib.parse.urlencode({"size": size})


def pick_output_path(out_dir: Path, now: datetime) -> Path:
    """backups/<UTC-Datum>-products.ndjson; bei Existenz -HHMMSS anhaengen."""
    stem = f"{now:%Y-%m-%d}-products"
    plain = out_dir / f"{stem}.ndjson"
    if not plain.exists():
        return plain
    return out_dir / f"{stem}-{now:%H%M%S}.ndjson"


def _is_retryable(result: FetchResult) -> bool:
    return result.status is None or result.status >= 500


def fetch_with_retries(fetch: Fetch, url: str, timeout: float, retries: int,
                       sleep: Sleep) -> FetchResult:
    attempt = 0
    while True:
        try:
            result = fetch(url, timeout)
        except OSError as exc:
            result = FetchResult(status=None, error=str(exc))
        if not _is_retryable(result) or attempt >= retries:
            return result
        attempt += 1
        sleep(RETRY_PAUSE_SECONDS)


def validate_products_response(status: Optional[int], body: str) -> tuple[list[Any], str]:
    """Gibt (Produkte, Fehlertext) zurueck. Fehlertext leer heisst gueltig."""
    if status is None:
        return [], "keine Antwort vom Backend"
    if status != 200:
        return [], f"HTTP {status} statt 200"
    try:
        data = json.loads(body)
    except json.JSONDecodeError as exc:
        return [], f"Antwort ist kein JSON ({exc.msg})"
    if not isinstance(data, list):
        return [], "Antwort ist kein JSON-Array"
    if not data:
        return [], "0 Produkte geliefert (leerer Index?)"
    return data, ""


def to_ndjson(items: Sequence[Any]) -> str:
    lines = [json.dumps(item, ensure_ascii=False, separators=(",", ":")) for item in items]
    return "\n".join(lines) + "\n"


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


def main(argv: Optional[Sequence[str]] = None, fetch: Fetch = http_get,
         sleep: Sleep = time.sleep, now: Optional[datetime] = None) -> int:
    args = build_parser().parse_args(argv)
    url = products_url(args.base_url, args.size)
    response = fetch_with_retries(fetch, url, args.timeout, args.retries, sleep)
    items, problem = validate_products_response(response.status, response.body)
    if problem:
        detail = f" ({response.error})" if response.error and response.status is None else ""
        print(f"FEHLER: {problem}{detail}", file=sys.stderr)
        return 1

    moment = now or datetime.now(timezone.utc)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    target = pick_output_path(out_dir, moment)
    with target.open("x", encoding="utf-8", newline="\n") as handle:
        handle.write(to_ndjson(items))
    print(f"{len(items)} Produkte geschrieben nach {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
