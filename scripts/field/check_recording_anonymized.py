#!/usr/bin/env python3
"""Anonymisierungspruefung fuer Navigationsaufzeichnungen (JSON Lines).

Prueft jede Zeile gegen eine feste Whitelist aus Zeilentypen, Schluesseln und
Wertformen. Verboten sind Geraete-, Personen- und Netzkennungen sowie Freitext.
Freitext (layout.shopName, event.plan[].title) ist nur mit --allow-free-text
erlaubt; anonymize_recording.py entfernt bzw. ersetzt ihn vorher.

Task 4.5 (openspec/changes/establish-pilot-field-measurement).

Aufruf (Repo-Wurzel):
    python -I scripts/field/check_recording_anonymized.py [--allow-uuid UUID] [--allow-free-text] FILE...

Exit: 0 alles in Ordnung, 1 mindestens ein Verstoss, 2 Datei nicht lesbar.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import namedtuple
from pathlib import Path
from typing import Callable, Dict, FrozenSet, Iterable, List, Optional, Sequence, Set, Tuple

Violation = namedtuple("Violation", "line reason")

# Projekt-UUID aus BEACON_STANDARD.md (Abschnitt 1). Beacon-UUIDs sind keine Geraetekennung.
DEFAULT_ALLOWED_UUIDS: Tuple[str, ...] = ("B5CAA23B-BB89-4040-99D2-FCED3EA4A62B",)

IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9_.:\-]{1,64}$")
ANONYMIZED_TITLE_RE = re.compile(r"^stop-[A-Za-z0-9_.:\-]+$")
UUID_HYPHENATED_RE = re.compile(
    r"[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}"
)
UUID_BARE_RE = re.compile(r"^[0-9A-Fa-f]{32}$")

# Schluessel, die unabhaengig von der Whitelist eine eigene, klare Meldung bekommen.
DENIED_KEYS: FrozenSet[str] = frozenset({
    "devicename", "device", "name", "model", "identifierforvendor", "idfv", "udid",
    "ip", "host", "hostname", "user", "username", "email", "uuid", "machine",
})

LINE_TYPES: FrozenSet[str] = frozenset({"measurement", "layout", "event", "truth", "step", "heading", "scan"})
PROXIMITY_VALUES: FrozenSet[str] = frozenset({"immediate", "near", "far", "unknown"})
EVENT_KINDS: FrozenSet[str] = frozenset({
    "startTour", "stopDone", "stopSkipped", "listChanged", "replan", "routeModeToggled",
    "calibrate", "stopTour", "setTarget", "clearTarget",
})

Validator = Callable[[str, object, "Context"], List[str]]


class Context:
    """Pruefkontext je Datei: erlaubte UUIDs (normalisiert) und Freitext-Schalter."""

    def __init__(self, allowed_uuids: Iterable[str], allow_free_text: bool) -> None:
        self.allowed: FrozenSet[str] = frozenset(normalize_uuid(value) for value in allowed_uuids)
        self.allow_free_text = allow_free_text


def normalize_uuid(value: str) -> str:
    """UUID ohne Bindestriche, kleingeschrieben. Vergleichsform fuer die Allow-Liste."""
    return value.replace("-", "").lower()


def is_uuid_shaped(value: str) -> bool:
    return UUID_BARE_RE.match(value) is not None or UUID_HYPHENATED_RE.fullmatch(value) is not None


def _uuid_reasons(name: str, value: str, ctx: Context) -> List[str]:
    candidates = [match.group(0) for match in UUID_HYPHENATED_RE.finditer(value)]
    if UUID_BARE_RE.match(value):
        candidates.append(value)
    reasons = []
    for candidate in candidates:
        if normalize_uuid(candidate) not in ctx.allowed:
            reasons.append(
                f"UUID-aehnlicher Wert in '{name}' ist nicht erlaubt (Geraetekennung?); "
                "Beacon-UUIDs nur mit --allow-uuid"
            )
            break
    return reasons


def _v_number(name: str, value: object, ctx: Context) -> List[str]:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return [f"Feld '{name}' ist keine endliche Zahl"]
    return []


def _v_int(name: str, value: object, ctx: Context) -> List[str]:
    if isinstance(value, bool) or not isinstance(value, int):
        return [f"Feld '{name}' ist keine ganze Zahl"]
    return []


def _v_bool(name: str, value: object, ctx: Context) -> List[str]:
    if not isinstance(value, bool):
        return [f"Feld '{name}' ist kein Wahrheitswert"]
    return []


def _enum(values: FrozenSet[str]) -> Validator:
    def validate(name: str, value: object, ctx: Context) -> List[str]:
        if not isinstance(value, str) or value not in values:
            return [f"Feld '{name}' hat einen unzulaessigen Wert (erlaubt: {', '.join(sorted(values))})"]
        return []
    return validate


def _v_identifier(exempt_uuid: bool = False) -> Validator:
    def validate(name: str, value: object, ctx: Context) -> List[str]:
        if not isinstance(value, str):
            return [f"Feld '{name}' ist kein Text"]
        reasons = []
        if not IDENTIFIER_RE.match(value):
            reasons.append(f"Feld '{name}' ist kein Bezeichner (nur A-Z, a-z, 0-9, _ . : -, max. 64 Zeichen)")
        if not exempt_uuid:
            reasons.extend(_uuid_reasons(name, value, ctx))
        return reasons
    return validate


def _v_free_text(name: str, value: object, ctx: Context) -> List[str]:
    if not isinstance(value, str):
        return [f"Feld '{name}' ist kein Text"]
    reasons = []
    if not ctx.allow_free_text:
        reasons.append(f"Freitext in '{name}' (nur mit --allow-free-text erlaubt, anonymize_recording.py entfernt ihn)")
    reasons.extend(_uuid_reasons(name, value, ctx))
    return reasons


def _v_stop_title(name: str, value: object, ctx: Context) -> List[str]:
    if isinstance(value, str) and ANONYMIZED_TITLE_RE.match(value):
        return _uuid_reasons(name, value, ctx)
    return _v_free_text(name, value, ctx)


def _v_plan(name: str, value: object, ctx: Context) -> List[str]:
    if not isinstance(value, list):
        return [f"Feld '{name}' ist keine Liste"]
    reasons: List[str] = []
    for index, stop in enumerate(value, start=1):
        label = f"{name}[{index}]"
        if not isinstance(stop, dict):
            reasons.append(f"{label} ist kein Objekt")
            continue
        reasons.extend(check_record(stop, STOP_FIELDS, {"id", "title", "x", "y"}, label, ctx))
    return reasons


# Feld -> Pruefung. Jeder Zeilentyp hat genau diese Schluessel; alles andere ist ein Verstoss.
STOP_FIELDS: Dict[str, Validator] = {
    "id": _v_identifier(),
    "title": _v_stop_title,
    "x": _v_number,
    "y": _v_number,
}

LINE_SPECS: Dict[str, Tuple[Dict[str, Validator], Set[str]]] = {
    "measurement": (
        {
            "type": _enum(frozenset({"measurement"})),
            "t": _v_number,
            "source": _enum(frozenset({"rssi", "ranging"})),
            "beacon": _v_identifier(),
            "rssi": _v_int,
            "accuracy": _v_number,
            "proximity": _enum(PROXIMITY_VALUES),
            "txPower": _v_number,
        },
        {"t", "source", "beacon", "rssi"},
    ),
    "layout": (
        {
            "type": _enum(frozenset({"layout"})),
            "t": _v_number,
            # layoutId ist eine Layout-Kennung, keine Geraetekennung: UUIDs sind hier erlaubt.
            "layoutId": _v_identifier(exempt_uuid=True),
            "revision": _v_int,
            "shopName": _v_free_text,
        },
        {"t", "revision"},
    ),
    "event": (
        {
            "type": _enum(frozenset({"event"})),
            "t": _v_number,
            "kind": _enum(EVENT_KINDS),
            "plan": _v_plan,
            "x": _v_number,
            "y": _v_number,
            "optimize": _v_bool,
        },
        {"t", "kind"},
    ),
    "truth": (
        {
            "type": _enum(frozenset({"truth"})),
            "t": _v_number,
            "x": _v_number,
            "y": _v_number,
        },
        {"t", "x", "y"},
    ),
    "step": (
        {
            "type": _enum(frozenset({"step"})),
            "t": _v_number,
            "steps": _v_int,
            "distance": _v_number,
            "source": _enum(frozenset({"pedometer"})),
        },
        {"t", "steps", "source"},
    ),
    "heading": (
        {
            "type": _enum(frozenset({"heading"})),
            "t": _v_number,
            "degrees": _v_number,
            "accuracy": _v_number,
            "source": _enum(frozenset({"compass"})),
        },
        {"t", "degrees", "accuracy", "source"},
    ),
    # Layout-fremder iBeacon (nur Major, Minor, RSSI; bewusst ohne UUID).
    "scan": (
        {
            "type": _enum(frozenset({"scan"})),
            "t": _v_number,
            "major": _v_int,
            "minor": _v_int,
            "rssi": _v_int,
        },
        {"t", "major", "minor", "rssi"},
    ),
}


def _unknown_key_reason(key: str, label: str) -> str:
    if key.lower() in DENIED_KEYS:
        return f"verbotener Schluessel '{key}' in {label} (Geraete- oder Personenbezug)"
    return f"unbekannter Schluessel '{key}' in {label}"


def check_record(
    record: Dict[str, object],
    fields: Dict[str, Validator],
    required: Set[str],
    label: str,
    ctx: Context,
) -> List[str]:
    """Prueft ein JSON-Objekt gegen Feldliste und Pflichtschluessel."""
    reasons: List[str] = []
    for key in sorted(record):
        if key not in fields:
            reasons.append(_unknown_key_reason(key, label))
    for key in sorted(required):
        if key not in record:
            reasons.append(f"Schluessel '{key}' fehlt in {label}")
    for key in sorted(record):
        if key in fields:
            reasons.extend(fields[key](key, record[key], ctx))
    return reasons


def check_object(obj: object, ctx: Context) -> List[str]:
    """Pruefung einer dekodierten Zeile. Liefert die Verstoesse dieser Zeile."""
    if not isinstance(obj, dict):
        return ["Zeile ist kein JSON-Objekt"]
    if "type" not in obj:
        return ["Schluessel 'type' fehlt"]
    line_type = obj["type"]
    if not isinstance(line_type, str) or line_type not in LINE_TYPES:
        return [f"unbekannter Zeilentyp {line_type!r} (erlaubt: {', '.join(sorted(LINE_TYPES))})"]
    fields, required = LINE_SPECS[line_type]
    return check_record(obj, fields, required, f"Zeilentyp '{line_type}'", ctx)


def check_lines(
    lines: Sequence[str],
    allowed_uuids: Iterable[str] = DEFAULT_ALLOWED_UUIDS,
    allow_free_text: bool = False,
) -> List[Violation]:
    """Prueft Zeilen einer Aufzeichnung. Leere Zeilen werden ignoriert (wie in der App).

    Liefert je Verstoss ein Violation(line, reason) mit 1-basierter Zeilennummer.
    """
    ctx = Context(allowed_uuids, allow_free_text)
    violations: List[Violation] = []
    for number, raw in enumerate(lines, start=1):
        text = raw.rstrip("\r\n")
        if not text.strip():
            continue
        try:
            obj = json.loads(text)
        except ValueError as error:
            violations.append(Violation(number, f"kein gueltiges JSON ({error})"))
            continue
        for reason in check_object(obj, ctx):
            violations.append(Violation(number, reason))
    return violations


def split_lines(text: str) -> List[str]:
    """Zeilen eines Textes ohne abschliessendes Leerelement. Mittlere Leerzeilen bleiben erhalten."""
    lines = text.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    return lines


def _parse_allowed_uuid(value: str) -> str:
    if not is_uuid_shaped(value):
        raise argparse.ArgumentTypeError(f"'{value}' ist keine UUID")
    return value


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Prueft Navigationsaufzeichnungen (JSON Lines) auf Geraete-, Personen- und Freitext-Kennungen.",
    )
    parser.add_argument("files", nargs="+", metavar="FILE", help="Aufzeichnung(en) (.jsonl)")
    parser.add_argument(
        "--allow-uuid",
        action="append",
        default=[],
        type=_parse_allowed_uuid,
        metavar="UUID",
        help="zusaetzlich erlaubte UUID (nur Beacon-UUIDs; wiederholbar)",
    )
    parser.add_argument(
        "--allow-free-text",
        action="store_true",
        help="Freitext in layout.shopName und event.plan[].title zulassen",
    )
    args = parser.parse_args(argv)

    allowed = list(DEFAULT_ALLOWED_UUIDS) + list(args.allow_uuid)
    found_violation = False
    unreadable = False
    for name in args.files:
        try:
            text = Path(name).read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as error:
            print(f"Fehler: {name} ist nicht lesbar ({error})", file=sys.stderr)
            unreadable = True
            continue
        lines = split_lines(text)
        violations = check_lines(lines, allowed, args.allow_free_text)
        if violations:
            found_violation = True
            for violation in violations:
                print(f"{name}:{violation.line}: {violation.reason}")
        else:
            count = sum(1 for line in lines if line.strip())
            print(f"{name}: in Ordnung ({count} Zeilen geprueft)")

    if found_violation:
        return 1
    if unreadable:
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
