"""Eingabeprüfung für die Pilot-Auswertung: Studien-Export, Fragebogen, Feldwerte, Kriterien.

Nur Standardbibliothek. Jeder Fehler ist ein InputError mit der Meldung
"<Datei>: Zeile <n>: <Problem>" (Zeile 1 = Kopfzeile). Dateifehler ohne Zeile:
"<Datei>: <Problem>".
"""

from __future__ import annotations

import csv
import io
import json
import math
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

TEST_ID_RE = r"^T\d{1,3}$"
_TEST_ID = re.compile(TEST_ID_RE, re.ASCII)
_INT = re.compile(r"[0-9]+")
_DECIMAL = re.compile(r"[0-9]+(?:\.[0-9]+)?")
_DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
_ANSWER = re.compile(r"[1-5]")

CONDITIONS = frozenset({"app", "ohne_app"})
POSITIONING = frozenset({"mit_ortung", "ohne_ortung", "-"})
OUTCOMES = frozenset({"gefunden", "hilfe", "abgebrochen"})
EVENT_TYPES = frozenset(
    {"taskStart", "taskEnd", "manualPosition", "reroute", "stopChange", "error", "note"}
)

# Export-Format laut add-pilot-study-mode/design.md, Decision 4.
STUDY_COLUMNS = (
    "test_id", "session_id", "store_code", "task_no", "product_id", "product_name",
    "condition", "positioning_mode", "started_at", "ended_at", "duration_s", "outcome",
    "manual_position_count", "reroute_count", "stop_change_without_event_count",
    "app_error_count",
)
SURVEY_COLUMNS = ("test_id", "q1", "q2", "q3", "q4", "q5", "freitext")
SURVEY_QUESTIONS = (
    ("q1", "Würde die App wieder nutzen"),
    ("q2", "Bedienung war einfach"),
    ("q3", "Vertrauen in die Standortanzeige"),
    ("q4", "Würde seltener Personal fragen"),
    ("q5", "Gesamteindruck"),
)
FIELD_COLUMNS = (
    "site", "date", "device", "median_error_m", "p90_error_m",
    "correct_aisle_share", "reroutes_per_tour",
)
CRITERIA_METRIC_IDS = (
    "task_success", "faster_share", "manual_corrections_median", "unjustified_stop_changes",
    "false_reroutes_per_tour", "abort_rate", "reuse_share", "staff_hours", "incident_rate",
    "field_reroutes",
)
CRITERIA_OPS = frozenset({">=", "<=", "=="})


class InputError(Exception):
    """Fehler in einer Eingabedatei; die Meldung nennt Datei und Zeile."""


@dataclass(frozen=True)
class Task:
    test_id: str
    session_id: str
    store_code: str
    task_no: int
    product_id: int
    product_name: str
    condition: str
    positioning_mode: str
    started_at: datetime
    ended_at: datetime
    duration_s: float
    outcome: str
    manual_position_count: Optional[int]
    reroute_count: Optional[int]
    stop_change_without_event_count: Optional[int]
    app_error_count: int


@dataclass(frozen=True)
class SurveyRow:
    test_id: str
    answers: tuple[int, int, int, int, int]
    freitext: str


@dataclass(frozen=True)
class FieldRow:
    site: str
    date: date
    device: str
    median_error_m: float
    p90_error_m: float
    correct_aisle_share: float
    reroutes_per_tour: float


# --- Hilfsfunktionen -------------------------------------------------------

def _err(name: str, line: Optional[int], problem: str) -> InputError:
    if line is None:
        return InputError(f"{name}: {problem}")
    return InputError(f"{name}: Zeile {line}: {problem}")


def _read_text(path: Path) -> str:
    name = path.name
    try:
        with open(path, encoding="utf-8", newline="") as fh:
            text = fh.read()
    except UnicodeDecodeError:
        raise _err(name, _decode_error_line(path), "keine gültige UTF-8-Kodierung") from None
    except OSError as exc:
        raise _err(name, None, f"Datei nicht lesbar ({exc.strerror or exc})") from None
    return text[1:] if text.startswith("﻿") else text


def _decode_error_line(path: Path) -> int:
    raw = path.read_bytes()
    try:
        raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        return raw.count(b"\n", 0, exc.start) + 1
    return 1


