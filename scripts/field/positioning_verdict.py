#!/usr/bin/env python3
"""Wendet die Entscheidungsregel aus `docs/pilot-readiness/hardware/POSITIONING_DECISION.md` mechanisch an.

Eingabe: die `*-comparison.json` von `compare_positioning.sh` (Schema `indooro-position-comparison/1`), eine je Lauf.
Ausgabe: Tabelle je Lauf, Mittelwerte der Differenzen (Engine minus aktuelle Pipeline) und das Ergebnis
BESSER, GLEICHWERTIG, SCHLECHTER, GEMISCHT oder EXPLORATIV. Die Schwellen stehen nur hier und im Dokument; sie
duerfen nach dem ersten echten Vergleich nicht mehr geändert werden (Aenderungsprotokoll im Dokument).

Aufruf (Repo-Wurzel):
    python -I scripts/field/positioning_verdict.py lauf1-comparison.json lauf2-comparison.json lauf3-comparison.json

Exit: 0 Ergebnis ausgegeben, 2 Aufruf- oder Eingabefehler. Der Exit-Code sagt nichts über das Ergebnis.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

SCHEMA = "indooro-position-comparison/1"

# Vorab festgelegt (POSITIONING_DECISION.md, Abschnitt 4). Nicht nach dem ersten echten Vergleich ändern.
MIN_EVALUATION_RUNS = 3
MIN_EPOCHS_WITH_TRUTH = 100
EPSILON_ERROR_M = 0.3  # Median und P90: Unterschiede unter 0,3 m (Genauigkeit der Referenz) gelten als gleich
DELTA_RATE = 0.01  # Ausfall- und Sprungrate: Unterschiede bis 1 Prozentpunkt gelten als gleich

SYNTHETIC_PREFIX = "synthetic-"  # Abschnitt 3, Punkt 1: Dateiname nicht synthetic-...
REHEARSAL_PREFIX = "rehearsal-"  # Generalprobe (make_synthetic_recordings.py): kein Feldlauf, außer mit allow_rehearsal
ROUND_DIGITS = 9  # Grenzfälle (genau -0,3 m, genau 1 Prozentpunkt) duerfen nicht an Fliesskomma-Rauschen scheitern

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
    path: Optional[Path] = None


def _figure(summary: Dict[str, object], method: str, key: str) -> Optional[float]:
    block = summary.get(method)
    value = block.get(key) if isinstance(block, dict) else None
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def qualify(path: Path, allow_rehearsal: bool = False) -> Tuple[Optional[Run], Optional[str]]:
    """(Lauf, None) oder (None, Grund). Nur Bewertungsläufe aus dem Feld zählen."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise InputError(f"{path}: nicht lesbar ({error})")
    if not isinstance(data, dict) or data.get("schema") != SCHEMA:
        raise InputError(f"{path}: kein {SCHEMA}")
    recording = data.get("recording") if isinstance(data.get("recording"), dict) else {}
    name = str(recording.get("name") or path.name)
    if name.startswith(REHEARSAL_PREFIX) and not allow_rehearsal:
        return None, "Probeaufnahme (rehearsal-), kein Feldlauf (nur mit --allow-rehearsal)"
    if data.get("origin") != "field" or name.startswith(SYNTHETIC_PREFIX):
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
            return None, f"{key} nicht berechenbar (keine gültigen Schätzungen oder Paare)"
        delta[key] = round(engine - current, ROUND_DIGITS)
    sha = recording.get("sha256")
    return Run(name=name, sha256=sha if isinstance(sha, str) else None, delta=delta, path=path), None


def judge(runs: Sequence[Run]) -> Tuple[str, Dict[str, float], List[str]]:
    """(Ergebnis, mittlere Differenzen, Begründungen). `runs` sind qualifizierte, verschiedene Läufe."""
    mean = {key: round(sum(run.delta[key] for run in runs) / len(runs), ROUND_DIGITS) for key in FIGURES}
    reasons: List[str] = []
    if len(runs) < MIN_EVALUATION_RUNS:
        reasons.append(f"{len(runs)} von mindestens {MIN_EVALUATION_RUNS} Bewertungsläufen: Ergebnis ist explorativ.")
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
        reasons.append("Median und P90 besser, Ausfall- und Sprungrate nicht höher, in keinem Lauf ist ein Fehlerwert klar schlechter.")
        return "BESSER", mean, reasons
    if not favor and not against:
        reasons.append("Keine Kennzahl unterscheidet sich über die Toleranz (Fehler 0,3 m, Raten 1 Prozentpunkt).")
        return "GLEICHWERTIG", mean, reasons
    if against:
        reasons.append("Schlechter über die Toleranz: " + ", ".join(against) + ".")
    if favor:
        reasons.append("Besser über die Toleranz: " + ", ".join(favor) + ".")
    if conflict:
        reasons.append("In mindestens einem Lauf ist die Engine klar schlechter bei: " + ", ".join(conflict) + ".")
    return ("SCHLECHTER" if against and not favor else "GEMISCHT"), mean, reasons


@dataclass
class Criterion:
    """Eine der Bedingungen aus Abschnitt 4 (Nummer wie im Dokument) mit Ergebnis und Klartext."""

    number: int
    passed: bool
    text: str


FIGURE_LABEL = {"median": "Median", "p90": "P90", "outageRate": "Ausfallrate", "jumpRate": "Sprungrate"}


def _de(value: float, digits: int) -> str:
    return f"{value:+.{digits}f}".replace(".", ",")


