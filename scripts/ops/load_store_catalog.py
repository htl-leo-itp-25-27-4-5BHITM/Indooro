#!/usr/bin/env python3
"""Laedt den alten Katalog (Produkte ohne Markt) sicher in einen Markt.

Ersetzt das gesperrte Rollout-Skript vom 2026-10-18 fuer die Katalog-Migration. Es braucht
kein Admin-Token: geschrieben wird nur ueber den CSV-Import im Admin (/admin/next/, eingeloggt).
Das Skript bereitet die CSV vor, prueft vorher und nachher und bricht bei jeder Abweichung ab.

Ablauf:
  1. Markt pruefen: Store-Code muss exakt in GET /api/mobile/stores stehen, Layout ACTIVE.
  2. Produkte ohne Markt lesen (live oder --input), nur Produkte mit passendem Regal behalten.
  3. CSV schreiben: backups/<UTC-Datum>-catalog-<CODE>.csv (+ Liste der nicht passenden).
  4. Mensch: CSV im Admin unter Produkte > Markt waehlen > CSV-Import hochladen.
  5. Nachpruefung: jede CSV-Id muss live im Markt stehen, Suche im Markt liefert Treffer.
  6. Optional (--set-default): CATALOG_DEFAULT_STORE_CODE per kubectl setzen, pruefen,
     bei Fehler automatisch zuruecknehmen.

Aufruf (aus dem Repo-Root):
    python3 scripts/ops/load_store_catalog.py
    python3 scripts/ops/load_store_catalog.py --store-code SPAR-Leonding-002
    python3 scripts/ops/load_store_catalog.py --store-code SPAR-Leonding-002 --set-default

Exit 0 = OK, 1 = Abbruch oder Fehler, 2 = falsche Aufrufparameter. Nur Standardbibliothek.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, Optional, Sequence

DEFAULT_BASE_URL = "https://it220209.cloud.htl-leonding.ac.at"
DEFAULT_NAMESPACE = "student-it220209"
DEPLOYMENT = "deployment/indooro-backend"
DEFAULT_OUT_DIR = "backups"
DEFAULT_TIMEOUT = 30.0
PAGE_SIZE = 500
USER_AGENT = "indooro-load-store-catalog/1.0"
CSV_COLUMNS = ("id", "name", "kategorie", "meter", "fach", "reihe", "preis")
LAYOUT_CODE_RE = re.compile(r"^(\d{1,4})/(\d{1,3})/(\d{1,2})/(\d{1,2})$")
SEARCH_WORD_RE = re.compile(r"[A-Za-zÄÖÜäöüß]{4,}")
DONE_WORD = "fertig"


@dataclass(frozen=True)
class FetchResult:
    status: Optional[int]
    body: str = ""
    error: str = ""


@dataclass
class Selection:
    """Produkte ohne Markt, aufgeteilt nach Regal im Ziel-Layout."""

    placeable: list[dict[str, Any]] = field(default_factory=list)
    no_shelf: list[dict[str, Any]] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)


Send = Callable[[str], FetchResult]
Ask = Callable[[str], str]
Run = Callable[[Sequence[str]], tuple[int, str]]


class Abort(Exception):
    """Harter Abbruch mit Meldung. Nichts danach wird ausgefuehrt."""


# ---------------------------------------------------------------------------
# Reine Logik (ohne Netzwerk)
# ---------------------------------------------------------------------------

def parse_json(result: FetchResult, what: str) -> Any:
    if result.status is None:
        raise Abort(f"{what}: keine Antwort ({result.error or 'Transportfehler'})")
    if result.status != 200:
        raise Abort(f"{what}: HTTP {result.status} statt 200")
    try:
        return json.loads(result.body)
    except json.JSONDecodeError as exc:
        raise Abort(f"{what}: Antwort ist kein JSON ({exc.msg})") from exc


def find_store(stores: Any, store_code: str) -> dict[str, Any]:
    if not isinstance(stores, list) or not stores:
        raise Abort("Marktliste ist leer oder kein JSON-Array")
    for store in stores:
        if isinstance(store, dict) and store.get("storeCode") == store_code:
            if not store.get("id"):
                raise Abort(f"Markt {store_code} hat keine id")
            return store
    known = ", ".join(str(s.get("storeCode")) for s in stores if isinstance(s, dict))
    raise Abort(f"Store-Code {store_code!r} existiert nicht (exakte Schreibweise). Vorhanden: {known}")


def shelf_codes(layout_response: Any) -> set[str]:
    """Regal-Codes 'kategorie/meter' des aktiven Layouts. Bricht bei Fallback-Layout ab."""
    if not isinstance(layout_response, dict):
        raise Abort("Layout-Antwort ist kein Objekt")
    if layout_response.get("fallback") is not False or layout_response.get("source") != "ACTIVE":
        raise Abort("Markt hat kein eigenes aktives Layout (fallback oder nicht ACTIVE). "
                    "Erst im Editor ein Layout aktivieren.")
    layout = layout_response.get("layout")
    elements = layout.get("elements") if isinstance(layout, dict) else None
    if not isinstance(elements, list):
        raise Abort("Layout ohne elements")
    codes = {str(e.get("category")).strip() for e in elements
             if isinstance(e, dict) and e.get("type") == "shelf"
             and isinstance(e.get("category"), str) and e.get("category").strip()}
    if not codes:
        raise Abort("Layout hat keine Regale mit Kategorie")
    return codes


def normalize_shelf(kategorie: str, meter: str) -> str:
    return f"{int(kategorie)}/{int(meter)}"


def select_products(products: Sequence[Any], shelves: set[str]) -> Selection:
    """Nur Produkte ohne Markt. Prueft Felder so streng wie der Admin-CSV-Import."""
    selection = Selection()
    seen: set[int] = set()
    normalized = set()
    for code in shelves:
        parts = code.split("/")
        if len(parts) == 2 and all(part.isdigit() for part in parts):
            normalized.add(normalize_shelf(*parts))
    for row, item in enumerate(products, start=1):
        if not isinstance(item, dict):
            selection.problems.append(f"Eintrag {row}: kein Objekt")
            continue
        if item.get("storeCode") or item.get("storeId"):
            continue
        product_id = item.get("id")
        if isinstance(product_id, bool) or not isinstance(product_id, int) or product_id < 1:
            selection.problems.append(f"Eintrag {row}: id fehlt oder ist keine positive Zahl")
            continue
        if product_id in seen:
            selection.problems.append(f"id {product_id} doppelt")
            continue
        seen.add(product_id)
        name = item.get("name")
        if not isinstance(name, str) or not name.strip():
            selection.problems.append(f"id {product_id}: name fehlt")
            continue
        price = item.get("price")
        if price is not None and (isinstance(price, bool) or not isinstance(price, (int, float)) or price < 0):
            selection.problems.append(f"id {product_id}: price ungueltig")
            continue
        match = LAYOUT_CODE_RE.match(str(item.get("layoutCode") or "").strip())
        if not match or any(int(part) < 1 for part in match.groups()):
            selection.problems.append(f"id {product_id}: layoutCode {item.get('layoutCode')!r} ungueltig")
            continue
        if normalize_shelf(match.group(1), match.group(2)) in normalized:
            selection.placeable.append(item)
        else:
            selection.no_shelf.append(item)
    return selection


def format_price(price: Any) -> str:
    return "" if price is None else f"{float(price):.2f}"


def to_csv(products: Sequence[Mapping[str, Any]]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";", lineterminator="\n")
    writer.writerow(CSV_COLUMNS)
    for item in products:
        kategorie, meter, fach, reihe = LAYOUT_CODE_RE.match(str(item["layoutCode"]).strip()).groups()
        writer.writerow([item["id"], item["name"].strip(), int(kategorie), int(meter), int(fach),
                         int(reihe), format_price(item.get("price"))])
    return buffer.getvalue()


def missing_ids(expected: Sequence[Mapping[str, Any]], live: Sequence[Any], store_code: str) -> list[int]:
    live_ids = {item.get("id") for item in live
                if isinstance(item, dict) and item.get("storeCode") == store_code}
    return sorted(item["id"] for item in expected if item["id"] not in live_ids)


def search_word(products: Sequence[Mapping[str, Any]]) -> str:
    for item in products:
        match = SEARCH_WORD_RE.search(item["name"])
        if match:
            return match.group(0)
    raise Abort("kein Suchwort aus den Produktnamen ableitbar")


def search_hits(result: Any, store_code: str) -> tuple[int, int]:
    """(Treffer gesamt, Treffer aus anderem oder keinem Markt)."""
    if not isinstance(result, list):
        raise Abort("Suchantwort ist kein JSON-Array")
    foreign = sum(1 for item in result if not isinstance(item, dict) or item.get("storeCode") != store_code)
    return len(result), foreign


# ---------------------------------------------------------------------------
# I/O
# ---------------------------------------------------------------------------

class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D401
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def http_get(url: str) -> FetchResult:
    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": USER_AGENT})
    try:
        with _OPENER.open(request, timeout=DEFAULT_TIMEOUT) as response:
            return FetchResult(response.status, response.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as exc:
        return FetchResult(exc.code, "")
    except (urllib.error.URLError, OSError, ValueError) as exc:
        return FetchResult(None, error=str(getattr(exc, "reason", exc)))


def run_command(command: Sequence[str]) -> tuple[int, str]:
    try:
        done = subprocess.run(list(command), capture_output=True, text=True, timeout=360, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return 1, str(exc)
    return done.returncode, (done.stdout + done.stderr).strip()


def url(base: str, path: str, **query: Any) -> str:
    text = f"{base}{path}"
    return f"{text}?{urllib.parse.urlencode(query)}" if query else text


def fetch_products(send: Send, base: str, **query: Any) -> list[Any]:
    """GET /api/products mit size=500. Die Route kennt kein page: volle Seite heisst Abbruch."""
    data = parse_json(send(url(base, "/api/products", size=PAGE_SIZE, **query)), "Produktliste")
    if not isinstance(data, list):
        raise Abort("Produktliste ist kein JSON-Array")
    if len(data) >= PAGE_SIZE:
        raise Abort(f"{PAGE_SIZE} oder mehr Produkte, die Liste ist evtl. abgeschnitten. Abbruch")
    return data


def load_input(path: str) -> list[Any]:
    try:
        text = Path(path).read_text(encoding="utf-8-sig")
    except OSError as exc:
        raise Abort(f"Eingabedatei nicht lesbar: {path} ({exc.strerror or exc})") from exc
    items = []
    for number, line in enumerate(text.splitlines(), start=1):
        if line.strip():
            try:
                items.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise Abort(f"Zeile {number} ist kein JSON ({exc.msg})") from exc
    if not items:
        raise Abort("Eingabedatei enthaelt keine Produkte")
    return items


def confirm_code(ask: Ask, store_code: str, question: str) -> None:
    answer = ask(f"{question}\nZum Bestaetigen den Store-Code genau eintippen ({store_code}): ").strip()
    if answer != store_code:
        raise Abort(f"Eingabe {answer!r} ist nicht {store_code!r}. Gestoppt, nichts geaendert.")


def write_files(out_dir: Path, store_code: str, selection: Selection, now: datetime) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = f"{now:%Y-%m-%d}-catalog-{store_code}"
    target = out_dir / f"{stem}.csv"
    if target.exists():
        target = out_dir / f"{stem}-{now:%H%M%S}.csv"
    target.write_text(to_csv(selection.placeable), encoding="utf-8")
    if selection.no_shelf:
        skipped = target.with_name(target.stem + "-ohne-regal.ndjson")
        skipped.write_text("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in selection.no_shelf),
                           encoding="utf-8")
        print(f"Ohne passendes Regal (nicht importiert): {len(selection.no_shelf)} -> {skipped}")
    return target


def verify_import(send: Send, base: str, store_code: str, expected: Sequence[Mapping[str, Any]]) -> None:
    live = fetch_products(send, base, storeCode=store_code)
    missing = missing_ids(expected, live, store_code)
    if missing:
        shown = ", ".join(str(i) for i in missing[:20])
        raise Abort(f"{len(missing)} von {len(expected)} Produkten fehlen live im Markt (ids {shown}). "
                    "Import im Admin pruefen und Skript erneut starten. Nichts weiter geaendert.")
    print(f"OK: alle {len(expected)} Produkte live im Markt {store_code} ({len(live)} gesamt).")
    word = search_word(expected)
    total, foreign = search_hits(parse_json(
        send(url(base, "/api/products/search", q=word, storeCode=store_code)), "Suche im Markt"), store_code)
    if total == 0 or foreign:
        raise Abort(f"Suche {word!r} im Markt: {total} Treffer, {foreign} aus anderem Markt")
    print(f"OK: Suche {word!r} im Markt liefert {total} Treffer.")


def set_default_store(run: Run, send: Send, ask: Ask, base: str, namespace: str, store_code: str,
                      expected: Sequence[Mapping[str, Any]]) -> None:
    code, current = run(["kubectl", "-n", namespace, "get", DEPLOYMENT, "-o",
                         "jsonpath={.spec.template.spec.containers[0].env[?(@.name=='CATALOG_DEFAULT_STORE_CODE')].value}"])
    if code != 0:
        raise Abort(f"kubectl get fehlgeschlagen: {current}")
    print(f"CATALOG_DEFAULT_STORE_CODE derzeit: {current or '(nicht gesetzt)'}")
    confirm_code(ask, store_code, f"Default-Markt auf {store_code} setzen? Suchen ohne storeCode "
                                  "(alte App-Builds) zeigen dann nur diesen Markt.")

    def rollback(reason: str) -> None:
        print(f"FEHLER: {reason}. Nehme CATALOG_DEFAULT_STORE_CODE zurueck ...", file=sys.stderr)
        back = ["kubectl", "-n", namespace, "set", "env", DEPLOYMENT,
                f"CATALOG_DEFAULT_STORE_CODE={current}" if current else "CATALOG_DEFAULT_STORE_CODE-"]
        status, out = run(back)
        if status == 0:
            status, out = run(["kubectl", "-n", namespace, "rollout", "status", DEPLOYMENT, "--timeout=300s"])
        if status != 0:
            raise Abort(f"{reason}. ROLLBACK FEHLGESCHLAGEN, sofort von Hand: {' '.join(back)} ({out})")
        raise Abort(f"{reason}. Zurueckgenommen, Default wieder {current or '(nicht gesetzt)'}.")

    status, out = run(["kubectl", "-n", namespace, "set", "env", DEPLOYMENT,
                       f"CATALOG_DEFAULT_STORE_CODE={store_code}"])
    if status != 0:
        raise Abort(f"kubectl set env fehlgeschlagen, nichts geaendert: {out}")
    status, out = run(["kubectl", "-n", namespace, "rollout", "status", DEPLOYMENT, "--timeout=300s"])
    if status != 0:
        rollback(f"Rollout nicht fertig ({out})")
    word = search_word(expected)
    try:
        total, foreign = search_hits(parse_json(send(url(base, "/api/products/search", q=word)),
                                                "Suche ohne storeCode"), store_code)
    except Abort as exc:
        rollback(str(exc))
    if total == 0 or foreign:
        rollback(f"Suche {word!r} ohne storeCode: {total} Treffer, {foreign} nicht aus {store_code}")
    print(f"OK: Default-Markt {store_code} aktiv, Suche ohne storeCode liefert {total} Treffer.")
    print("WICHTIG: k8s/backend.yaml enthaelt CATALOG_DEFAULT_STORE_CODE nicht. Vor dem naechsten "
          "kubectl apply dort eintragen, sonst ist der Wert wieder weg.")


# ---------------------------------------------------------------------------
# Ablauf
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Alten Katalog sicher per Admin-CSV-Import in einen Markt laden.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help=f"Backend (Standard: {DEFAULT_BASE_URL})")
    parser.add_argument("--store-code", help="Ziel-Markt; ohne Angabe wird gefragt")
    parser.add_argument("--input", metavar="DATEI",
                        help="NDJSON-Export statt Live-Liste (z. B. backups/2026-10-18-products.ndjson)")
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR, help=f"Ziel fuer CSV (Standard: {DEFAULT_OUT_DIR})")
    parser.add_argument("--set-default", action="store_true",
                        help="danach CATALOG_DEFAULT_STORE_CODE per kubectl setzen (mit Pruefung und Rollback)")
    parser.add_argument("--namespace", default=DEFAULT_NAMESPACE, help=f"Kubernetes-Namespace (Standard: {DEFAULT_NAMESPACE})")
    return parser


def run(args: argparse.Namespace, send: Send, ask: Ask, run_cmd: Run, now: datetime) -> int:
    base = args.base_url.rstrip("/")
    parts = urllib.parse.urlsplit(base)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        raise Abort("--base-url braucht http:// oder https:// mit Host")

    print("== 1. Markt pruefen")
    stores = parse_json(send(url(base, "/api/mobile/stores")), "Marktliste")
    if not args.store_code:
        for item in stores if isinstance(stores, list) else []:
            if isinstance(item, dict):
                print(f"  {item.get('storeCode')}  ({item.get('name')})")
    store_code = (args.store_code or ask("Store-Code des Ziel-Markts: ")).strip()
    store = find_store(stores, store_code)
    shelves = shelf_codes(parse_json(
        send(url(base, f"/api/mobile/stores/{urllib.parse.quote(str(store['id']))}/layout/current")), "Layout"))
    print(f"Markt: {store_code} ({store.get('name')}), aktives Layout mit {len(shelves)} Regalen")

    print("== 2. Produkte ohne Markt lesen")
    source = load_input(args.input) if args.input else fetch_products(send, base)
    selection = select_products(source, shelves)
    if selection.problems:
        for line in selection.problems[:20]:
            print(f"FEHLER: {line}", file=sys.stderr)
        raise Abort("Quelle fehlerhaft, keine CSV geschrieben")
    if not selection.placeable:
        raise Abort("kein Produkt ohne Markt passt auf ein Regal dieses Markts")
    existing = fetch_products(send, base, storeCode=store_code)
    overlap = sorted({item["id"] for item in selection.placeable}
                     & {item.get("id") for item in existing if isinstance(item, dict)})
    print(f"Quelle: {args.input or base}, Produkte ohne Markt: {len(selection.placeable) + len(selection.no_shelf)}")
    print(f"Passend zu Regalen im Markt: {len(selection.placeable)}; schon im Markt: {len(existing)}; "
          f"davon wuerden ueberschrieben: {len(overlap)}")

    print("== 3. CSV schreiben")
    target = write_files(Path(args.out_dir), store_code, selection, now)
    print(f"CSV: {target} ({len(selection.placeable)} Produkte)")

    print("== 4. Import im Admin (du, im Browser)")
    print(f"  a) {base}/admin/next/ oeffnen und als Admin einloggen")
    print(f"  b) Produkte > Markt {store_code} waehlen > CSV-Import > Datei {target} waehlen")
    print(f"  c) Pruefung abwarten: {len(selection.placeable)} gueltig, 0 ungueltig; dann importieren")
    print("  d) warten, bis der Import 'fertig' meldet, ohne Fehler")
    answer = ask(f"Wenn der Import fertig ist, '{DONE_WORD}' eintippen (alles andere stoppt): ").strip()
    if answer != DONE_WORD:
        raise Abort("Gestoppt vor der Nachpruefung. Live nichts durch das Skript geaendert.")

    print("== 5. Nachpruefung live")
    verify_import(send, base, store_code, selection.placeable)

    if args.set_default:
        print("== 6. Default-Markt setzen")
        set_default_store(run_cmd, send, ask, base, args.namespace, store_code, selection.placeable)
    else:
        print("Default-Markt nicht geaendert (nur mit --set-default). Die iOS-App sendet storeCode selbst.")
    print("Fertig. Ergebnis bitte Claude zeigen, dann kommt es ins Release-Protokoll.")
    return 0


def main(argv: Optional[Sequence[str]] = None, send: Send = http_get, ask: Ask = input,
         run_cmd: Run = run_command, now: Optional[datetime] = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return run(args, send, ask, run_cmd, now or datetime.now(timezone.utc))
    except Abort as exc:
        print(f"ABBRUCH: {exc}", file=sys.stderr)
        return 1
    except (KeyboardInterrupt, EOFError):
        print("\nABBRUCH: abgebrochen.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
