#!/usr/bin/env python3
"""Convert a pilot product spreadsheet (CSV) into bulk import data.

The script validates every row against a store layout JSON and writes either
OpenSearch-style bulk NDJSON (index action + document pairs, as in
backend/indooro_server/demoproducts.ndjson) or a JSON array for
POST /api/products/bulk and the admin catalog import.

Standard library only (Python 3.10+). Run with `python -I`.

Exit codes:
  0  conversion succeeded, output file written
  1  validation errors in the spreadsheet, no output file written
  2  input or layout unreadable / structurally invalid, or output not writable
"""

import argparse
import csv
import io
import json
import os
import re
import sys
import tempfile
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

HEADER = ["id", "name", "marke", "menge", "regal_label", "kategorie", "meter", "fach", "reihe", "preis"]
UTF8_BOM = b"\xef\xbb\xbf"

EXIT_OK = 0
EXIT_VALIDATION = 1
EXIT_INPUT = 2


class InputProblem(Exception):
    """A file cannot be read or has an invalid structure (exit code 2)."""


@dataclass(frozen=True)
class Shelf:
    """A shelf element of the layout, reduced to the fields used for matching."""

    position: int
    base: str
    meter: int | None
    label: str


@dataclass
class ConversionResult:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    products: list[dict] = field(default_factory=list)
    delimiter: str = ""
    encoding: str = ""
    shelves_total: int = 0
    shelves_used: int = 0
    shelves_without_products: list[Shelf] = field(default_factory=list)
    auto_ids: int = 0


# ---------------------------------------------------------------------------
# Small parsing helpers
# ---------------------------------------------------------------------------

def normalize_text(value) -> str:
    """Collapse runs of whitespace and trim."""
    return " ".join(str(value).split())


def parse_positive_int(value: str) -> int | None:
    text = value.strip()
    if not re.fullmatch(r"[0-9]+", text):
        return None
    number = int(text)
    return number if number > 0 else None


def parse_price(value: str) -> float | None:
    """Accept '2,99' and '2.99'. Rejects thousands separators and >2 decimals."""
    text = value.strip()
    if not text or ("," in text and "." in text):
        return None
    text = text.replace(",", ".")
    if not re.fullmatch(r"[0-9]+(\.[0-9]{1,2})?", text):
        return None
    amount = Decimal(text)
    if amount <= 0:
        return None
    return float(amount)


def _shelf_meter(element: dict) -> int | None:
    """Meter of a shelf: explicit `meter` field, else the suffix of `category` ('base/meter')."""
    raw = element.get("meter")
    if raw is None:
        category = element.get("category")
        if isinstance(category, str) and "/" in category:
            raw = category.split("/", 1)[1]
    if raw is None:
        return None
    return parse_positive_int(str(raw))


def _shelf_base(element: dict) -> str:
    """Category base of a shelf: the part of `category` before the first slash."""
    category = element.get("category")
    if not isinstance(category, str):
        return ""
    return category.split("/", 1)[0].strip()


# ---------------------------------------------------------------------------
# Layout
# ---------------------------------------------------------------------------

