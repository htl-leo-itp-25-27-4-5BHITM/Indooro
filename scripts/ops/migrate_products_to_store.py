#!/usr/bin/env python3
"""Migriert Produkte ohne Markt (storeId/storeCode leer) in den store-scoped Katalog.

Standard ist DRY-RUN: Quelle lesen, auswerten, Datei schreiben, keine Schreibzugriffe.

Aufrufe (aus dem Repo-Root):
    python3 scripts/ops/migrate_products_to_store.py --store-code <CODE> --input backups/<datei>.ndjson
    python3 scripts/ops/migrate_products_to_store.py --store-code <CODE> --base-url https://it220209.cloud.htl-leonding.ac.at
    export INDOORO_ADMIN_TOKEN=<Admin-Token>        # nie in die Befehlszeile schreiben
    python3 scripts/ops/migrate_products_to_store.py --store-code <CODE> --input backups/<datei>.ndjson \\
        --apply --base-url https://it220209.cloud.htl-leonding.ac.at
    python3 scripts/ops/migrate_products_to_store.py --store-code <CODE> --delete-legacy \\
        --opensearch-url http://127.0.0.1:9200            # Dry-Run; mit --yes wirklich loeschen

Ausgabedatei: backups/<UTC-Datum>-products-<CODE>.ndjson (Produkte ohne Markt, mit storeCode).
Die Quelle wird nie veraendert. Produkte mit anderem Markt werden nicht angefasst.

Exit 0 = OK, 1 = Abbruch oder Fehler, 2 = falsche Aufrufparameter. Nur Standardbibliothek.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, Optional, Sequence

DEFAULT_SIZE = 10000
DEFAULT_OUT_DIR = "backups"
DEFAULT_TIMEOUT = 30.0
DEFAULT_RETRIES = 2
RETRY_PAUSE_SECONDS = 2.0
DELETE_TIMEOUT_SECONDS = 300.0
BULK_BLOCK_SIZE = 100
DEFAULT_TOKEN_ENV = "INDOORO_ADMIN_TOKEN"
ALLOWED_SCHEMES = ("http", "https")
LOOPBACK_HOSTS = ("127.0.0.1", "localhost", "::1")
USER_AGENT = "indooro-migrate-products/1.0"
PROBLEM_LIMIT = 20
STORE_CODE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
TOKEN_ENV_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,127}$")

STORE_FIELDS = ("storeId", "storeCode")
LEGACY_QUERY: dict[str, Any] ={"query": {"bool": {"must_not": {"exists": {"field": "storeCode"}}}}}
GET_HEADERS = {"Accept": "application/json", "User-Agent": USER_AGENT}
JSON_HEADERS = {"Accept": "application/json", "Content-Type": "application/json",
                "User-Agent": USER_AGENT}


@dataclass(frozen=True)
class FetchResult:
    """Antwort eines HTTP-Aufrufs. status ist None bei Netzwerkfehler oder Timeout."""

    status: Optional[int]
    body: str = ""
    error: str = ""


@dataclass
class Plan:
    """Ergebnis der reinen Auswertung (ohne Netzwerk)."""

    total: int = 0
    to_migrate: list[Any] = field(default_factory=list)
    already_in_target: int = 0
    other_market: int = 0
    problems: list[str] = field(default_factory=list)


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


def _store_code(value: str) -> str:
    stripped = value.strip()
    if not STORE_CODE_RE.match(stripped):
        raise argparse.ArgumentTypeError("erlaubt: Buchstaben, Ziffern, Punkt, Unterstrich, Bindestrich")
    return stripped


def _token_env(value: str) -> str:
    stripped = value.strip()
    if not TOKEN_ENV_RE.match(stripped):
        raise argparse.ArgumentTypeError("gueltiger Name einer Umgebungsvariable erwartet")
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
        description="Migriert Produkte ohne Markt in den store-scoped Katalog (Standard: Dry-Run).",
        epilog=(
            "Quelle: --input DATEI ODER --base-url URL (mit --apply ist --base-url das Ziel).\n"
            "--delete-legacy laeuft allein und braucht --opensearch-url. OpenSearch ist nicht "
            "oeffentlich: kubectl -n student-it220209 port-forward svc/opensearch 9200:9200, "
            "dann --opensearch-url http://127.0.0.1:9200. Nur Loopback-Hosts sind erlaubt.\n"
            "Das Admin-Token kommt aus einer Umgebungsvariable (--token-env) und wird nie ausgegeben."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--store-code", required=True, type=_store_code,
                        help="Ziel-Markt, z. B. SPAR-Leonding-001 (Pflicht)")
    parser.add_argument("--input", metavar="DATEI",
                        help="Quelle: NDJSON oder JSON-Array (wie export_products.py)")
    parser.add_argument("--base-url", type=parse_base_url,
                        help="Quelle ohne --input: GET <url>/api/products; Ziel mit --apply (nur http/https)")
    parser.add_argument("--apply", action="store_true",
                        help="Produkte per POST <url>/api/products/bulk?storeCode=... senden")
    parser.add_argument("--token-env", type=_token_env, default=DEFAULT_TOKEN_ENV,
                        help=f"Umgebungsvariable mit dem Admin-Token (Standard: {DEFAULT_TOKEN_ENV})")
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR,
                        help=f"Zielverzeichnis fuer die Ausgabedatei (Standard: {DEFAULT_OUT_DIR})")
    parser.add_argument("--timeout", type=_positive_float, default=DEFAULT_TIMEOUT,
                        help=f"Timeout je Anfrage in Sekunden (Standard: {DEFAULT_TIMEOUT:g})")
    parser.add_argument("--retries", type=_non_negative_int, default=DEFAULT_RETRIES,
                        help=f"Wiederholungen beim Lesen (GET) bei 5xx/Netzwerkfehler (Standard: {DEFAULT_RETRIES})")
    parser.add_argument("--delete-legacy", action="store_true",
                        help="Dokumente ohne storeCode aus dem Index products loeschen (eigenstaendig)")
    parser.add_argument("--opensearch-url", type=parse_opensearch_url,
                        help="OpenSearch-Basis-URL, nur Loopback (fuer --delete-legacy)")
    parser.add_argument("--yes", action="store_true",
                        help="Loeschen wirklich ausfuehren (ohne --yes nur Dry-Run bei --delete-legacy)")
    return parser


def argument_problem(args: argparse.Namespace) -> str:
    """Leer, wenn die Kombination der Parameter gueltig ist; sonst Fehlertext."""
    if args.delete_legacy:
        if args.input or args.base_url or args.apply:
            return "--delete-legacy laeuft allein: nicht zusammen mit --input, --base-url oder --apply"
        if not args.opensearch_url:
            return "--delete-legacy braucht --opensearch-url"
        return ""
    if args.opensearch_url or args.yes:
        return "--opensearch-url und --yes gehoeren zu --delete-legacy"
    if args.input and args.base_url and not args.apply:
        return "nur eine Quelle: --input ODER --base-url (mit --apply ist --base-url das Ziel)"
    if not args.input and not args.base_url:
        return "Quelle fehlt: --input DATEI oder --base-url URL"
    if args.apply and not args.base_url:
        return "--apply braucht --base-url URL (Ziel)"
    return ""


# ---------------------------------------------------------------------------
# Reine Logik (ohne Netzwerk)
# ---------------------------------------------------------------------------

def products_url(base_url: str, size: int) -> str:
    return f"{base_url.rstrip('/')}/api/products?" + urllib.parse.urlencode({"size": size})


def bulk_url(base_url: str, store_code: str) -> str:
    return f"{base_url.rstrip('/')}/api/products/bulk?" + urllib.parse.urlencode({"storeCode": store_code})


def migrated_query(store_code: str) -> dict[str, Any]:
    return {"query": {"term": {"storeCode": store_code}}}


def parse_products_text(text: str) -> tuple[list[Any], str]:
    """NDJSON (eine Zeile pro Produkt) oder JSON-Array. Gibt (Produkte, Fehlertext)."""
    stripped = text.strip()
    if not stripped:
        return [], "Eingabe ist leer"
    if stripped.startswith("["):
        try:
            data = json.loads(stripped)
        except json.JSONDecodeError as exc:
            return [], f"JSON-Array ungueltig ({exc.msg})"
        if not isinstance(data, list):
            return [], "Eingabe ist kein JSON-Array"
        items: list[Any] = data
    else:
        items = []
        for number, line in enumerate(stripped.splitlines(), start=1):
            if not line.strip():
                continue
            try:
                items.append(json.loads(line))
            except json.JSONDecodeError as exc:
                return [], f"Zeile {number} ist kein gueltiges JSON ({exc.msg})"
    if not items:
        return [], "keine Produkte in der Eingabe"
    return items, ""


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


def _text(value: Any) -> str:
    """Strip-bereinigter Text; None, bool und Container gelten als leer."""
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        return ""
    return str(value).strip()


def evaluate_products(items: Sequence[Any], store_code: str) -> Plan:
    """Zaehlt und prueft die Eingabe. Keine Aenderung an den Produkten."""
    plan = Plan(total=len(items))
    first_row: dict[str, int] = {}
    for row, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            plan.problems.append(f"Zeile {row}: kein JSON-Objekt")
            continue
        product_id = _text(item.get("id"))
        if not product_id:
            plan.problems.append(f"Zeile {row}: id fehlt")
        elif product_id in first_row:
            plan.problems.append(f"doppelte id {product_id} (Zeilen {first_row[product_id]} und {row})")
        else:
            first_row[product_id] = row
        if not _text(item.get("name")):
            plan.problems.append(f"Zeile {row} (id {product_id or '?'}): name fehlt")
        code = _text(item.get("storeCode"))
        store_id = _text(item.get("storeId"))
        if not code and not store_id:
            plan.to_migrate.append(item)
        elif code == store_code:
            plan.already_in_target += 1
        else:
            plan.other_market += 1
    return plan


def strip_empty_store_fields(item: Mapping[str, Any]) -> dict[str, Any]:
    """Bulk-Body: leere storeId/storeCode weglassen, der Markt kommt aus der Query."""
    return {key: value for key, value in item.items()
            if not (key in STORE_FIELDS and not _text(value))}


def rewrite_product(item: Mapping[str, Any], store_code: str) -> dict[str, Any]:
    """Kopie mit storeCode; alle uebrigen Felder bleiben erhalten."""
    rewritten = dict(item)
    rewritten["storeCode"] = store_code
    return rewritten


def to_ndjson(items: Sequence[Any]) -> str:
    lines = [json.dumps(item, ensure_ascii=False, separators=(",", ":")) for item in items]
    return "\n".join(lines) + "\n"


def chunk(items: Sequence[Any], size: int) -> list[list[Any]]:
    return [list(items[start:start + size]) for start in range(0, len(items), size)]


def evaluate_bulk_response(result: FetchResult, expected: int) -> tuple[int, list[str]]:
    """Gibt (gespeicherte Zeilen, Problemzeilen). Problemzeilen leer heisst Block OK."""
    if result.status is None:
        detail = result.error or "Transportfehler"
        return 0, [f"keine Antwort vom Backend ({detail}); Teilschreiben moeglich, Ziel pruefen"]
    try:
        data = json.loads(result.body)
    except json.JSONDecodeError:
        data = None
    if not isinstance(data, dict):
        hint = " (Token ungueltig oder keine Admin-Rolle?)" if result.status in (401, 403) else ""
        return 0, [f"HTTP {result.status}: Antwort ist kein Ergebnis-Objekt{hint}"]

    problems: list[str] = []
    if not 200 <= result.status < 300:
        problems.append(f"HTTP {result.status}")
    rows = data.get("rows") if isinstance(data.get("rows"), list) else []
    for row in rows:
        if isinstance(row, dict) and row.get("status") != "saved":
            reason = row.get("reason") or "ohne Grund"
            problems.append(f"Zeile {row.get('row')} (id {row.get('id')}): {row.get('status')} - {reason}")

    counts = [data.get(key) for key in ("saved", "failed", "unknown")]
    if not all(isinstance(value, int) and not isinstance(value, bool) for value in counts):
        return 0, problems + ["Antwort ohne gueltige Zaehlfelder saved/failed/unknown"]
    saved, failed, unknown = counts
    if not problems and (saved != expected or failed != 0 or unknown != 0):
        problems.append(f"gespeichert {saved} von {expected}, fehlgeschlagen {failed}, unbekannt {unknown}")
    return saved, problems


def pick_output_path(out_dir: Path, store_code: str, now: datetime) -> Path:
    """backups/<UTC-Datum>-products-<CODE>.ndjson; bei Existenz -HHMMSS anhaengen."""
    stem = f"{now:%Y-%m-%d}-products-{store_code}"
    plain = out_dir / f"{stem}.ndjson"
    if not plain.exists():
        return plain
    return out_dir / f"{stem}-{now:%H%M%S}.ndjson"


def legacy_delete_problem(legacy: int, migrated: int) -> str:
    """Leer, wenn das Loeschen der Legacy-Dokumente sicher ist."""
    if legacy == 0:
        return "keine Dokumente ohne storeCode gefunden - nichts zu loeschen (Abbruch)"
    if migrated < legacy:
        return (f"nur {migrated} migrierte Dokumente, aber {legacy} ohne storeCode - "
                "Abbruch, nichts geloescht")
    return ""


def redact(text: str, secret: str) -> str:
    return text.replace(secret, "***") if secret else text


# ---------------------------------------------------------------------------
# I/O
# ---------------------------------------------------------------------------

class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Keine Weiterleitungen: der Token-Header darf nie zu einem anderen Host wandern."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D401
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def http_request(method: str, url: str, body: Optional[bytes], headers: Mapping[str, str],
                 timeout: float) -> FetchResult:
    request = urllib.request.Request(url, data=body, headers=dict(headers), method=method)
    try:
        with _OPENER.open(request, timeout=timeout) as response:
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


def fetch_with_retries(send: Send, url: str, timeout: float, retries: int,
                       sleep: Sleep) -> FetchResult:
    """Nur fuer GET: wiederholt bei 5xx und Netzwerkfehlern, nie bei POST/DELETE."""
    attempt = 0
    while True:
        result = send("GET", url, None, GET_HEADERS, timeout)
        retryable = result.status is None or result.status >= 500
        if not retryable or attempt >= retries:
            return result
        attempt += 1
        sleep(RETRY_PAUSE_SECONDS)


def write_output(products: Sequence[Any], store_code: str, out_dir: Path, now: datetime) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    target = pick_output_path(out_dir, store_code, now)
    rewritten = [rewrite_product(item, store_code) for item in products]
    with target.open("x", encoding="utf-8", newline="\n") as handle:
        handle.write(to_ndjson(rewritten))
    return target


def load_products(args: argparse.Namespace, send: Send, sleep: Sleep) -> tuple[list[Any], str, str]:
    """Gibt (Produkte, Quellenbezeichnung, Fehlertext)."""
    if args.input:
        path = Path(args.input)
        try:
            text = path.read_text(encoding="utf-8-sig")
        except OSError as exc:
            return [], str(path), f"Eingabedatei nicht lesbar: {path} ({exc.strerror or exc})"
        items, problem = parse_products_text(text)
        return items, str(path), problem
    url = products_url(args.base_url, DEFAULT_SIZE)
    response = fetch_with_retries(send, url, args.timeout, args.retries, sleep)
    items, problem = validate_products_response(response.status, response.body)
    if problem and response.error and response.status is None:
        problem = f"{problem} ({response.error})"
    return items, args.base_url, problem


def _print_problems(problems: Sequence[str], stream: Any) -> None:
    for line in problems[:PROBLEM_LIMIT]:
        print(f"FEHLER: {line}", file=stream)
    if len(problems) > PROBLEM_LIMIT:
        print(f"... und {len(problems) - PROBLEM_LIMIT} weitere", file=stream)


def send_blocks(products: Sequence[Any], base_url: str, store_code: str, token: str,
                send: Send, timeout: float) -> int:
    url = bulk_url(base_url, store_code)
    headers = {**JSON_HEADERS, "Authorization": f"Bearer {token}"}
    blocks = chunk(products, BULK_BLOCK_SIZE)
    saved_total = 0
    for number, block in enumerate(blocks, start=1):
        payload = [strip_empty_store_fields(item) for item in block]
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        result = send("POST", url, body, headers, timeout)
        saved, problems = evaluate_bulk_response(result, len(block))
        if problems:
            safe = [redact(line, token) for line in problems]
            print(f"FEHLER: Block {number}/{len(blocks)} nicht vollstaendig gespeichert.", file=sys.stderr)
            _print_problems(safe, sys.stderr)
            print(f"Abbruch nach {saved_total} gespeicherten Produkten. Keine weiteren Blocke gesendet. "
                  "Ziel vor einem erneuten Lauf pruefen (Dry-Run).", file=sys.stderr)
            return 1
        saved_total += saved
        print(f"Block {number}/{len(blocks)}: {saved} gespeichert")
    print(f"Fertig: {saved_total} Produkte in Markt {store_code} gespeichert.")
    return 0


def run_migration(args: argparse.Namespace, send: Send, sleep: Sleep, now: datetime,
                  environ: Mapping[str, str]) -> int:
    token = ""
    if args.apply:
        token = (environ.get(args.token_env) or "").strip()
        if not token:
            print(f"FEHLER: Umgebungsvariable {args.token_env} fehlt oder ist leer "
                  "(Admin-Token dort setzen, nicht auf der Befehlszeile).", file=sys.stderr)
            return 1

    products, label, problem = load_products(args, send, sleep)
    if problem:
        print(f"FEHLER: {problem}", file=sys.stderr)
        return 1

    plan = evaluate_products(products, args.store_code)
    if plan.problems:
        _print_problems(plan.problems, sys.stderr)
        print("Abbruch: Eingabe fehlerhaft, nichts geschrieben und nichts gesendet.", file=sys.stderr)
        return 1

    print(f"Quelle: {label}")
    print(f"Produkte gesamt: {plan.total}")
    print(f"Ohne Markt (zu migrieren): {len(plan.to_migrate)}")
    print(f"Schon im Ziel-Markt {args.store_code}: {plan.already_in_target}")
    print(f"In anderem Markt (uebersprungen): {plan.other_market}")

    if plan.to_migrate:
        try:
            target = write_output(plan.to_migrate, args.store_code, Path(args.out_dir), now)
        except OSError as exc:
            print(f"FEHLER: Ausgabedatei nicht schreibbar ({exc.strerror or exc})", file=sys.stderr)
            return 1
        print(f"Datei: {target} ({len(plan.to_migrate)} Produkte mit storeCode)")
    else:
        print("Keine Produkte ohne Markt - keine Datei geschrieben.")

    if not args.apply:
        print("DRY-RUN: keine Schreibzugriffe. Zum Senden: --apply --base-url URL "
              f"(Token in {args.token_env}).")
        return 0
    if not plan.to_migrate:
        print("Nichts zu migrieren.")
        return 0
    return send_blocks(plan.to_migrate, args.base_url, args.store_code, token, send, args.timeout)


def count_documents(send: Send, base: str, query: Mapping[str, Any],
                    timeout: float) -> tuple[Optional[int], str]:
    body = json.dumps(query).encode("utf-8")
    result = send("GET", f"{base}/products/_count", body, JSON_HEADERS, timeout)
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


def parse_delete_response(result: FetchResult) -> tuple[int, str]:
    if result.status is None:
        return 0, f"OpenSearch nicht erreichbar ({result.error or 'Transportfehler'})"
    if not 200 <= result.status < 300:
        return 0, f"OpenSearch HTTP {result.status} bei _delete_by_query"
    try:
        data = json.loads(result.body)
    except json.JSONDecodeError:
        return 0, "Antwort von _delete_by_query ist kein JSON"
    deleted = data.get("deleted") if isinstance(data, dict) else None
    if not isinstance(deleted, int) or isinstance(deleted, bool):
        return 0, "Antwort von _delete_by_query ohne Feld deleted"
    failures = data.get("failures") or []
    failure_count = len(failures) if isinstance(failures, list) else 1
    if failure_count or data.get("timed_out") is True:
        return deleted, (f"_delete_by_query meldet {failure_count} Fehler "
                         f"(timed_out={data.get('timed_out')}); Index vor einem erneuten Lauf pruefen")
    return deleted, ""


def run_delete_legacy(args: argparse.Namespace, send: Send) -> int:
    base = args.opensearch_url
    legacy, problem = count_documents(send, base, LEGACY_QUERY, args.timeout)
    if problem:
        print(f"FEHLER: {problem}", file=sys.stderr)
        return 1
    migrated, problem = count_documents(send, base, migrated_query(args.store_code), args.timeout)
    if problem:
        print(f"FEHLER: {problem}", file=sys.stderr)
        return 1
    print(f"Index products: ohne storeCode {legacy}, in Markt {args.store_code} {migrated}")
    problem = legacy_delete_problem(legacy, migrated)
    if problem:
        print(f"FEHLER: {problem}", file=sys.stderr)
        return 1
    if not args.yes:
        print(f"DRY-RUN: wuerde {legacy} Dokumente ohne storeCode loeschen. "
              "Zum Loeschen erneut mit --yes starten.")
        return 0

    body = json.dumps(LEGACY_QUERY).encode("utf-8")
    result = send("POST", f"{base}/products/_delete_by_query?refresh=true", body, JSON_HEADERS,
                  DELETE_TIMEOUT_SECONDS)
    deleted, problem = parse_delete_response(result)
    if problem:
        print(f"FEHLER: {problem}", file=sys.stderr)
        return 1
    remaining, problem = count_documents(send, base, LEGACY_QUERY, args.timeout)
    if problem or remaining:
        detail = problem or f"noch {remaining} Dokumente ohne storeCode"
        print(f"FEHLER: Nach dem Loeschen: {detail}", file=sys.stderr)
        return 1
    print(f"{deleted} Dokumente ohne storeCode geloescht. Verbleibend ohne storeCode: 0. "
          f"In Markt {args.store_code}: {migrated}.")
    return 0


def main(argv: Optional[Sequence[str]] = None, send: Send = http_request,
         sleep: Sleep = time.sleep, now: Optional[datetime] = None,
         environ: Optional[Mapping[str, str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    problem = argument_problem(args)
    if problem:
        parser.error(problem)
    moment = now or datetime.now(timezone.utc)
    env: Mapping[str, str] = os.environ if environ is None else environ
    if args.delete_legacy:
        return run_delete_legacy(args, send)
    return run_migration(args, send, sleep, moment, env)


if __name__ == "__main__":
    sys.exit(main())
