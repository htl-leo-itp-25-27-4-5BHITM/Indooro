#!/usr/bin/env python3
"""Wendet die Entscheidungsregel aus `docs/pilot-readiness/hardware/POSITIONING_DECISION.md` mechanisch an.

Eingabe: die `*-comparison.json` von `compare_positioning.sh` (Schema `indooro-position-comparison/1`), eine je Lauf.
Ausgabe: Tabelle je Lauf, Mittelwerte der Differenzen (Engine minus aktuelle Pipeline) und das Ergebnis
BESSER, GLEICHWERTIG, SCHLECHTER, GEMISCHT oder EXPLORATIV. Die Schwellen stehen nur hier und im Dokument; sie
duerfen nach dem ersten echten Vergleich nicht mehr geaendert werden (Aenderungsprotokoll im Dokument).

Aufruf (Repo-Wurzel):
    python -I scripts/field/positioning_verdict.py lauf1-comparison.json lauf2-comparison.json lauf3-comparison.json

Exit: 0 Ergebnis ausgegeben, 2 Aufruf- oder Eingabefehler. Der Exit-Code sagt nichts ueber das Ergebnis.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

SCHEMA = "indooro-position-comparison/1"

# Vorab festgelegt (POSITIONING_DECISION.md, Abschnitt 4). Nicht nach dem ersten echten Vergleich aendern.
MIN_EVALUATION_RUNS = 3
MIN_EPOCHS_WITH_TRUTH = 100
EPSILON_ERROR_M = 0.3  # Median und P90: Unterschiede unter 0,3 m (Genauigkeit der Referenz) gelten als gleich
DELTA_RATE = 0.01  # Ausfall- und Sprungrate: Unterschiede bis 1 Prozentpunkt gelten als gleich

ERROR_FIGURES = ("median", "p90")
RATE_FIGURES = ("outageRate", "jumpRate")
FIGURES = ERROR_FIGURES + RATE_FIGURES


class InputError(Exception):
    pass


@dataclass
class Run:
    name: str
    sha256: Optional[str]
    delta: Dict[str, float]


def _figure(summary: Dict[str, object], method: str, key: str) -> Optional[float]:
    block = summary.get(method)
    value = block.get(key) if isinstance(block, dict) else None
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def qualify(path: Path) -> Tuple[Optional[Run], Optional[str]]:
    """(Lauf, None) oder (None, Grund). Nur Bewertungslaeufe aus dem Feld zaehlen."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise InputError(f"{path}: nicht lesbar ({error})")
    if not isinstance(data, dict) or data.get("schema") != SCHEMA:
        raise InputError(f"{path}: kein {SCHEMA}")
    recording = data.get("recording") if isinstance(data.get("recording"), dict) else {}
    name = str(recording.get("name") or path.name)
    if data.get("origin") != "field":
        return None, "synthetisch oder ohne Feldherkunft"
    session = data.get("session")
    role = session.get("role") if isinstance(session, dict) else None
    if role != "evaluation":
        return None, f"Rolle ist {role or 'unbekannt'}, nicht evaluation"
    summary = data.get("summary")
    if not isinstance(summary, dict):
        return None, "keine summary"
    for method in ("current", "engine"):
        count = _figure(summary, method, "epochsWithTruth")
        if count is None or count < MIN_EPOCHS_WITH_TRUTH:
            return None, f"{method}: weniger als {MIN_EPOCHS_WITH_TRUTH} Epochen mit Referenz"
    delta: Dict[str, float] = {}
    for key in FIGURES:
        engine, current = _figure(summary, "engine", key), _figure(summary, "current", key)
        if engine is None or current is None:
            return None, f"{key} nicht berechenbar (keine gueltigen Schaetzungen oder Paare)"
        delta[key] = engine - current
    sha = recording.get("sha256")
    return Run(name=name, sha256=sha if isinstance(sha, str) else None, delta=delta), None


