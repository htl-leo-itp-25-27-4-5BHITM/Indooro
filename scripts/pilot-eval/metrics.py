"""Kennzahlen der Pilot-Auswertung mit Verdikt gegen die Kriterien aus criteria.json.

Nur Standardbibliothek. Verdikt je Kennzahl: „erfüllt“, „nicht erfüllt“ oder
„zu wenig Daten“ (kein Wert oder weniger Fälle als min_n). Eine Tour ist eine
Aufgabe mit condition „app“. Die beschreibenden Werte bleiben auch bei „zu wenig
Daten“ erhalten.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from math import comb
from typing import Any, Iterable, Optional

from inputs import FieldRow, SurveyRow, Task

VERDICT_MET = "erfüllt"
VERDICT_NOT_MET = "nicht erfüllt"
VERDICT_NO_DATA = "zu wenig Daten"

_TOLERANCE = 1e-9
_CONDITIONS = ("app", "ohne_app")
_OUTCOMES = ("gefunden", "hilfe", "abgebrochen")
_WIEDER_NUTZEN_MIN = 4  # Antwort q1 ab diesem Wert gilt als „würde wieder nutzen“.

# Reihenfolge wie in der Spezifikation (nicht die Reihenfolge in criteria.json).
METRIC_ORDER = (
    "task_success", "faster_share", "manual_corrections_median", "unjustified_stop_changes",
    "false_reroutes_per_tour", "abort_rate", "reuse_share", "incident_rate", "staff_hours",
    "field_reroutes",
)


@dataclass(frozen=True)
class Pair:
    """Zwei Aufgaben desselben Tests und derselben Sitzung: eine mit App, eine ohne."""

    test_id: str
    app: Task
    without: Task


@dataclass(frozen=True)
class MetricResult:
    """Ergebnis einer Kennzahl mit Kriterium und Verdikt."""

    id: str
    label: str
    value: Optional[float]
    n: int
    n_unit: str
    unit: str
    op: str
    threshold: float
    min_n: int
    verdict: str
    note: str
    details: dict


# --- Paarung und Test --------------------------------------------------------

def pair_tasks(tasks: Iterable[Task]) -> list[Pair]:
    """Paart je Test und Sitzung aufeinanderfolgende Aufgaben mit unterschiedlicher condition."""
    groups: dict[tuple[str, str], list[Task]] = {}
    for task in tasks:
        groups.setdefault((task.test_id, task.session_id), []).append(task)

    pairs: list[Pair] = []
    for (test_id, _session_id), members in groups.items():
        members.sort(key=lambda t: (t.started_at, t.task_no))
        i = 0
        while i + 1 < len(members):
            first, second = members[i], members[i + 1]
            if first.condition == second.condition:
                i += 1
                continue
            if first.condition == "app":
                pairs.append(Pair(test_id, first, second))
            else:
                pairs.append(Pair(test_id, second, first))
            i += 2

    pairs.sort(
        key=lambda p: (
            p.test_id,
            min(p.app.started_at, p.without.started_at),
            p.app.session_id,
            p.app.task_no,
        )
    )
    return pairs


def sign_test_p(wins: int, losses: int) -> float:
    """Zweiseitiger exakter Vorzeichentest (Binomial, p = 0.5). Ohne Fälle: 1.0."""
    n = wins + losses
    if n == 0:
        return 1.0
    k = min(wins, losses)
    tail = sum(comb(n, i) for i in range(k + 1))
    return min(1.0, 2 * tail / 2 ** n)


# --- Verdikt -----------------------------------------------------------------

def _meets(value: float, op: str, threshold: float) -> bool:
    if op == ">=":
        return value >= threshold - _TOLERANCE
    if op == "<=":
        return value <= threshold + _TOLERANCE
    if op == "==":
        return abs(value - threshold) <= _TOLERANCE
    raise ValueError(f"unbekannter Operator „{op}“")


def judge(value: Optional[float], n: int, op: str, threshold: float, min_n: int) -> str:
    """Verdikt einer Kennzahl. Ein einziger Verstoß gegen „== 0“ genügt auch bei wenig Daten."""
    if value is None:
        return VERDICT_NO_DATA
    if op == "==" and threshold == 0 and value > 0:
        return VERDICT_NOT_MET
    if n < min_n:
        return VERDICT_NO_DATA
    return VERDICT_MET if _meets(value, op, threshold) else VERDICT_NOT_MET


def _note(verdict: str, n: int, min_n: int, n_unit: str) -> str:
    if n >= min_n:
        return ""
    if verdict == VERDICT_NOT_MET:
        return f"n = {n} < {min_n} {n_unit}: ein Verstoß genügt"
    return f"n = {n} < {min_n} {n_unit}: nur beschreibend"


def _result(
    metric_id: str,
    criteria: dict,
    value: Optional[float],
    n: int,
    details: dict,
) -> MetricResult:
    metric = criteria["metrics"][metric_id]
    op = metric["op"]
    threshold = float(metric["value"])
    min_n = int(metric["min_n"])
    verdict = judge(value, n, op, threshold, min_n)
    return MetricResult(
        id=metric_id,
        label=metric["label"],
        value=None if value is None else float(value),
        n=n,
        n_unit=metric["n_unit"],
        unit=metric["unit"],
        op=op,
        threshold=threshold,
        min_n=min_n,
        verdict=verdict,
        note=_note(verdict, n, min_n, metric["n_unit"]),
        details=details,
    )


# --- Hilfsfunktionen ---------------------------------------------------------

def _ratio(part: int, whole: int) -> Optional[float]:
    return part / whole if whole else None


def _median_or_none(values: list[float]) -> Optional[float]:
    return float(statistics.median(values)) if values else None


def _mean_or_none(values: list[float]) -> Optional[float]:
    return sum(values) / len(values) if values else None


def _outcome_counts(tasks: list[Task], condition: str) -> dict[str, int]:
    return {
        outcome: sum(1 for t in tasks if t.condition == condition and t.outcome == outcome)
        for outcome in _OUTCOMES
    }


def _tours(tasks: list[Task]) -> list[Task]:
    return [t for t in tasks if t.condition == "app"]


# --- Kennzahlen (je: Wert, n, Details) ---------------------------------------

def _task_success(tasks: list[Task]) -> tuple[Optional[float], int, dict]:
    tours = _tours(tasks)
    found = sum(1 for t in tours if t.outcome == "gefunden")
    share = {
        cond: _ratio(
            sum(1 for t in tasks if t.condition == cond and t.outcome == "gefunden"),
            sum(1 for t in tasks if t.condition == cond),
        )
        for cond in _CONDITIONS
    }
    details = {
        "gefunden_anteil": share,
        "ergebnisse": {cond: _outcome_counts(tasks, cond) for cond in _CONDITIONS},
    }
    return _ratio(found, len(tours)), len(tours), details


def _faster_share(tasks: list[Task]) -> tuple[Optional[float], int, dict]:
    pairs = pair_tasks(tasks)
    usable = [
        p for p in pairs
        if p.app.outcome == "gefunden" and p.without.outcome == "gefunden"
    ]
    wins = sum(1 for p in usable if p.app.duration_s < p.without.duration_s)
    losses = sum(1 for p in usable if p.app.duration_s > p.without.duration_s)
    ties = len(usable) - wins - losses
    diffs = [p.without.duration_s - p.app.duration_s for p in usable]
    details = {
        "median_app_s": _median_or_none([p.app.duration_s for p in usable]),
        "median_without_s": _median_or_none([p.without.duration_s for p in usable]),
        "median_diff_s": _median_or_none(diffs),
        "wins": wins,
        "losses": losses,
        "ties": ties,
        "p_sign": sign_test_p(wins, losses),
        "pairs_total": len(pairs),
        "pairs_excluded": len(pairs) - len(usable),
    }
    return _ratio(wins, len(usable)), len(usable), details


def _manual_corrections_median(tasks: list[Task]) -> tuple[Optional[float], int, dict]:
    tours = _tours(tasks)
    values = [t.manual_position_count for t in tours if t.manual_position_count is not None]
    details = {
        "ohne_wert": len(tours) - len(values),
        "mittelwert": _mean_or_none(values),
        "maximum": max(values) if values else None,
    }
    return _median_or_none(values), len(values), details


def _unjustified_stop_changes(tasks: list[Task]) -> tuple[Optional[float], int, dict]:
    tours = _tours(tasks)
    values = [
        t.stop_change_without_event_count
        for t in tours
        if t.stop_change_without_event_count is not None
    ]
    details = {
        "ohne_wert": len(tours) - len(values),
        "touren_mit_zielwechsel": sum(1 for v in values if v > 0),
    }
    value = float(sum(values)) if values else None
    return value, len(values), details


def _false_reroutes_per_tour(tasks: list[Task]) -> tuple[Optional[float], int, dict]:
    tours = _tours(tasks)
    values = [t.reroute_count for t in tours if t.reroute_count is not None]
    details = {
        "ohne_wert": len(tours) - len(values),
        "maximum": max(values) if values else None,
    }
    return _mean_or_none(values), len(values), details


def _abort_rate(tasks: list[Task]) -> tuple[Optional[float], int, dict]:
    tours = _tours(tasks)
    aborted = sum(1 for t in tours if t.outcome == "abgebrochen")
    return _ratio(aborted, len(tours)), len(tours), {"abgebrochen": aborted}


def _reuse_share(survey: list[SurveyRow]) -> tuple[Optional[float], int, dict]:
    wieder = sum(1 for row in survey if row.answers[0] >= _WIEDER_NUTZEN_MIN)
    question_means: list[Optional[float]] = [
        _mean_or_none([row.answers[i] for row in survey]) for i in range(5)
    ]
    details = {"question_means": question_means, "wieder_nutzen": wieder}
    return _ratio(wieder, len(survey)), len(survey), details


def _incident_rate(tasks: list[Task]) -> tuple[Optional[float], int, dict]:
    tours = _tours(tasks)
    incidents = sum(t.app_error_count for t in tours)
    rate = _ratio(incidents, len(tours))
    details = {
        "incidents": incidents,
        "per_20_tours": None if rate is None else rate * 20,
    }
    return rate, len(tours), details


def _staff_hours(staff_hours: Optional[float]) -> tuple[Optional[float], int, dict]:
    if staff_hours is None:
        return None, 0, {}
    return float(staff_hours), 1, {}


def _field_reroutes(field: list[FieldRow]) -> tuple[Optional[float], int, dict]:
    rows = [
        {
            "site": row.site,
            "date": row.date.isoformat(),
            "device": row.device,
            "median_error_m": row.median_error_m,
            "p90_error_m": row.p90_error_m,
            "correct_aisle_share": row.correct_aisle_share,
            "reroutes_per_tour": row.reroutes_per_tour,
        }
        for row in field
    ]
    value = max(row.reroutes_per_tour for row in field) if field else None
    return value, len(field), {"rows": rows}


# --- Gesamtauswertung --------------------------------------------------------

def compute_all(
    tasks: Iterable[Task],
    survey: Iterable[SurveyRow],
    field: Iterable[FieldRow],
    criteria: dict[str, Any],
    staff_hours: Optional[float] = None,
) -> list[MetricResult]:
    """Berechnet alle Kennzahlen in der Reihenfolge METRIC_ORDER gegen criteria.json."""
    task_list = list(tasks)
    survey_list = list(survey)
    field_list = list(field)
    computed = {
        "task_success": _task_success(task_list),
        "faster_share": _faster_share(task_list),
        "manual_corrections_median": _manual_corrections_median(task_list),
        "unjustified_stop_changes": _unjustified_stop_changes(task_list),
        "false_reroutes_per_tour": _false_reroutes_per_tour(task_list),
        "abort_rate": _abort_rate(task_list),
        "reuse_share": _reuse_share(survey_list),
        "incident_rate": _incident_rate(task_list),
        "staff_hours": _staff_hours(staff_hours),
        "field_reroutes": _field_reroutes(field_list),
    }
    return [
        _result(metric_id, criteria, *computed[metric_id])
        for metric_id in METRIC_ORDER
    ]