def load_layout(path: str) -> dict:
    """Read and minimally validate a layout JSON file. Raises InputProblem."""
    try:
        with open(path, "rb") as handle:
            raw = handle.read()
    except OSError as exc:
        raise InputProblem(f"Layout nicht lesbar: {path} ({exc.strerror or exc})") from exc
    try:
        layout = json.loads(raw.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise InputProblem(f"Layout ist kein gueltiges JSON: {exc}") from exc
    if not isinstance(layout, dict) or not isinstance(layout.get("elements"), list):
        raise InputProblem("Layout-JSON enthaelt keine Liste 'elements'.")
    if not all(isinstance(element, dict) for element in layout["elements"]):
        raise InputProblem("Layout-JSON: 'elements' enthaelt Eintraege, die keine Objekte sind.")
    return layout


def layout_shelves(layout: dict) -> list[Shelf]:
    shelves = []
    for position, element in enumerate(layout["elements"]):
        if element.get("type") != "shelf":
            continue
        shelves.append(
            Shelf(
                position=position,
                base=_shelf_base(element),
                meter=_shelf_meter(element),
                label=normalize_text(element.get("label") or ""),
            )
        )
    return shelves


def layout_warnings(layout: dict) -> list[str]:
    entrances = sum(1 for element in layout["elements"] if element.get("type") == "entrance")
    if entrances == 0:
        return ["Warnung: Layout enthaelt keinen Eingang (type 'entrance'), erwartet genau einen."]
    if entrances > 1:
        return [f"Warnung: Layout enthaelt {entrances} Eingaenge (type 'entrance'), erwartet genau einen."]
    return []


def find_matching_shelves(shelves: list[Shelf], kategorie: str, meter: int, regal_label: str) -> list[Shelf]:
    return [
        shelf
        for shelf in shelves
        if shelf.base == kategorie
        and shelf.meter == meter
        and (not regal_label or shelf.label == regal_label)
    ]


# ---------------------------------------------------------------------------
# Spreadsheet
# ---------------------------------------------------------------------------

def decode_spreadsheet(raw: bytes) -> tuple[str | None, str]:
    """Return (text, encoding label). Text is None when the bytes are not valid UTF-8."""
    if raw.startswith(UTF8_BOM):
        encoding, payload = "UTF-8 mit BOM", raw[len(UTF8_BOM):]
    else:
        encoding, payload = "UTF-8 ohne BOM", raw
    try:
        return payload.decode("utf-8"), encoding
    except UnicodeDecodeError:
        return None, encoding


def detect_delimiter(text: str) -> str:
    """Pick ';' or ',' by counting them in the first line (the header)."""
    first_line = text.splitlines()[0] if text else ""
    semicolons = first_line.count(";")
    commas = first_line.count(",")
    return ";" if semicolons >= commas else ","


def read_records(text: str, delimiter: str, result: ConversionResult):
    """Return (header cells, [(line number, cells)]). Blank lines are skipped."""
    reader = csv.reader(io.StringIO(text, newline=""), delimiter=delimiter)
    header = None
    records = []
    try:
        for cells in reader:
            line_no = reader.line_num
            if not any(cell.strip() for cell in cells):
                continue
            if header is None:
                header = cells
            else:
                records.append((line_no, cells))
    except csv.Error as exc:
        result.errors.append(f"Zeile {reader.line_num}: CSV-Syntaxfehler ({exc})")
    return header, records


def check_header(header: list[str], result: ConversionResult) -> dict[str, int] | None:
    """Validate the header once. Returns column index by name, or None if unusable."""
    names = [cell.strip().lower() for cell in header]
    columns: dict[str, int] = {}
    for index, name in enumerate(names):
        if name and name not in columns:
            columns[name] = index

    missing = [name for name in HEADER if name not in columns]
    unknown = sorted({name for name in names if name and name not in HEADER})
    duplicated = sorted({name for name in names if name and names.count(name) > 1})

    if missing:
        result.errors.append("Kopfzeile: Pflichtspalte(n) fehlen: " + ", ".join(missing))
    if unknown:
        result.errors.append("Kopfzeile: unbekannte Spalte(n): " + ", ".join(unknown))
    if duplicated:
        result.errors.append("Kopfzeile: Spalte(n) doppelt: " + ", ".join(duplicated))
    if missing:
        return None
    return columns


# ---------------------------------------------------------------------------
# Conversion
# ---------------------------------------------------------------------------

def convert(
    raw: bytes,
    layout: dict,
    store_id: str,
    store_code: str,
    id_start: int = 1,
) -> ConversionResult:
    """Validate the spreadsheet bytes against the layout and build product documents.

    Never writes files. When `result.errors` is not empty, `result.products` is empty.
    """
    result = ConversionResult()
    result.warnings.extend(layout_warnings(layout))
    shelves = layout_shelves(layout)
    result.shelves_total = len(shelves)

    text, result.encoding = decode_spreadsheet(raw)
    if text is None:
        result.errors.append(
            "Datei: nicht UTF-8-kodiert. In Excel als 'CSV UTF-8 (Trennzeichen-getrennt)' speichern."
        )
        return result
    if not text.strip():
        result.errors.append("Datei: leer, keine Kopfzeile gefunden.")
        return result

    result.delimiter = detect_delimiter(text)
    header, records = read_records(text, result.delimiter, result)
    if header is None:
        result.errors.append("Datei: keine Kopfzeile gefunden.")
        return result
    columns = check_header(header, result)
    if columns is None:
        return result
    if not records:
        result.errors.append("Datei: keine Produktzeilen gefunden.")
        return result

    accepted = []  # (line_no, explicit id or None, fields, shelf)
    seen_ids: dict[int, int] = {}

    for line_no, cells in records:
        row_errors: list[str] = []

        def cell(name: str) -> str:
            index = columns[name]
            return cells[index] if index < len(cells) else ""

        if len(cells) > len(header):
            row_errors.append(f"mehr Spalten als Kopfzeile ({len(cells)} statt {len(header)})")

        explicit_id = None
        id_raw = cell("id").strip()
        if id_raw:
            explicit_id = parse_positive_int(id_raw)
            if explicit_id is None:
                row_errors.append(f"id '{id_raw}' ist keine positive ganze Zahl")
            elif explicit_id in seen_ids:
                row_errors.append(f"id {explicit_id} ist doppelt (auch in Zeile {seen_ids[explicit_id]})")
            else:
                seen_ids[explicit_id] = line_no

        name_raw = cell("name").strip()
        if not name_raw:
            row_errors.append("name ist leer")

        kategorie = cell("kategorie").strip()
        if not kategorie:
            row_errors.append("kategorie fehlt")

        meter_raw = cell("meter").strip()
        meter = parse_positive_int(meter_raw)
        if meter is None:
            row_errors.append(f"meter '{meter_raw}' ist keine positive ganze Zahl")

        fach_raw = cell("fach").strip()
        fach = parse_positive_int(fach_raw)
        if fach is None:
            row_errors.append(f"fach '{fach_raw}' ist keine positive ganze Zahl")

        reihe_raw = cell("reihe").strip()
        reihe = parse_positive_int(reihe_raw)
        if reihe is None:
            row_errors.append(f"reihe '{reihe_raw}' ist keine positive ganze Zahl")

        price = parse_price(cell("preis"))
        if price is None:
            row_errors.append(f"preis '{cell('preis').strip()}' ist ungueltig (z. B. 2,99 oder 2.99)")

        regal_label = normalize_text(cell("regal_label"))
        shelf = None
        if kategorie and meter is not None:
            matches = find_matching_shelves(shelves, kategorie, meter, regal_label)
            if not matches:
                label_part = f" und Bezeichnung '{regal_label}'" if regal_label else ""
                row_errors.append(
                    f"kein Regal im Layout mit kategorie {kategorie}, meter {meter}{label_part}"
                )
            elif len(matches) > 1:
                row_errors.append(
                    f"mehrdeutig: {len(matches)} Regale mit kategorie {kategorie}, meter {meter} "
                    "passen; regal_label angeben"
                )
            else:
                shelf = matches[0]

        for reason in row_errors:
            result.errors.append(f"Zeile {line_no}: {reason}")

        if not row_errors:
            fields = {
                "name": normalize_text(f"{cell('marke')} {name_raw} {cell('menge')}"),
                "price": price,
                "layoutCode": f"{kategorie}/{meter}/{fach}/{reihe}",
            }
            accepted.append((line_no, explicit_id, fields, shelf))

    if result.errors:
        return result

    # Assign ids: explicit ids are kept, empty ones count up from id_start and skip explicit ids.
    taken = set(seen_ids)
    next_id = id_start
    used_positions: set[int] = set()
    for _line_no, explicit_id, fields, shelf in accepted:
        if explicit_id is not None:
            product_id = explicit_id
        else:
            while next_id in taken:
                next_id += 1
            product_id = next_id
            taken.add(product_id)
            next_id += 1
            result.auto_ids += 1
        document = {"id": product_id, **fields, "storeId": store_id, "storeCode": store_code}
        result.products.append(document)
        used_positions.add(shelf.position)

    result.shelves_used = len(used_positions)
    result.shelves_without_products = [shelf for shelf in shelves if shelf.position not in used_positions]
    return result


def render_output(products: list[dict], output_format: str) -> str:
    """Render products as 'ndjson' (one object per line), 'array' (JSON array) or 'bulk-pairs' (ES action + doc)."""
    if output_format == "array":
        return json.dumps(products, ensure_ascii=False, indent=2) + "\n"
    if output_format == "bulk-pairs":
        lines = []
        for product in products:
            lines.append(json.dumps({"index": {"_index": "products"}}, ensure_ascii=False))
            lines.append(json.dumps(product, ensure_ascii=False))
        return "\n".join(lines) + "\n"
    return "\n".join(json.dumps(product, ensure_ascii=False) for product in products) + "\n"


def write_output_atomically(out_path: str, content: str) -> None:
    """Write to a temp file in the target directory, then rename. Existing files stay untouched on failure."""
    out_dir = os.path.dirname(os.path.abspath(out_path))
    descriptor, temp_path = tempfile.mkstemp(dir=out_dir, prefix=".csv_to_ndjson-", suffix=".tmp")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
        os.replace(temp_path, out_path)
    except BaseException:
        try:
            os.unlink(temp_path)
        except OSError:
            pass
        raise


def shelf_label_text(shelf: Shelf) -> str:
    label = shelf.label or "(ohne Bezeichnung)"
    meter = "?" if shelf.meter is None else str(shelf.meter)
    return f"{label} (kategorie {shelf.base or '?'}, meter {meter})"


def format_summary(result: ConversionResult, row_count: int, out_path: str, output_format: str) -> str:
    lines = [
        "Konvertierung abgeschlossen.",
        f"Produkte (Zeilen): {row_count}",
        f"Regale verwendet: {result.shelves_used} von {result.shelves_total}",
        f"Regale ohne Produkte: {len(result.shelves_without_products)}",
    ]
    for shelf in result.shelves_without_products:
        lines.append(f"  - {shelf_label_text(shelf)}")
    lines.append(f"Automatisch vergebene IDs: {result.auto_ids}")
    lines.append(f"Geschrieben: {out_path} ({row_count} Produkte, Format: {output_format})")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Command line
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Produkt-CSV in Bulk-Importdaten fuer Indooro umwandeln und gegen das Layout pruefen.",
    )
    parser.add_argument("csv", help="CSV-Datei nach docs/pilot-readiness/kit/produkte-vorlage.csv")
    parser.add_argument("layout", help="Layout-JSON des Marktes")
    parser.add_argument("--store-id", required=True, help="storeId, der in jedes Produkt geschrieben wird")
    parser.add_argument("--store-code", required=True, help="storeCode, der in jedes Produkt geschrieben wird")
    parser.add_argument("--out", required=True, help="Ausgabedatei (wird nur bei Erfolg geschrieben)")
    parser.add_argument("--id-start", type=int, default=1, help="Start fuer automatisch vergebene IDs (Standard: 1)")
    parser.add_argument(
        "--format",
        choices=["ndjson", "array", "bulk-pairs"],
        default="ndjson",
        help=(
            "ndjson = ein Produktobjekt pro Zeile (Standard, Admin-Katalogimport); "
            "array = JSON-Array (POST /api/products/bulk); "
            "bulk-pairs = Aktion+Dokument-Paare wie demoproducts.ndjson (veraltet)"
        ),
    )
    return parser