def _csv_records(path: Path) -> tuple[list[str], list[tuple[int, list[str]]]]:
    """Gibt Kopfzeile und Datensätze mit Zeilennummer zurück (Leerzeilen entfallen)."""
    name = path.name
    reader = csv.reader(io.StringIO(_read_text(path), newline=""))
    records: list[tuple[int, list[str]]] = []
    try:
        for row in reader:
            if row:
                records.append((reader.line_num, row))
    except csv.Error as exc:
        raise _err(name, reader.line_num, f"ungültiges CSV ({exc})") from None
    if not records:
        raise _err(name, 1, "Kopfzeile fehlt")
    header = [h.strip() for h in records[0][1]]
    return header, records[1:]


def _columns(name: str, header: list[str], expected: tuple[str, ...]) -> dict[str, int]:
    duplicate = next((c for c in header if header.count(c) > 1), None)
    if duplicate is not None:
        raise _err(name, 1, f"doppelte Spalte „{duplicate}“")
    missing = [c for c in expected if c not in header]
    if missing:
        raise _err(name, 1, "fehlende Spalte(n): " + ", ".join(f"„{c}“" for c in missing))
    unknown = [c for c in header if c not in expected]
    if unknown:
        raise _err(name, 1, f"unbekannte Spalte „{unknown[0]}“")
    return {c: header.index(c) for c in expected}


def _check_width(name: str, line: int, row: list[str], width: int) -> None:
    if len(row) != width:
        raise _err(name, line, f"{len(row)} statt {width} Felder")


def _value(row: list[str], cols: dict[str, int], column: str) -> str:
    return row[cols[column]].strip()


def _enum(name: str, line: int, column: str, value: str, allowed: frozenset) -> str:
    if value not in allowed:
        raise _err(
            name, line,
            f"unbekannter Wert „{value}“ in {column} (erlaubt: {', '.join(sorted(allowed))})",
        )
    return value


def _check_test_id(name: str, line: int, value: str) -> str:
    if not _TEST_ID.fullmatch(value):
        raise _err(name, line, f"ungültige Test-ID „{value}“ (erwartet z. B. T01)")
    return value


def _nonempty(name: str, line: int, label: str, value: str) -> str:
    if not value:
        raise _err(name, line, f"{label}: darf nicht leer sein")
    return value


def _nonneg_int(name: str, line: int, label: str, value: str) -> int:
    if not _INT.fullmatch(value):
        raise _err(name, line, f"{label}: keine ganze Zahl >= 0 („{value}“)")
    return int(value)


def _counter(name: str, line: int, label: str, value: str) -> Optional[int]:
    if value == "-":
        return None
    return _nonneg_int(name, line, label, value)


def _nonneg_float(name: str, line: int, label: str, value: str) -> float:
    if not _DECIMAL.fullmatch(value):
        raise _err(
            name, line,
            f"{label}: keine Zahl >= 0 („{value}“, Dezimalpunkt statt Komma verwenden)",
        )
    number = float(value)
    if not math.isfinite(number):
        raise _err(name, line, f"{label}: Zahl ist nicht endlich („{value}“)")
    return number


def _share(name: str, line: int, label: str, value: str) -> float:
    number = _nonneg_float(name, line, label, value)
    if number > 1:
        raise _err(name, line, f"{label}: Anteil muss zwischen 0 und 1 liegen („{value}“)")
    return number


def _timestamp(name: str, line: int, label: str, value: str) -> datetime:
    text = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        raise _err(name, line, f"{label}: kein ISO-8601-Zeitstempel („{value}“)") from None
    if parsed.utcoffset() != timedelta(0):
        raise _err(name, line, f"{label}: Zeit muss UTC sein (Z), gefunden „{value}“")
    return parsed.astimezone(timezone.utc)


def _date(name: str, line: int, label: str, value: str) -> date:
    if not _DATE.fullmatch(value):
        raise _err(name, line, f"{label}: kein Datum im Format JJJJ-MM-TT („{value}“)")
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise _err(name, line, f"{label}: kein gültiges Datum („{value}“)") from None


# --- Studien-Export (CSV + JSONL) ------------------------------------------

