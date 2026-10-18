#!/usr/bin/env python3
"""Uebernimmt Navigationsaufzeichnungen aus dem Eingangsordner in den Aufnahme-Ordner.

Je *.jsonl im Eingangsordner (sortiert): anonymisieren, pruefen, bei Erfolg als
`<site>-<date>-<n>.jsonl` schreiben (n fortlaufend ab der hoechsten vorhandenen Nummer).
Abgelehnte Dateien werden gemeldet und nie geschrieben. Bestehende Dateien werden
nie ueberschrieben.

Task 4.5 / 5.2 (openspec/changes/establish-pilot-field-measurement).

Aufruf (Repo-Wurzel):
    python -I scripts/field/import_recordings.py --site testraum --date 2026-10-20 [--incoming DIR]
        [--recordings DIR] [--move] [--dry-run]

Exit: 0 alles uebernommen, 1 mindestens eine Datei abgelehnt (oder Original nicht entfernbar), 2 Aufrufsfehler.
"""

from __future__ import annotations

import argparse
import datetime
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Sequence, Set

sys.path.insert(0, str(Path(__file__).resolve().parent))

from anonymize_recording import anonymize_lines  # noqa: E402
from check_recording_anonymized import check_lines, split_lines  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INCOMING = REPO_ROOT / "swift" / "indooro-EinkaeuferFinal" / "NavigationFixtures" / "incoming"
DEFAULT_RECORDINGS = REPO_ROOT / "swift" / "indooro-EinkaeuferFinal" / "NavigationFixtures" / "recordings"

SITE_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@dataclass
class FileResult:
    source: Path
    target: Optional[str] = None
    accepted: bool = False
    moved: bool = False
    warnings: List[str] = field(default_factory=list)
    reasons: List[str] = field(default_factory=list)


def validate_site(value: str) -> str:
    if not SITE_RE.fullmatch(value):
        raise argparse.ArgumentTypeError("Standortkennung: nur a-z, 0-9 und Bindestrich, z. B. testraum")
    return value


def validate_date(value: str) -> str:
    if not DATE_RE.fullmatch(value):
        raise argparse.ArgumentTypeError("Datum im Format JJJJ-MM-TT erwartet")
    try:
        datetime.datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        raise argparse.ArgumentTypeError(f"'{value}' ist kein gueltiges Datum")
    return value


def target_name(site: str, date: str, number: int) -> str:
    return f"{site}-{date}-{number}.jsonl"


def next_free_name(site: str, date: str, taken: Set[str]) -> str:
    """Naechster Name `<site>-<date>-<n>.jsonl` hinter der hoechsten belegten Nummer."""
    pattern = re.compile(rf"^{re.escape(site)}-{re.escape(date)}-(\d+)\.jsonl$")
    numbers = [int(match.group(1)) for name in taken if (match := pattern.match(name))]
    number = max(numbers, default=0) + 1
    while target_name(site, date, number) in taken:
        number += 1
    return target_name(site, date, number)


def _read_text(path: Path) -> str:
    return path.read_bytes().decode("utf-8")


def process_file(
    source: Path,
    site: str,
    date: str,
    recordings: Path,
    taken: Set[str],
    move: bool,
    dry_run: bool,
) -> FileResult:
    """Eine Datei verarbeiten. `taken` enthaelt alle belegten und reservierten Namen und wird ergaenzt."""
    result = FileResult(source=source)
    try:
        text = _read_text(source)
    except UnicodeDecodeError:
        result.reasons.append("keine UTF-8-Datei")
        return result
    except OSError as error:
        result.reasons.append(f"nicht lesbar ({error.strerror or error})")
        return result

    lines = split_lines(text)
    if not any(line.strip() for line in lines):
        result.reasons.append("Datei ist leer")
        return result

    anonymized = anonymize_lines(lines)
    violations = check_lines(anonymized)
    if violations:
        result.reasons.extend(f"Zeile {violation.line}: {violation.reason}" for violation in violations)
        return result

    content = "\n".join(anonymized) + "\n"
    name = next_free_name(site, date, taken)
    if dry_run:
        taken.add(name)
        result.accepted = True
        result.target = name
        return result

    recordings.mkdir(parents=True, exist_ok=True)
    while True:
        try:
            with open(recordings / name, "x", encoding="utf-8", newline="\n") as handle:
                handle.write(content)
            break
        except FileExistsError:
            taken.add(name)
            name = next_free_name(site, date, taken)
    taken.add(name)
    result.accepted = True
    result.target = name

    if move:
        try:
            os.remove(source)
            result.moved = True
        except OSError as error:
            result.warnings.append(f"Original konnte nicht entfernt werden ({error.strerror or error})")
    return result


def run(
    incoming: Path,
    recordings: Path,
    site: str,
    date: str,
    move: bool,
    dry_run: bool,
) -> List[FileResult]:
    sources = sorted(
        (path for path in incoming.iterdir() if path.is_file() and path.suffix == ".jsonl"),
        key=lambda path: path.name,
    )
    taken: Set[str] = set()
    if recordings.is_dir():
        taken.update(entry.name for entry in recordings.iterdir())
    return [
        process_file(source, site, date, recordings, taken, move, dry_run)
        for source in sources
    ]


def print_summary(results: List[FileResult], site: str, date: str, move: bool, dry_run: bool) -> None:
    accepted = [result for result in results if result.accepted]
    rejected = [result for result in results if not result.accepted]
    print(
        f"Import Standort '{site}', Datum {date}: {len(results)} Datei(en) geprueft, "
        f"{len(accepted)} uebernommen, {len(rejected)} abgelehnt."
    )
    if dry_run:
        print("Probelauf: nichts geschrieben, nichts verschoben.")
    for result in accepted:
        if dry_run:
            disposition = "wuerde uebernommen"
        elif move and result.moved:
            disposition = "uebernommen, Original verschoben"
        else:
            disposition = "uebernommen, Original behalten"
        print(f"  {disposition}: {result.source.name} -> {result.target}")
        for warning in result.warnings:
            print(f"    Warnung: {warning}")
    for result in rejected:
        print(f"  abgelehnt: {result.source.name} (nicht geschrieben)")
        for reason in result.reasons:
            print(f"    {reason}")


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Aufnahmen anonymisieren, pruefen und als <site>-<date>-<n>.jsonl uebernehmen.",
    )
    parser.add_argument("--site", required=True, type=validate_site, help="Standortkennung, z. B. testraum")
    parser.add_argument("--date", required=True, type=validate_date, help="Messdatum JJJJ-MM-TT")
    parser.add_argument("--incoming", type=Path, default=DEFAULT_INCOMING, help="Eingangsordner")
    parser.add_argument("--recordings", type=Path, default=DEFAULT_RECORDINGS, help="Zielordner")
    parser.add_argument("--move", action="store_true", help="Original nach erfolgreichem Schreiben entfernen")
    parser.add_argument("--dry-run", action="store_true", help="nur zeigen, was passieren wuerde")
    args = parser.parse_args(argv)

    if not args.incoming.is_dir():
        print(f"Fehler: Eingangsordner nicht gefunden: {args.incoming}", file=sys.stderr)
        return 2

    results = run(args.incoming, args.recordings, args.site, args.date, args.move, args.dry_run)
    if not results:
        print(f"Keine .jsonl-Dateien in {args.incoming} gefunden. Nichts zu tun.")
        return 0

    print_summary(results, args.site, args.date, args.move, args.dry_run)
    if any(not result.accepted for result in results):
        return 1
    if any(result.warnings for result in results):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
