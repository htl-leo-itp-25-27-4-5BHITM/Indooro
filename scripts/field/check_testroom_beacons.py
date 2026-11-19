#!/usr/bin/env python3
"""Prueft, ob die Beacons des Testraums im Backend sauber eingetragen sind (nur lesend).

Das Skript schreibt nichts. Es macht nur GET-Aufrufe auf die oeffentlichen Endpunkte:
  GET {base}/api/mobile/stores/{storeId}/layout/current   (aktives Layout)
  GET {base}/api/mobile/stores/beacon-identities          (registrierte UUIDs)
Optional:
  --readiness-json DATEI   Antwort von /api/stores/{id}/readiness, im Browser gespeichert
  INDOORO_ADMIN_TOKEN      Admin-Token (nur Umgebungsvariable, nie als Argument), dann wird die
                           Bereitschaft selbst per GET abgefragt
  --values DATEI           TESTRAUM_BEACON_WERTE.md: vor Ort abgelesene Werte zum Vergleich

Aufruf:
  scripts/field/check_testroom_beacons.sh [--base-url URL] [--store ID] [--values DATEI]
                                          [--readiness-json DATEI] [--layout-json DATEI --identities-json DATEI]

Exit: 0 keine Blocker, 1 mindestens ein Blocker, 2 Aufruf- oder Netzfehler.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from typing import Callable, Dict, List, Optional, Sequence, Tuple

DEFAULT_BASE_URL = "https://it220209.cloud.htl-leonding.ac.at"
DEFAULT_STORE_ID = "b0308337-1d4b-4096-b022-200e6118e86c"
TIMEOUT_S = 20
MIN_BEACONS = 3  # Die App braucht mindestens drei Beacons fuer eine Position.
ZERO_UUID = "0" * 32
VALUES_BLOCK = re.compile(r"```beacon-werte[^\n]*\n(.*?)```", re.DOTALL)


class CheckError(Exception):
    """Aufruf-, Netz- oder Formatfehler (Exit 2)."""


Fetcher = Callable[[str, Dict[str, str]], bytes]


def http_get(url: str, headers: Dict[str, str]) -> bytes:
    request = urllib.request.Request(url, method="GET", headers={"Accept": "application/json", **headers})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        raise CheckError(f"{url}: Server antwortet mit HTTP {error.code}")
    except (urllib.error.URLError, OSError) as error:
        raise CheckError(f"{url}: {error}")


def parse_json(data: bytes, what: str) -> object:
    try:
        return json.loads(data)
    except ValueError as error:
        raise CheckError(f"{what}: keine gueltige JSON-Antwort ({error})")


def norm_uuid(value: object) -> str:
    """UUID ohne Bindestriche, kleingeschrieben. Leer bleibt leer."""
    return str(value or "").replace("-", "").strip().lower()


def short(uuid: str) -> str:
    return "..." + uuid[-4:] if len(uuid) >= 4 else (uuid or "(leer)")


def as_int(value: object) -> Optional[int]:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    text = str(value).strip()
    return int(text) if re.fullmatch(r"-?\d+", text) else None


class Report:
    def __init__(self) -> None:
        self.blockers: List[str] = []
        self.warnings: List[str] = []
        self.infos: List[str] = []

    def blocker(self, text: str) -> None:
        self.blockers.append(text)

    def warn(self, text: str) -> None:
        self.warnings.append(text)

    def info(self, text: str) -> None:
        self.infos.append(text)


def layout_elements(layout_response: object) -> Tuple[List[dict], Dict[str, object]]:
    if not isinstance(layout_response, dict):
        raise CheckError("Layout-Antwort hat ein unerwartetes Format")
    layout = layout_response.get("layout", layout_response)
    if not isinstance(layout, dict) or not isinstance(layout.get("elements"), list):
        raise CheckError("Layout-Antwort enthaelt keine Elementliste")
    return [e for e in layout["elements"] if isinstance(e, dict)], layout_response


def beacon_name(element: dict) -> str:
    return str(element.get("beaconId") or element.get("beaconCode") or f"Beacon-{element.get('id')}")


def check_layout_and_registry(report: Report, layout_response: object, identities: object) -> List[dict]:
    elements, meta = layout_elements(layout_response)
    if meta.get("fallback") is True or (meta.get("source") not in (None, "ACTIVE")):
        report.blocker(
            f"Das Layout ist kein aktives Filiallayout (Quelle: {meta.get('source')}, Ersatz-Layout: "
            f"{'ja' if meta.get('fallback') else 'nein'}). Zuerst ein Layout veroeffentlichen."
        )

    if not isinstance(identities, dict) or not isinstance(identities.get("uuids"), list):
        raise CheckError("beacon-identities hat ein unerwartetes Format (erwartet: {\"uuids\": [...]})")
    registered = [norm_uuid(u) for u in identities["uuids"]]
    registered_set = set(registered)

    beacons = [e for e in elements if e.get("type") == "beacon"]
    entrances = [e for e in elements if e.get("type") == "entrance"]
    report.info(f"Layout: {len(beacons)} Beacons, {len(entrances)} Eingang/Eingaenge, "
                f"{len(registered_set)} registrierte UUIDs.")

    if len(entrances) != 1:
        report.blocker(
            "Im Layout fehlt der Eingang." if not entrances
            else f"Im Layout gibt es {len(entrances)} Eingaenge, erlaubt ist genau einer."
        )
    if len(beacons) < MIN_BEACONS:
        report.blocker(f"Im Layout sind nur {len(beacons)} Beacons platziert; fuer eine Position braucht die App mindestens {MIN_BEACONS}.")

    if ZERO_UUID in registered_set:
        report.blocker("Registrierte Platzhalter-UUID aus lauter Nullen (00000000-0000-0000-0000-000000000000): "
                       "die App kann so ein Beacon nie erkennen. Im Admin unter Beacons durch die echte UUID ersetzen oder archivieren.")

    placed_uuids = set()
    identities_seen: Dict[Tuple[str, Optional[int], Optional[int]], List[str]] = {}
    mm_seen: Dict[Tuple[Optional[int], Optional[int]], List[dict]] = {}
    for beacon in beacons:
        name = beacon_name(beacon)
        pos = f"({beacon.get('x')},{beacon.get('y')})"
        uuid = norm_uuid(beacon.get("uuid"))
        major, minor = as_int(beacon.get("major")), as_int(beacon.get("minor"))
        placed_uuids.add(uuid)
        if not uuid:
            report.blocker(f"{name} {pos}: keine UUID eingetragen.")
        elif uuid == ZERO_UUID:
            report.blocker(f"{name} {pos}: UUID besteht nur aus Nullen.")
        elif uuid not in registered_set:
            report.blocker(f"{name} {pos}: UUID {short(uuid)} steht im Layout, ist aber nicht registriert "
                           "(fehlt in beacon-identities). Im Admin unter Beacons anlegen und dem Markt zuweisen.")
        if major is None or minor is None:
            fehlt = " und ".join(n for n, v in (("Major", major), ("Minor", minor)) if v is None)
            report.blocker(f"{name} {pos}: {fehlt} {'fehlen' if ' und ' in fehlt else 'fehlt'}. Ohne Major und Minor ordnet die App das Beacon nicht sicher zu.")
        else:
            identities_seen.setdefault((uuid, major, minor), []).append(name)
            mm_seen.setdefault((major, minor), []).append(beacon)

    for (uuid, major, minor), names in identities_seen.items():
        if len(names) > 1:
            report.blocker(f"Doppelte Identitaet: {', '.join(names)} haben dieselbe UUID {short(uuid)} mit Major {major} / Minor {minor}.")
    for (major, minor), group in mm_seen.items():
        distinct = {norm_uuid(b.get("uuid")) for b in group}
        if len(group) > 1 and len(distinct) > 1:
            names = ", ".join(beacon_name(b) for b in group)
            report.blocker(
                f"Mehrdeutig: {names} haben Major {major} / Minor {minor} (nur die UUID unterscheidet sie). "
                "Laut Beacon-Standard muss die Minor je Standort eindeutig sein."
            )

    for uuid in sorted(registered_set - placed_uuids - {ZERO_UUID}):
        report.warn(f"UUID {short(uuid)} ist registriert, aber im Layout nicht platziert. "
                    "Entweder im Layout-Editor platzieren oder im Admin freigeben.")
    return beacons


def check_readiness(report: Report, readiness: object) -> None:
    if not isinstance(readiness, dict) or "findings" not in readiness:
        raise CheckError("Bereitschafts-Datei hat ein unerwartetes Format (erwartet: Antwort von /api/stores/{id}/readiness)")
    findings = [f for f in readiness.get("findings") or [] if isinstance(f, dict)]
    blocking = [f for f in findings if f.get("severity") == "BLOCKING"]
    count = readiness.get("blockingCount")
    count = count if isinstance(count, int) else len(blocking)
    report.info(f"Bereitschaft (Admin): Status {readiness.get('status')}, {count} Blocker, "
                f"{readiness.get('warningCount', len(findings) - len(blocking))} Hinweise.")
    for finding in blocking:
        report.blocker(f"Bereitschaft [{finding.get('code')}]: {finding.get('message')}")
    if count > len(blocking):
        report.blocker(f"Bereitschaft meldet {count} Blocker, die Datei listet nur {len(blocking)}.")


def parse_values(text: str) -> List[Dict[str, str]]:
    match = VALUES_BLOCK.search(text)
    if not match:
        raise CheckError("In der Werte-Datei fehlt der Block ```beacon-werte ... ```")
    rows: List[Dict[str, str]] = []
    for raw in match.group(1).splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split(";")]
        if len(parts) < 8:
            raise CheckError(f"Werte-Zeile hat zu wenige Felder (erwartet 8, gefunden {len(parts)}): {line}")
        keys = ["etikett", "zelle", "uuid", "major", "minor", "admin_name", "tx_power", "gelesen"]
        rows.append(dict(zip(keys, parts[:8])))
    return rows


def parse_cell(text: str) -> Optional[Tuple[int, int]]:
    match = re.fullmatch(r"\(?\s*(-?\d+)\s*[,/ ]\s*(-?\d+)\s*\)?", text or "")
    return (int(match.group(1)), int(match.group(2))) if match else None


def check_values(report: Report, rows: List[Dict[str, str]], beacons: List[dict]) -> None:
    filled = [r for r in rows if r["uuid"] or r["major"] or r["minor"]]
    if not filled:
        report.blocker("Die Werte-Datei ist noch leer: Es wurden keine echten Beacon-Werte abgelesen. "
                       "Zuerst die Werte am Geraet ablesen und eintragen (TESTRAUM_BEACON_WERTE.md).")
        return
    report.info(f"Werte-Datei: {len(filled)} von {len(rows)} Zeilen ausgefuellt.")
    used: set = set()
    for row in rows:
        label = row["etikett"] or row["admin_name"] or "(ohne Etikett)"
        if row not in filled:
            report.blocker(f"{label}: Werte noch nicht abgelesen (UUID, Major und Minor leer).")
            continue
        uuid, major, minor = norm_uuid(row["uuid"]), as_int(row["major"]), as_int(row["minor"])
        cell = parse_cell(row["zelle"])
        if not re.fullmatch(r"[0-9a-f]{32}", uuid):
            report.blocker(f"{label}: Die UUID in der Werte-Datei ist keine gueltige UUID (32 Hex-Zeichen erwartet).")
            continue
        if major is None or minor is None:
            report.blocker(f"{label}: Major oder Minor in der Werte-Datei fehlt oder ist keine Zahl.")
            continue
        candidates = [b for b in beacons if id(b) not in used and (
            (row["admin_name"] and beacon_name(b) == row["admin_name"])
            or (norm_uuid(b.get("uuid")) == uuid and as_int(b.get("major")) == major and as_int(b.get("minor")) == minor))]
        if not candidates and cell is not None:
            candidates = [b for b in beacons if id(b) not in used and (as_int(b.get("x")), as_int(b.get("y"))) == cell]
        if not candidates:
            report.blocker(f"{label} (UUID {short(uuid)}, Major {major}, Minor {minor}): Im Layout ist kein passendes Beacon platziert.")
            continue
        beacon = candidates[0]
        used.add(id(beacon))
        problems = []
        if norm_uuid(beacon.get("uuid")) != uuid:
            problems.append(f"UUID im Layout {short(norm_uuid(beacon.get('uuid')))} statt {short(uuid)}")
        if as_int(beacon.get("major")) != major:
            problems.append(f"Major im Layout {beacon.get('major')} statt {major}")
        if as_int(beacon.get("minor")) != minor:
            problems.append(f"Minor im Layout {beacon.get('minor')} statt {minor}")
        if cell is not None and (as_int(beacon.get("x")), as_int(beacon.get("y"))) != cell:
            problems.append(f"Position im Layout ({beacon.get('x')},{beacon.get('y')}) statt {cell}")
        if problems:
            report.blocker(f"{label} passt nicht zu {beacon_name(beacon)}: " + "; ".join(problems) + ".")
    for beacon in beacons:
        if id(beacon) not in used:
            report.blocker(f"{beacon_name(beacon)} ({beacon.get('x')},{beacon.get('y')}) ist im Layout, aber in der Werte-Datei nicht abgelesen.")


def render(report: Report) -> str:
    lines = ["Pruefung Testraum-Beacons (nur lesend)", ""]
    lines += [f"  {i}" for i in report.infos]
    lines.append("")
    if report.blockers:
        lines.append(f"BLOCKER ({len(report.blockers)}), so nicht messbar:")
        lines += [f"  - {b}" for b in report.blockers]
        lines.append("")
    if report.warnings:
        lines.append(f"Hinweise ({len(report.warnings)}):")
        lines += [f"  - {w}" for w in report.warnings]
        lines.append("")
    if report.blockers:
        lines.append(f"Ergebnis: NICHT BEREIT. {len(report.blockers)} Blocker. Exit 1.")
    else:
        lines.append("Ergebnis: BEREIT. Keine Blocker." + (" Hinweise beachten." if report.warnings else ""))
    return "\n".join(lines)


def load_file(path: str, what: str) -> bytes:
    try:
        with open(path, "rb") as handle:
            return handle.read()
    except OSError as error:
        raise CheckError(f"{what}: {error}")


def run(args: argparse.Namespace, fetch: Fetcher, env: Dict[str, str]) -> Report:
    base = args.base_url.rstrip("/")
    if args.layout_json:
        layout = parse_json(load_file(args.layout_json, "Layout-Datei"), args.layout_json)
    else:
        url = f"{base}/api/mobile/stores/{args.store}/layout/current"
        layout = parse_json(fetch(url, {}), url)
    if args.identities_json:
        identities = parse_json(load_file(args.identities_json, "Identitaeten-Datei"), args.identities_json)
    else:
        url = f"{base}/api/mobile/stores/beacon-identities"
        identities = parse_json(fetch(url, {}), url)

    report = Report()
    beacons = check_layout_and_registry(report, layout, identities)

    readiness = None
    if args.readiness_json:
        readiness = parse_json(load_file(args.readiness_json, "Bereitschafts-Datei"), args.readiness_json)
    elif env.get("INDOORO_ADMIN_TOKEN"):
        url = f"{base}/api/stores/{args.store}/readiness"
        readiness = parse_json(fetch(url, {"Authorization": "Bearer " + env["INDOORO_ADMIN_TOKEN"]}), "Bereitschaft")
    if readiness is not None:
        check_readiness(report, readiness)
    else:
        report.warn("Bereitschaft nicht geprueft (weder INDOORO_ADMIN_TOKEN noch --readiness-json angegeben).")

    if args.values:
        text = load_file(args.values, "Werte-Datei").decode("utf-8", errors="replace")
        check_values(report, parse_values(text), beacons)
    return report


def main(argv: Optional[Sequence[str]] = None, fetch: Fetcher = http_get, env: Optional[Dict[str, str]] = None,
         out=None) -> int:
    out = out or sys.stdout
    parser = argparse.ArgumentParser(description="Prueft die Beacon-Eintraege des Testraums (nur lesend).")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--store", default=DEFAULT_STORE_ID, help="Store-ID (UUID)")
    parser.add_argument("--values", help="TESTRAUM_BEACON_WERTE.md mit den abgelesenen Werten")
    parser.add_argument("--readiness-json", help="im Browser gespeicherte Antwort von /api/stores/{id}/readiness")
    parser.add_argument("--layout-json", help="Layout-Antwort aus Datei statt aus dem Netz (Offline-Test)")
    parser.add_argument("--identities-json", help="beacon-identities aus Datei statt aus dem Netz (Offline-Test)")
    try:
        args = parser.parse_args(argv)
    except SystemExit as exit_:
        return 2 if exit_.code not in (0, None) else 0
    try:
        report = run(args, fetch, dict(os.environ) if env is None else env)
    except CheckError as error:
        print(f"Fehler: {error}", file=sys.stderr)
        return 2
    print(render(report), file=out)
    return 1 if report.blockers else 0


if __name__ == "__main__":
    sys.exit(main())
