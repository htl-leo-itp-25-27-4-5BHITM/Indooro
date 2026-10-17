"""Pilot-Auswertung: liest Studien-Export, Fragebogen, Feldwerte und Kriterien und schreibt die Berichte.

Aufruf:
  python -I scripts/pilot-eval/evaluate.py --study DIR --out DIR
      [--survey CSV] [--field CSV] [--criteria JSON] [--staff-hours H]

Exitcodes: 0 Berichte geschrieben (unabhängig von den Urteilen), 1 Eingabefehler
(keine Berichte, out-Ordner unberührt), 2 Aufruf-Fehler.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from inputs import (  # noqa: E402
    InputError,
    load_criteria,
    load_field,
    load_study,
    load_survey,
)
from metrics import compute_all  # noqa: E402
from report import format_value, write_reports  # noqa: E402

DEFAULT_CRITERIA = Path(__file__).resolve().parent / "criteria.json"


def _staff_hours(text: str) -> float:
    try:
        value = float(text)
    except ValueError:
        raise argparse.ArgumentTypeError(f"keine Zahl (Dezimalpunkt statt Komma): „{text}“") from None
    if not math.isfinite(value) or value < 0:
        raise argparse.ArgumentTypeError(f"muss eine Zahl >= 0 sein: „{text}“")
    return value


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Pilot-Auswertung: Kennzahlen gegen die Kriterien, Team- und Markt-Bericht.",
    )
    parser.add_argument("--study", required=True, help="Ordner mit study-*.csv (und .jsonl)")
    parser.add_argument("--out", required=True, help="Ausgabeordner für die Berichte")
    parser.add_argument("--survey", help="Fragebogen-CSV (test_id,q1..q5,freitext)")
    parser.add_argument("--field", help="Feldwerte-CSV (field-summary.csv)")
    parser.add_argument(
        "--criteria",
        default=str(DEFAULT_CRITERIA),
        help="Kriterien-JSON (Standard: criteria.json neben diesem Skript)",
    )
    parser.add_argument(
        "--staff-hours", type=_staff_hours, default=None,
        help="Aufwand Marktpersonal in Stunden gesamt (optional)",
    )
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)

    try:
        tasks = load_study(args.study)
        survey = load_survey(args.survey) if args.survey is not None else []
        field = load_field(args.field) if args.field is not None else []
        criteria = load_criteria(args.criteria)
    except InputError as exc:
        print(str(exc), file=sys.stderr)
        print("Keine Berichte geschrieben.", file=sys.stderr)
        return 1

    results = compute_all(tasks, survey, field, criteria, args.staff_hours)
    out = Path(args.out)
    try:
        write_reports(out, results, tasks, survey, field, criteria)
    except OSError as exc:
        print(f"Berichte konnten nicht geschrieben werden: {exc}", file=sys.stderr)
        return 1

    print(f"Pilot-Auswertung, Kriterien-Version {criteria['version']}")
    for result in results:
        print(f"{result.label}: {format_value(result)} – {result.verdict}")
    print(f"Berichte geschrieben nach: {out.resolve()}")
    return 0


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    sys.exit(main())