def _study_task(name: str, line: int, cols: dict[str, int], row: list[str]) -> Task:
    def v(column: str) -> str:
        return _value(row, cols, column)

    test_id = _check_test_id(name, line, v("test_id"))
    session_id = _nonempty(name, line, "session_id", v("session_id"))
    task_no = _nonneg_int(name, line, "task_no", v("task_no"))
    product_id = _nonneg_int(name, line, "product_id", v("product_id"))
    product_name = _nonempty(name, line, "product_name", v("product_name"))
    condition = _enum(name, line, "condition", v("condition"), CONDITIONS)
    positioning = _enum(name, line, "positioning_mode", v("positioning_mode"), POSITIONING)
    if (condition == "app") != (positioning != "-"):
        raise _err(
            name, line,
            f"positioning_mode „{positioning}“ passt nicht zu condition „{condition}“",
        )
    started = _timestamp(name, line, "started_at", v("started_at"))
    ended = _timestamp(name, line, "ended_at", v("ended_at"))
    if ended < started:
        raise _err(name, line, "ended_at liegt vor started_at")
    duration = _nonneg_float(name, line, "duration_s", v("duration_s"))
    outcome = _enum(name, line, "outcome", v("outcome"), OUTCOMES)
    return Task(
        test_id=test_id,
        session_id=session_id,
        store_code=v("store_code"),
        task_no=task_no,
        product_id=product_id,
        product_name=product_name,
        condition=condition,
        positioning_mode=positioning,
        started_at=started,
        ended_at=ended,
        duration_s=duration,
        outcome=outcome,
        manual_position_count=_counter(name, line, "manual_position_count", v("manual_position_count")),
        reroute_count=_counter(name, line, "reroute_count", v("reroute_count")),
        stop_change_without_event_count=_counter(
            name, line, "stop_change_without_event_count", v("stop_change_without_event_count")
        ),
        app_error_count=_nonneg_int(name, line, "app_error_count", v("app_error_count")),
    )


def _study_csv(path: Path, seen: dict[tuple, tuple[str, int]]) -> list[Task]:
    name = path.name
    header, records = _csv_records(path)
    cols = _columns(name, header, STUDY_COLUMNS)
    tasks: list[Task] = []
    for line, row in records:
        _check_width(name, line, row, len(header))
        task = _study_task(name, line, cols, row)
        key = (task.test_id, task.session_id, task.task_no)
        if key in seen:
            other_name, other_line = seen[key]
            raise _err(
                name, line,
                f"doppelte Aufgabe {task.test_id}/{task.session_id}/Aufgabe {task.task_no} "
                f"(schon in {other_name}, Zeile {other_line})",
            )
        seen[key] = (name, line)
        tasks.append(task)
    return tasks


def _check_events(path: Path) -> None:
    """Prüft jede Zeile der JSONL-Ereignisdatei; die Ereignisse werden nicht zurückgegeben."""
    name = path.name
    for line_no, raw in enumerate(_read_text(path).split("\n"), start=1):
        raw = raw.strip()
        if not raw:
            continue
        try:
            event = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise _err(name, line_no, f"kein gültiges JSON ({exc.msg})") from None
        if not isinstance(event, dict):
            raise _err(name, line_no, "kein JSON-Objekt")
        event_type = event.get("type")
        if not isinstance(event_type, str) or event_type not in EVENT_TYPES:
            raise _err(
                name, line_no,
                f"unbekannter Ereignistyp „{event_type}“ (erlaubt: {', '.join(sorted(EVENT_TYPES))})",
            )
        test_id = event.get("testId")
        if not isinstance(test_id, str):
            raise _err(name, line_no, "testId fehlt")
        _check_test_id(name, line_no, test_id)
        stamp = event.get("t")
        if not isinstance(stamp, str):
            raise _err(name, line_no, "Zeitstempel t fehlt")
        _timestamp(name, line_no, "t", stamp)


def load_study(directory) -> list[Task]:
    """Liest alle study-*.csv im Ordner (sortiert) und prüft die zugehörigen .jsonl-Dateien."""
    folder = Path(directory)
    label = folder.name or str(folder)
    if not folder.is_dir():
        raise InputError(f"{label}: kein Ordner")
    csv_files = sorted(p for p in folder.glob("study-*.csv") if p.is_file())
    if not csv_files:
        raise InputError(f"{label}: keine study-*.csv-Dateien gefunden")
    tasks: list[Task] = []
    seen: dict[tuple, tuple[str, int]] = {}
    for csv_path in csv_files:
        tasks.extend(_study_csv(csv_path, seen))
        events_path = csv_path.with_suffix(".jsonl")
        if events_path.is_file():
            _check_events(events_path)
    return tasks


