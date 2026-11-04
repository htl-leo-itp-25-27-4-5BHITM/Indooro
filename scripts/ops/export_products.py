#!/usr/bin/env python3
"""Exportiert Produkte als NDJSON (eine JSON-Zeile pro Produkt).

Vollsicherung (alle Maerkte plus Altdokumente), direkt aus dem Index hinter dem Alias:
    kubectl -n student-it220209 port-forward svc/opensearch 9200:9200      # zweites Terminal
    python3 scripts/ops/export_products.py --opensearch-url http://127.0.0.1:9200

Ergebnis: backups/<UTC-Datum>-products-all.ndjson (nur lesend: _alias, _search mit Scroll, _count).
Nur Loopback-Hosts sind erlaubt. Der Index kommt aus --index (Standard: products_live, der Alias,
den das Backend liest). Der Export bricht ab, wenn die Zeilenzahl nicht zu _count passt.

Teilexport ueber die oeffentliche API (KEINE Vollsicherung):
    python3 scripts/ops/export_products.py --base-url https://it220209.cloud.htl-leonding.ac.at

Seit Release 4cb1e03 liefert GET /api/products ohne Markt nur Altdokumente ohne storeCode, und die API
begrenzt size auf 500. Ergebnis: backups/<UTC-Datum>-products.ndjson.

Das Verzeichnis backups/ ist git-ignoriert, nie committen. Wiederholt bei HTTP 5xx und
Netzwerkfehlern. Nur Standardbibliothek.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, Optional, Sequence

DEFAULT_SIZE = 10000
DEFAULT_OUT_DIR = "backups"
DEFAULT_TIMEOUT = 30.0
DEFAULT_RETRIES = 2
RETRY_PAUSE_SECONDS = 2.0
ALLOWED_SCHEMES = ("http", "https")
LOOPBACK_HOSTS = ("127.0.0.1", "localhost", "::1")
DEFAULT_INDEX = "products_live"
SCROLL_KEEP_ALIVE = "2m"
SCROLL_PAGE_SIZE = 500
MAX_SCROLL_PAGES = 1000
INDEX_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,254}$")
USER_AGENT = "indooro-export-products/1.0"
JSON_HEADERS = {"Accept": "application/json", "Content-Type": "application/json",
                "User-Agent": USER_AGENT}


@dataclass(frozen=True)
class FetchResult:
    """Antwort eines GET. status ist None bei Netzwerkfehler oder Timeout."""

    status: Optional[int]
    body: str = ""
    error: str = ""


Fetch = Callable[[str, float], FetchResult]
# send(method, url, body, headers, timeout) -> FetchResult
Send = Callable[[str, str, Optional[bytes], Mapping[str, str], float], FetchResult]
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


def parse_opensearch_url(value: str) -> str:
    """OpenSearch ist nicht oeffentlich: nur Loopback-Adressen (Port-Forward) sind erlaubt."""
    raw = value.strip()
    parts = urllib.parse.urlsplit(raw)
    if parts.scheme.lower() not in ALLOWED_SCHEMES or not parts.netloc or "@" in parts.netloc:
        raise argparse.ArgumentTypeError("nur http:// oder https:// mit Host erlaubt")
    if parts.path not in ("", "/") or parts.query or parts.fragment:
        raise argparse.ArgumentTypeError("nur Basis-URL ohne Pfad und Parameter")
    if (parts.hostname or "").lower() not in LOOPBACK_HOSTS:
        raise argparse.ArgumentTypeError(
            "nur Loopback-Hosts erlaubt (127.0.0.1, localhost, ::1); "
            "OpenSearch per kubectl port-forward")
    return raw.rstrip("/")


def _index_name(value: str) -> str:
    stripped = value.strip()
    if not INDEX_NAME_RE.match(stripped):
        raise argparse.ArgumentTypeError("gueltiger Indexname oder Alias erwartet (klein, ohne Platzhalter)")
    return stripped


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
        description="Exportiert Produkte als NDJSON nach backups/.",
        epilog=(
            "Vollsicherung: --opensearch-url (Loopback, Port-Forward). "
            "--base-url liefert seit Release 4cb1e03 nur Altdokumente ohne Markt."
        ),
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--opensearch-url", type=parse_opensearch_url,
                        help="OpenSearch-Basis-URL, nur Loopback: Vollsicherung aller Maerkte")
    source.add_argument("--base-url", type=parse_base_url,
                        help="Basis-URL des Backends (nur http/https): Teilexport ohne Markt")
    parser.add_argument("--index", type=_index_name, default=DEFAULT_INDEX,
                        help=f"Index oder Alias bei --opensearch-url (Standard: {DEFAULT_INDEX})")
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


def pick_output_path(out_dir: Path, now: datetime, name: str = "products") -> Path:
    """backups/<UTC-Datum>-<name>.ndjson; bei Existenz -HHMMSS anhaengen."""
    stem = f"{now:%Y-%m-%d}-{name}"
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


def scroll_start_url(base: str, index: str) -> str:
    return f"{base}/{urllib.parse.quote(index, safe='')}/_search?scroll={SCROLL_KEEP_ALIVE}"


def scroll_body(size: int) -> bytes:
    return json.dumps({"size": size, "query": {"match_all": {}}}).encode("utf-8")


def scroll_next_body(scroll_id: str) -> bytes:
    return json.dumps({"scroll": SCROLL_KEEP_ALIVE, "scroll_id": scroll_id}).encode("utf-8")


def parse_scroll_page(result: FetchResult) -> tuple[str, list[dict[str, Any]], str]:
    """Gibt (scroll_id, Treffer, Fehlertext). Treffer leer und kein Fehler = Ende."""
    if result.status is None:
        return "", [], f"OpenSearch nicht erreichbar ({result.error or 'Transportfehler'})"
    if result.status != 200:
        return "", [], f"OpenSearch HTTP {result.status} bei _search"
    try:
        data = json.loads(result.body)
    except json.JSONDecodeError:
        return "", [], "_search-Antwort ist kein JSON"
    hits = data.get("hits", {}).get("hits") if isinstance(data, dict) and isinstance(data.get("hits"), dict) else None
    scroll_id = data.get("_scroll_id") if isinstance(data, dict) else None
    if not isinstance(hits, list) or not isinstance(scroll_id, str) or not scroll_id:
        return "", [], "_search-Antwort ohne hits oder _scroll_id"
    if data.get("timed_out") is True:
        return "", [], "_search meldet timed_out"
    shards = data.get("_shards")
    if isinstance(shards, dict) and shards.get("failed"):
        return "", [], f"_search meldet {shards.get('failed')} fehlgeschlagene Shards"
    return scroll_id, [hit for hit in hits if isinstance(hit, dict)], ""


def parse_count_response(result: FetchResult) -> tuple[Optional[int], str]:
    if result.status is None:
        return None, f"OpenSearch nicht erreichbar ({result.error or 'Transportfehler'})"
    if result.status != 200:
        return None, f"OpenSearch HTTP {result.status} bei _count"
    try:
        data = json.loads(result.body)
    except json.JSONDecodeError:
        return None, "_count-Antwort ist kein JSON"
    count = data.get("count") if isinstance(data, dict) else None
    if not isinstance(count, int) or isinstance(count, bool) or count < 0:
        return None, "_count-Antwort ohne gueltige Zahl"
    return count, ""


def parse_alias_response(result: FetchResult) -> tuple[list[str], str]:
    """Konkrete Indizes hinter einem Alias oder Indexnamen (GET /<name>). Nur Lesen."""
    if result.status is None:
        return [], f"OpenSearch nicht erreichbar ({result.error or 'Transportfehler'})"
    if result.status == 404:
        return [], "Index oder Alias nicht gefunden"
    if result.status != 200:
        return [], f"OpenSearch HTTP {result.status} bei der Alias-Abfrage"
    try:
        data = json.loads(result.body)
    except json.JSONDecodeError:
        return [], "Alias-Antwort ist kein JSON"
    if not isinstance(data, dict) or not data:
        return [], "Alias-Antwort ohne Index"
    return sorted(str(name) for name in data), ""


def collect_documents(hits: Sequence[Mapping[str, Any]]) -> tuple[list[tuple[str, dict[str, Any]]], list[str]]:
    """Gibt ((_id, _source) sortiert nach _id, Problemzeilen)."""
    documents: dict[str, dict[str, Any]] = {}
    problems: list[str] = []
    for hit in hits:
        doc_id = hit.get("_id")
        source = hit.get("_source")
        if not isinstance(doc_id, str) or not doc_id:
            problems.append("Treffer ohne _id")
        elif not isinstance(source, dict):
            problems.append(f"Dokument {doc_id}: _source fehlt oder ist kein Objekt")
        elif doc_id in documents:
            problems.append(f"Dokument {doc_id}: mehrfach geliefert (mehrere Indizes?)")
        else:
            documents[doc_id] = source
    return sorted(documents.items()), problems


def summarize(sources: Sequence[Mapping[str, Any]]) -> tuple[int, dict[str, int]]:
    """Gibt (Anzahl ohne storeCode, Anzahl je Markt)."""
    legacy = 0
    per_store: dict[str, int] = {}
    for source in sources:
        code = source.get("storeCode")
        code = code.strip() if isinstance(code, str) else ""
        if code:
            per_store[code] = per_store.get(code, 0) + 1
        else:
            legacy += 1
    return legacy, dict(sorted(per_store.items()))


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


def http_request(method: str, url: str, body: Optional[bytes], headers: Mapping[str, str],
                 timeout: float) -> FetchResult:
    request = urllib.request.Request(url, data=body, headers=dict(headers), method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            status = response.status
            text = response.read().decode("utf-8", errors="replace")
        return FetchResult(status=status, body=text)
    except urllib.error.HTTPError as exc:
        try:
            text = exc.read().decode("utf-8", errors="replace")
        except (OSError, ValueError):
            text = ""
        return FetchResult(status=exc.code, body=text)
    except (urllib.error.URLError, OSError, ValueError) as exc:
        return FetchResult(status=None, error=str(getattr(exc, "reason", exc)))


def _send_safe(send: Send, method: str, url: str, body: Optional[bytes], timeout: float) -> FetchResult:
    try:
        return send(method, url, body, JSON_HEADERS, timeout)
    except OSError as exc:
        return FetchResult(status=None, error=str(exc))


def scroll_all(send: Send, base: str, index: str, timeout: float) -> tuple[list[dict[str, Any]], str]:
    """Liest alle Treffer per Scroll. Nur lesend; der Scroll-Kontext laeuft von selbst ab."""
    result = _send_safe(send, "POST", scroll_start_url(base, index), scroll_body(SCROLL_PAGE_SIZE), timeout)
    hits: list[dict[str, Any]] = []
    for _ in range(MAX_SCROLL_PAGES):
        scroll_id, page, problem = parse_scroll_page(result)
        if problem:
            return [], problem
        if not page:
            return hits, ""
        hits.extend(page)
        result = _send_safe(send, "POST", f"{base}/_search/scroll", scroll_next_body(scroll_id), timeout)
    return [], f"mehr als {MAX_SCROLL_PAGES} Scroll-Seiten - Abbruch"


def run_opensearch_export(args: argparse.Namespace, send: Send, now: datetime) -> int:
    base = args.opensearch_url
    quoted = urllib.parse.quote(args.index, safe="")
    indices, problem = parse_alias_response(_send_safe(
        send, "GET", f"{base}/{quoted}", None, args.timeout))
    if problem:
        print(f"FEHLER: {problem} ({args.index})", file=sys.stderr)
        return 1
    if len(indices) != 1:
        print(f"FEHLER: {args.index} zeigt auf {len(indices)} Indizes ({', '.join(indices)}) - "
              "Abbruch, eindeutigen Index mit --index angeben.", file=sys.stderr)
        return 1
    print(f"Index: {args.index} -> {indices[0]}")

    hits, problem = scroll_all(send, base, args.index, args.timeout)
    if problem:
        print(f"FEHLER: {problem}", file=sys.stderr)
        return 1
    documents, problems = collect_documents(hits)
    if problems:
        for line in problems[:20]:
            print(f"FEHLER: {line}", file=sys.stderr)
        return 1
    expected, problem = parse_count_response(_send_safe(
        send, "GET", f"{base}/{quoted}/_count", None, args.timeout))
    if problem:
        print(f"FEHLER: {problem}", file=sys.stderr)
        return 1
    if not documents:
        print("FEHLER: 0 Produkte geliefert (leerer Index?)", file=sys.stderr)
        return 1
    if len(documents) != expected:
        print(f"FEHLER: {len(documents)} Dokumente gelesen, aber _count meldet {expected} - "
              "Abbruch, nichts geschrieben.", file=sys.stderr)
        return 1

    sources = [source for _, source in documents]
    legacy, per_store = summarize(sources)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    target = pick_output_path(out_dir, now, "products-all")
    with target.open("x", encoding="utf-8", newline="\n") as handle:
        handle.write(to_ndjson(sources))
    print(f"{len(sources)} Produkte geschrieben nach {target}")
    print(f"Ohne storeCode: {legacy}")
    for code, number in per_store.items():
        print(f"Markt {code}: {number}")
    return 0


def main(argv: Optional[Sequence[str]] = None, fetch: Fetch = http_get,
         sleep: Sleep = time.sleep, now: Optional[datetime] = None,
         send: Send = http_request) -> int:
    args = build_parser().parse_args(argv)
    if args.opensearch_url:
        return run_opensearch_export(args, send, now or datetime.now(timezone.utc))
    print("WARNUNG: Teilexport ueber die API - ohne Markt kommen nur Altdokumente ohne storeCode, "
          "und size ist auf 500 begrenzt. Fuer die Vollsicherung --opensearch-url verwenden.",
          file=sys.stderr)
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
