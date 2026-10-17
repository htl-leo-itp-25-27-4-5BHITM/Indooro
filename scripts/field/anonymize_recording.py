#!/usr/bin/env python3
"""Anonymisiert Navigationsaufzeichnungen (JSON Lines) vor der Pruefung.

Entfernt layout.shopName und ersetzt event.plan[].title durch `stop-<id>`.
Alle anderen Zeilen bleiben erhalten. Zeilen werden mit sortierten Schluesseln
und ohne Leerzeichen neu geschrieben. Zeilen, die kein gueltiges JSON sind,
bleiben unveraendert, damit die Pruefung sie meldet.

Task 4.5 (openspec/changes/establish-pilot-field-measurement).

Aufruf (Repo-Wurzel):
    python -I scripts/field/anonymize_recording.py IN OUT

Die Ausgabedatei wird nur geschrieben, wenn die Pruefung danach keinen Verstoss meldet.
Eine bestehende Ausgabedatei wird nicht ueberschrieben.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import List, Optional, Sequence

sys.path.insert(0, str(Path(__file__).resolve().parent))

from check_recording_anonymized import check_lines, split_lines  # noqa: E402


def anonymize_line(line: str) -> str:
    """Eine Zeile anonymisieren. Ungueltiges JSON wird unveraendert zurueckgegeben."""
    text = line.rstrip("\r\n")
    if not text.strip():
        return text
    try:
        obj = json.loads(text)
    except ValueError:
        return line
    if not isinstance(obj, dict):
        return line
    line_type = obj.get("type")
    if line_type == "layout":
        obj.pop("shopName", None)
    elif line_type == "event" and isinstance(obj.get("plan"), list):
        for stop in obj["plan"]:
            if isinstance(stop, dict) and "title" in stop and isinstance(stop.get("id"), str):
                stop["title"] = f"stop-{stop['id']}"
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def anonymize_lines(lines: Sequence[str]) -> List[str]:
    """Liste von Zeilen (ohne Zeilenende) anonymisieren. Leere Zeilen bleiben leer."""
    return [anonymize_line(line) for line in lines]


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if len(args) != 2:
        print("Aufruf: anonymize_recording.py IN OUT", file=sys.stderr)
        return 2
    source, target = Path(args[0]), Path(args[1])
    if source.resolve() == target.resolve():
        print("Fehler: Eingabe und Ausgabe sind dieselbe Datei", file=sys.stderr)
        return 2
    if target.exists():
        print(f"Fehler: {target} existiert bereits und wird nicht ueberschrieben", file=sys.stderr)
        return 2
    try:
        text = source.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as error:
        print(f"Fehler: {source} ist nicht lesbar ({error})", file=sys.stderr)
        return 2

    anonymized = anonymize_lines(split_lines(text))
    violations = check_lines(anonymized)
    if violations:
        for violation in violations:
            print(f"{source}:{violation.line}: {violation.reason}")
        print("Nicht geschrieben: die Anonymisierungspruefung meldet Verstoesse.", file=sys.stderr)
        return 1

    content = "\n".join(anonymized) + "\n"
    try:
        with open(os.fspath(target), "x", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
    except OSError as error:
        print(f"Fehler: {target} kann nicht geschrieben werden ({error})", file=sys.stderr)
        return 2
    print(f"Geschrieben: {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