# --- Fragebogen, Feldwerte, Kriterien --------------------------------------

def load_survey(path) -> list[SurveyRow]:
    file_path = Path(path)
    name = file_path.name
    header, records = _csv_records(file_path)
    cols = _columns(name, header, SURVEY_COLUMNS)
    rows: list[SurveyRow] = []
    seen: dict[str, int] = {}
    for line, row in records:
        _check_width(name, line, row, len(header))
        test_id = _check_test_id(name, line, _value(row, cols, "test_id"))
        if test_id in seen:
            raise _err(name, line, f"doppelte Test-ID „{test_id}“ (schon in Zeile {seen[test_id]})")
        seen[test_id] = line
        answers: list[int] = []
        for question_id, _ in SURVEY_QUESTIONS:
            raw = _value(row, cols, question_id)
            if not _ANSWER.fullmatch(raw):
                raise _err(
                    name, line,
                    f"{question_id}: Antwort muss eine ganze Zahl von 1 bis 5 sein („{raw}“)",
                )
            answers.append(int(raw))
        rows.append(SurveyRow(test_id, tuple(answers), row[cols["freitext"]].strip()))
    return rows


def load_field(path) -> list[FieldRow]:
    file_path = Path(path)
    name = file_path.name
    header, records = _csv_records(file_path)
    cols = _columns(name, header, FIELD_COLUMNS)
    rows: list[FieldRow] = []
    for line, row in records:
        _check_width(name, line, row, len(header))

        def v(column: str) -> str:
            return _value(row, cols, column)

        rows.append(
            FieldRow(
                site=_nonempty(name, line, "site", v("site")),
                date=_date(name, line, "date", v("date")),
                device=_nonempty(name, line, "device", v("device")),
                median_error_m=_nonneg_float(name, line, "median_error_m", v("median_error_m")),
                p90_error_m=_nonneg_float(name, line, "p90_error_m", v("p90_error_m")),
                correct_aisle_share=_share(name, line, "correct_aisle_share", v("correct_aisle_share")),
                reroutes_per_tour=_nonneg_float(name, line, "reroutes_per_tour", v("reroutes_per_tour")),
            )
        )
    return rows


def _is_int(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _is_number(value) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def load_criteria(path) -> dict:
    file_path = Path(path)
    name = file_path.name
    try:
        data = json.loads(_read_text(file_path))
    except json.JSONDecodeError as exc:
        raise _err(name, exc.lineno, f"ungültiges JSON ({exc.msg})") from None
    if not isinstance(data, dict):
        raise _err(name, None, "oberste Ebene muss ein JSON-Objekt sein")
    if not _is_int(data.get("version")):
        raise _err(name, None, "„version“ fehlt oder ist keine ganze Zahl")
    metrics = data.get("metrics")
    if not isinstance(metrics, dict):
        raise _err(name, None, "„metrics“ fehlt oder ist kein Objekt")
    for metric_id in metrics:
        if metric_id not in CRITERIA_METRIC_IDS:
            raise _err(name, None, f"unbekannte Metrik-ID „{metric_id}“")
    for metric_id in CRITERIA_METRIC_IDS:
        if metric_id not in metrics:
            raise _err(name, None, f"Metrik „{metric_id}“ fehlt")
        metric = metrics[metric_id]
        if not isinstance(metric, dict):
            raise _err(name, None, f"Metrik „{metric_id}“ ist kein Objekt")
        for key in ("label", "unit", "n_unit"):
            if not isinstance(metric.get(key), str):
                raise _err(name, None, f"Metrik „{metric_id}“: „{key}“ fehlt oder ist kein Text")
        op = metric.get("op")
        if not isinstance(op, str) or op not in CRITERIA_OPS:
            raise _err(name, None, f"Metrik „{metric_id}“: op muss >=, <= oder == sein")
        if not _is_number(metric.get("value")):
            raise _err(name, None, f"Metrik „{metric_id}“: value ist keine Zahl")
        min_n = metric.get("min_n")
        if not _is_int(min_n) or min_n < 1:
            raise _err(name, None, f"Metrik „{metric_id}“: min_n muss eine ganze Zahl >= 1 sein")
    return data