def judge(runs: Sequence[Run]) -> Tuple[str, Dict[str, float], List[str]]:
    """(Ergebnis, mittlere Differenzen, Begruendungen). `runs` sind qualifizierte, verschiedene Laeufe."""
    mean = {key: sum(run.delta[key] for run in runs) / len(runs) for key in FIGURES}
    reasons: List[str] = []
    if len(runs) < MIN_EVALUATION_RUNS:
        reasons.append(f"{len(runs)} von mindestens {MIN_EVALUATION_RUNS} Bewertungslaeufen: Ergebnis ist explorativ.")
        return "EXPLORATIV", mean, reasons

    favor: List[str] = []
    against: List[str] = []
    conflict: List[str] = []
    for key in ERROR_FIGURES:
        if mean[key] <= -EPSILON_ERROR_M:
            favor.append(key)
            if any(run.delta[key] >= EPSILON_ERROR_M for run in runs):
                conflict.append(key)
        elif mean[key] >= EPSILON_ERROR_M:
            against.append(key)
    for key in RATE_FIGURES:
        if mean[key] < -DELTA_RATE:
            favor.append(key)
        elif mean[key] > DELTA_RATE:
            against.append(key)

    rule_met = (
        all(key in favor and key not in conflict for key in ERROR_FIGURES)
        and "outageRate" not in against
        and "jumpRate" not in against
    )
    if rule_met:
        reasons.append("Median und P90 besser, Ausfall- und Sprungrate nicht hoeher, in keinem Lauf ist ein Fehlerwert klar schlechter.")
        return "BESSER", mean, reasons
    if not favor and not against:
        reasons.append("Keine Kennzahl unterscheidet sich ueber die Toleranz (Fehler 0,3 m, Raten 1 Prozentpunkt).")
        return "GLEICHWERTIG", mean, reasons
    if against:
        reasons.append("Schlechter ueber die Toleranz: " + ", ".join(against) + ".")
    if favor:
        reasons.append("Besser ueber die Toleranz: " + ", ".join(favor) + ".")
    if conflict:
        reasons.append("In mindestens einem Lauf ist die Engine klar schlechter bei: " + ", ".join(conflict) + ".")
    return ("SCHLECHTER" if against and not favor else "GEMISCHT"), mean, reasons


DECISIONS = {
    "BESSER": "Die Engine darf vorgeschlagen werden, hinter ihrem Flag eingeschaltet zu werden (eigener Change, Team entscheidet). Vorher die Funkschicht im Feld pruefen (Abschnitt 6).",
    "GLEICHWERTIG": "Kein Genauigkeitsgewinn belegt. Das Flag bleibt aus. Ein Einschalten waere eine Architekturentscheidung und braucht eine eigene Begruendung.",
    "SCHLECHTER": "Das Flag bleibt aus. Ursache untersuchen.",
    "GEMISCHT": "Die Regel ist nicht erfuellt. Das Flag bleibt aus.",
    "EXPLORATIV": "Noch nicht entscheiden. Das Flag bleibt aus. Weitere Bewertungslaeufe aufnehmen.",
}


def render(accepted: Sequence[Run], rejected: Sequence[Tuple[str, str]], verdict: str, mean: Dict[str, float], reasons: Sequence[str]) -> str:
    lines = ["Entscheidungsregel Positionsberechnung (POSITIONING_DECISION.md)", ""]
    lines.append(f"Bewertungslaeufe gezaehlt: {len(accepted)} (Minimum {MIN_EVALUATION_RUNS})")
    for name, reason in rejected:
        lines.append(f"  nicht gezaehlt: {name}: {reason}")
    lines += ["", "Differenz Engine minus aktuelle Pipeline (negativ = Engine besser):", ""]
    header = f"{'Lauf':<44}{'Median (m)':>12}{'P90 (m)':>10}{'Ausfall (pp)':>14}{'Sprung (pp)':>13}"
    lines.append(header)
    for run in accepted:
        lines.append(
            f"{run.name[:43]:<44}{run.delta['median']:>+12.3f}{run.delta['p90']:>+10.3f}"
            f"{run.delta['outageRate'] * 100:>+14.1f}{run.delta['jumpRate'] * 100:>+13.1f}"
        )
    if accepted:
        lines.append(
            f"{'Mittel ueber die Laeufe':<44}{mean['median']:>+12.3f}{mean['p90']:>+10.3f}"
            f"{mean['outageRate'] * 100:>+14.1f}{mean['jumpRate'] * 100:>+13.1f}"
        )
    lines += ["", f"ERGEBNIS: {verdict}"]
    lines += [f"- {reason}" for reason in reasons]
    lines += [f"ENTSCHEIDUNG: {DECISIONS[verdict]}", ""]
    return "\n".join(lines)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Entscheidungsregel fuer die Positionsberechnung anwenden.")
    parser.add_argument("comparisons", nargs="+", type=Path, metavar="LAUF-comparison.json")
    args = parser.parse_args(argv)
    accepted: List[Run] = []
    rejected: List[Tuple[str, str]] = []
    seen: Dict[str, str] = {}
    try:
        for path in args.comparisons:
            run, reason = qualify(path)
            if run is None:
                rejected.append((path.name, reason or "unbekannt"))
                continue
            if run.sha256 and run.sha256 in seen:
                rejected.append((run.name, f"gleiche Aufnahme wie {seen[run.sha256]} (zweimal gezaehlt waere ein Datenleck)"))
                continue
            if run.sha256:
                seen[run.sha256] = run.name
            accepted.append(run)
    except InputError as error:
        print(f"Fehler: {error}", file=sys.stderr)
        return 2
    if accepted:
        verdict, mean, reasons = judge(accepted)
    else:
        verdict, mean, reasons = "EXPLORATIV", {key: 0.0 for key in FIGURES}, ["Kein Lauf erfuellt die Voraussetzungen."]
    print(render(accepted, rejected, verdict, mean, reasons))
    return 0


if __name__ == "__main__":
    sys.exit(main())