def _configure_streams() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="backslashreplace")
        except (AttributeError, ValueError):
            pass


def main(argv: list[str] | None = None) -> int:
    _configure_streams()
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.id_start < 1:
        parser.error("--id-start muss mindestens 1 sein")
    if not args.store_id.strip() or not args.store_code.strip():
        parser.error("--store-id und --store-code duerfen nicht leer sein")

    try:
        layout = load_layout(args.layout)
    except InputProblem as exc:
        print(f"Fehler: {exc}", file=sys.stderr)
        return EXIT_INPUT

    try:
        with open(args.csv, "rb") as handle:
            raw = handle.read()
    except OSError as exc:
        print(f"Fehler: CSV nicht lesbar: {args.csv} ({exc.strerror or exc})", file=sys.stderr)
        return EXIT_INPUT

    result = convert(raw, layout, args.store_id.strip(), args.store_code.strip(), args.id_start)

    for warning in result.warnings:
        print(warning, file=sys.stderr)
    if result.encoding:
        print(f"Erkannt: Trennzeichen '{result.delimiter}', Kodierung {result.encoding}", file=sys.stderr)

    if result.errors:
        print(f"{len(result.errors)} Fehler gefunden. Es wurde keine Datei geschrieben.", file=sys.stderr)
        for error in result.errors:
            print(error, file=sys.stderr)
        return EXIT_VALIDATION

    try:
        write_output_atomically(args.out, render_output(result.products, args.format))
    except OSError as exc:
        print(f"Fehler: Ausgabedatei nicht schreibbar: {args.out} ({exc.strerror or exc})", file=sys.stderr)
        return EXIT_INPUT

    print(format_summary(result, len(result.products), args.out, args.format))
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