def criteria(runs: Sequence[Run], mean: Dict[str, float]) -> List[Criterion]:
    """Die fuenf Bedingungen für BESSER einzeln (Abschnitt 4), unabhaengig vom Gesamtergebnis."""
    result = [Criterion(1, len(runs) >= MIN_EVALUATION_RUNS, f"Mindestens {MIN_EVALUATION_RUNS} Bewertungsläufe: {len(runs)} gezählt.")]
    for number, key in ((2, "median"), (3, "p90")):
        worse = [run.name for run in runs if run.delta[key] >= EPSILON_ERROR_M]
        ok = bool(runs) and mean[key] <= -EPSILON_ERROR_M and not worse
        text = f"{FIGURE_LABEL[key]}: Mittel der Differenzen {_de(mean[key], 2)} m (gefordert: Engine im Mittel mindestens 0,3 m genauer)"
        text += (
            f"; Lauf mit 0,3 m oder mehr schlechter: {', '.join(worse)}."
            if worse
            else "; kein Lauf ist um 0,3 m oder mehr schlechter."
        )
        result.append(Criterion(number, ok, text))
    for number, key in ((4, "outageRate"), (5, "jumpRate")):
        ok = bool(runs) and mean[key] <= DELTA_RATE
        text = f"{FIGURE_LABEL[key]}: Mittel der Differenzen {_de(mean[key] * 100, 1)} Prozentpunkte (gefordert: höchstens +1,0)."
        result.append(Criterion(number, ok, text))
    return result


@dataclass
class Evaluation:
    accepted: List[Run]
    rejected: List[Tuple[str, str]]
    verdict: str
    mean: Dict[str, float]
    reasons: List[str]
    rejected_by_path: Optional[Dict[Path, str]] = None  # Vergleichsdatei -> Grund, für Berichte je Lauf


def evaluate(paths: Sequence[Path], allow_rehearsal: bool = False) -> Evaluation:
    """Alle Vergleichsdateien durch die Regel schicken. Wirft InputError bei unlesbaren oder falschen Dateien."""
    accepted: List[Run] = []
    rejected: List[Tuple[str, str]] = []
    seen: Dict[str, str] = {}
    by_path: Dict[Path, str] = {}
    for path in paths:
        run, reason = qualify(path, allow_rehearsal)
        if run is None:
            rejected.append((path.name, reason or "unbekannt"))
            by_path[path] = reason or "unbekannt"
            continue
        if run.sha256 and run.sha256 in seen:
            why = f"gleiche Aufnahme wie {seen[run.sha256]} (zweimal gezählt wäre ein Datenleck)"
            rejected.append((run.name, why))
            by_path[path] = why
            continue
        if run.sha256:
            seen[run.sha256] = run.name
        accepted.append(run)
    if accepted:
        verdict, mean, reasons = judge(accepted)
    else:
        verdict, mean, reasons = "EXPLORATIV", {key: 0.0 for key in FIGURES}, ["Kein Lauf erfüllt die Voraussetzungen."]
    return Evaluation(accepted, rejected, verdict, mean, reasons, by_path)


DECISIONS = {
    "BESSER": "Die Engine darf vorgeschlagen werden, hinter ihrem Flag eingeschaltet zu werden (eigener Change, Team entscheidet). Vorher die Funkschicht im Feld prüfen (Abschnitt 6).",
    "GLEICHWERTIG": "Kein Genauigkeitsgewinn belegt. Das Flag bleibt aus. Ein Einschalten wäre eine Architekturentscheidung und braucht eine eigene Begründung.",
    "SCHLECHTER": "Das Flag bleibt aus. Ursache untersuchen.",
    "GEMISCHT": "Die Regel ist nicht erfüllt. Das Flag bleibt aus.",
    "EXPLORATIV": "Noch nicht entscheiden. Das Flag bleibt aus. Weitere Bewertungsläufe aufnehmen.",
}


def render(accepted: Sequence[Run], rejected: Sequence[Tuple[str, str]], verdict: str, mean: Dict[str, float], reasons: Sequence[str]) -> str:
    lines = ["Entscheidungsregel Positionsberechnung (POSITIONING_DECISION.md)", ""]
    lines.append(f"Bewertungsläufe gezählt: {len(accepted)} (Minimum {MIN_EVALUATION_RUNS})")
    for name, reason in rejected:
        lines.append(f"  nicht gezählt: {name}: {reason}")
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
            f"{'Mittel über die Läufe':<44}{mean['median']:>+12.3f}{mean['p90']:>+10.3f}"
            f"{mean['outageRate'] * 100:>+14.1f}{mean['jumpRate'] * 100:>+13.1f}"
        )
    lines += ["", f"ERGEBNIS: {verdict}"]
    lines += [f"- {reason}" for reason in reasons]
    lines += [f"ENTSCHEIDUNG: {DECISIONS[verdict]}", ""]
    return "\n".join(lines)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Entscheidungsregel für die Positionsberechnung anwenden.")
    parser.add_argument("comparisons", nargs="+", type=Path, metavar="LAUF-comparison.json")
    parser.add_argument("--allow-rehearsal", action="store_true", help="rehearsal-*-Aufnahmen (Generalprobe) mitzählen; nie für eine echte Entscheidung")
    args = parser.parse_args(argv)
    try:
        result = evaluate(args.comparisons, args.allow_rehearsal)
    except InputError as error:
        print(f"Fehler: {error}", file=sys.stderr)
        return 2
    print(render(result.accepted, result.rejected, result.verdict, result.mean, result.reasons))
    return 0


if __name__ == "__main__":
    sys.exit(main())
