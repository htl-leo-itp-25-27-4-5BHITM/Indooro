"""Berichte der Pilot-Auswertung: Team-Bericht und Markt-Bericht (Markdown) sowie SVG-Diagramme.

Nur Standardbibliothek. Die Ausgabe ist deterministisch (keine Zeitstempel, kein Zufall),
damit Beispielberichte committet werden können. Dateien werden utf-8 mit LF geschrieben.
"""

from __future__ import annotations

import math
import statistics
import sys
from pathlib import Path
from typing import Iterable, Sequence
from xml.sax.saxutils import escape

sys.path.insert(0, str(Path(__file__).resolve().parent))

from inputs import SURVEY_QUESTIONS, FieldRow, SurveyRow, Task  # noqa: E402
from metrics import (  # noqa: E402
    METRIC_ORDER,
    VERDICT_MET,
    VERDICT_NO_DATA,
    VERDICT_NOT_MET,
    MetricResult,
    pair_tasks,
)

SMALL_SAMPLE_NOTE = "Kleine Stichprobe: rein beschreibend, keine Signifikanzaussage; Kriterien sind vorläufig"

_OP_SYMBOL = {">=": "≥", "<=": "≤", "==": "="}
_CONDITION_LABEL = {"app": "mit App", "ohne_app": "ohne App"}
# Reihenfolge und Farben der Bedingungen in den Diagrammen.
_CONDITION_SLOTS = (("app", "mit App", "#2b6cb0"), ("ohne_app", "ohne App", "#a0aec0"))
_SVG_NS = "http://www.w3.org/2000/svg"
_SVG_FONT = "Arial, Helvetica, sans-serif"
_STORE_VERDICT = {
    VERDICT_MET: "Ziel erreicht.",
    VERDICT_NOT_MET: "Ziel noch nicht erreicht.",
    VERDICT_NO_DATA: "Noch zu wenig Daten für eine Aussage.",
}
_STORE_TITLES = {
    "task_success": "Suchaufgaben ohne Hilfe",
    "faster_share": "Schneller mit der App",
    "manual_corrections_median": "Korrekturen von Hand",
    "unjustified_stop_changes": "Zielwechsel ohne Grund",
    "false_reroutes_per_tour": "Unnötige Routenänderungen",
    "abort_rate": "Abgebrochene Aufgaben",
    "reuse_share": "Wiedernutzung",
    "staff_hours": "Aufwand für das Marktpersonal",
    "incident_rate": "Technische Störungen",
    "field_reroutes": "Testlauf vor Ort",
}


# --- Formatierung -----------------------------------------------------------

def _num(value: float, decimals: int = 2) -> str:
    """Deutsche Zahlendarstellung ohne unnötige Nachkommastellen."""
    text = f"{value:.{decimals}f}"
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text.replace(".", ",")


def _percent(share: float, decimals: int = 1) -> str:
    return f"{_num(share * 100, decimals)} %"


def _date_de(value) -> str:
    return value.strftime("%d.%m.%Y")


def _period(tasks: Sequence[Task]) -> str:
    if not tasks:
        return "–"
    first = min(t.started_at for t in tasks)
    last = max(t.started_at for t in tasks)
    if first.date() == last.date():
        return _date_de(first)
    return f"{_date_de(first)} bis {_date_de(last)}"


def _threshold_text(result: MetricResult) -> str:
    if result.unit == "Anteil":
        return _percent(result.threshold, 0)
    if result.unit == "Anzahl":
        return _num(result.threshold, 0)
    return f"{_num(result.threshold)} {result.unit}"


def format_criterion(result: MetricResult) -> str:
    """Kriterium wie „≥ 90 %“ oder „≤ 2 Korrekturen pro Tour“."""
    return f"{_OP_SYMBOL[result.op]} {_threshold_text(result)}"


def format_value(result: MetricResult) -> str:
    """Wert einer Kennzahl: Anteile als Prozent, sonst Zahl mit Einheit; „–“ ohne Wert."""
    if result.value is None:
        return "–"
    if result.unit == "Anteil":
        return _percent(result.value)
    if result.unit == "Anzahl":
        return _num(result.value, 0)
    return f"{_num(result.value)} {result.unit}"


def _seconds(value) -> str:
    return "–" if value is None else f"{_num(value, 1)} s"


def _section(title: str, body: Iterable[str]) -> list[str]:
    return [f"## {title}", "", *body, ""]


# --- Team-Bericht -----------------------------------------------------------

def _kennzahlen_table(results: Sequence[MetricResult]) -> tuple[list[str], list[str]]:
    rows = [
        "| Kennzahl | Wert | Kriterium | n | Urteil |",
        "|---|---|---|---|---|",
    ]
    notes: list[str] = []
    for result in results:
        mark = ""
        if result.note:
            notes.append(result.note)
            mark = f" [{len(notes)}]"
        rows.append(
            f"| {result.label} | {format_value(result)} | {format_criterion(result)} "
            f"| {result.n} {result.n_unit} | {result.verdict}{mark} |"
        )
    footnotes: list[str] = []
    for index, note in enumerate(notes, start=1):
        footnotes += [f"[{index}] {note}", ""]
    return rows, footnotes


def _time_section(results: dict[str, MetricResult]) -> list[str]:
    faster = results["faster_share"]
    d = faster.details
    body = [
        f"- Median mit App: {_seconds(d['median_app_s'])}",
        f"- Median ohne App: {_seconds(d['median_without_s'])}",
        f"- Median der Differenz (ohne minus mit App): {_seconds(d['median_diff_s'])}"
        " (positiv: mit App schneller)",
        f"- Gewinner/Verlierer: mit App schneller {d['wins']}, ohne App schneller {d['losses']},"
        f" gleich {d['ties']}",
        f"- p-Wert Vorzeichentest (zweiseitig): {_num(d['p_sign'], 3)}",
        f"- Paare ausgeschlossen (nicht beide gefunden): {d['pairs_excluded']} von {d['pairs_total']}",
    ]
    if faster.n < faster.min_n:
        body += ["", f"**n < {faster.min_n}: nur beschreibend**"]
    return _section("Zeitvergleich mit und ohne App", body)


def _success_section(tasks: Sequence[Task]) -> list[str]:
    body = [
        "| Bedingung | Aufgaben | gefunden | mit Hilfe | abgebrochen | Anteil gefunden |",
        "|---|---|---|---|---|---|",
    ]
    for condition in ("app", "ohne_app"):
        group = [t for t in tasks if t.condition == condition]
        counts = {
            outcome: sum(1 for t in group if t.outcome == outcome)
            for outcome in ("gefunden", "hilfe", "abgebrochen")
        }
        share = _percent(counts["gefunden"] / len(group)) if group else "–"
        body.append(
            f"| {_CONDITION_LABEL[condition]} | {len(group)} | {counts['gefunden']} "
            f"| {counts['hilfe']} | {counts['abgebrochen']} | {share} |"
        )
    return _section("Erfolg je Bedingung", body)


def _survey_section(survey: Sequence[SurveyRow]) -> list[str]:
    if not survey:
        return _section("Fragebogen", ["Kein Fragebogen vorhanden."])
    body = ["| Frage | Mittelwert | n |", "|---|---|---|"]
    for index, (question_id, text) in enumerate(SURVEY_QUESTIONS):
        mean = sum(row.answers[index] for row in survey) / len(survey)
        body.append(f"| {question_id}: {text} | {_num(mean, 1)} | {len(survey)} |")
    return _section("Fragebogen", body)


def _field_section(field: Sequence[FieldRow]) -> list[str]:
    if not field:
        return _section("Feldwerte", ["Keine Feldwerte vorhanden."])
    body = [
        "| Standort | Datum | Gerät | Median-Fehler (m) | P90-Fehler (m) | Richtiger Gang | Reroutes pro Tour |",
        "|---|---|---|---|---|---|---|",
    ]
    for row in field:
        body.append(
            f"| {row.site} | {_date_de(row.date)} | {row.device} | {_num(row.median_error_m, 1)} "
            f"| {_num(row.p90_error_m, 1)} | {_percent(row.correct_aisle_share, 0)} "
            f"| {_num(row.reroutes_per_tour, 1)} |"
        )
    return _section("Feldwerte", body)


def _limits_section(criteria: dict) -> list[str]:
    body = [
        "1. Kleine Stichprobe: Die Werte beschreiben die Testgruppe und erlauben keine Aussage über den ganzen Markt.",
        f"2. Die Kriterien sind vorläufig (Version {criteria['version']}) und können nach der ersten Sitzung angepasst werden.",
        "3. Die Aufgaben sind Testaufgaben; sie bilden den Alltag im Markt nur eingeschränkt ab.",
    ]
    return _section("Grenzen", body)


def render_team_report(
    results: Iterable[MetricResult],
    tasks: Iterable[Task],
    survey: Iterable[SurveyRow],
    field: Iterable[FieldRow],
    criteria: dict,
    charts: dict[str, str],
) -> str:
    """Team-Bericht als Markdown. charts: Anzeigename -> relativer Pfad zum SVG."""
    results = list(results)
    tasks = list(tasks)
    survey = list(survey)
    field = list(field)
    by_id = {result.id: result for result in results}
    pairs = pair_tasks(tasks)

    lines = [
        "# Pilot-Auswertung (Team)",
        "",
        f"Kriterien-Version {criteria['version']} · Quelle: {criteria['source']}",
        "",
        f"> **{SMALL_SAMPLE_NOTE}.**",
        "",
    ]
    lines += _section("Datenbasis", [
        f"- Testpersonen (mit Aufgaben): {len({t.test_id for t in tasks})}",
        f"- Aufgaben mit App: {sum(1 for t in tasks if t.condition == 'app')},"
        f" ohne App: {sum(1 for t in tasks if t.condition == 'ohne_app')}",
        f"- Gepaarte Aufgaben (mit und ohne App): {len(pairs)}",
        f"- Zeitraum der Aufgaben: {_period(tasks)}",
        f"- Fragebogen: {len(survey)} Antworten" if survey else "- Fragebogen: fehlt",
        f"- Feldwerte: {len(field)} Zeilen" if field else "- Feldwerte: fehlen",
    ])

    table, footnotes = _kennzahlen_table(results)
    lines += _section("Kennzahlen", [*table, "", *footnotes])
    lines += _time_section(by_id)
    lines += _success_section(tasks)
    lines += _survey_section(survey)
    lines += _field_section(field)
    if charts:
        lines += _section("Diagramme", [f"![{name}]({path})\n" for name, path in charts.items()])
    lines += _limits_section(criteria)
    return "\n".join(lines).rstrip() + "\n"


# --- Markt-Bericht ----------------------------------------------------------

def _store_sentence(result: MetricResult) -> str:
    """Ein Satz je Kennzahl in Alltagssprache, ohne technische Kennungen."""
    d = result.details
    if result.id == "task_success":
        if result.value is None:
            return "Noch keine Suchaufgaben mit der App erfasst."
        found = d["ergebnisse"]["app"]["gefunden"]
        return f"{found} von {result.n} Suchaufgaben mit der App ohne Hilfe gelöst ({_percent(result.value, 0)})."
    if result.id == "faster_share":
        if result.value is None:
            return "Noch keine vollständigen Vergleiche erfasst."
        return (
            f"Mit der App waren Kundinnen und Kunden bei {d['wins']} von {result.n} "
            f"Vergleichen schneller ({_percent(result.value, 0)})."
        )
    if result.id == "manual_corrections_median":
        if result.value is None:
            return "Noch keine Angaben zu Korrekturen von Hand."
        return f"Im typischen Rundgang musste die Position {_num(result.value, 1)} Mal von Hand korrigiert werden."
    if result.id == "unjustified_stop_changes":
        if result.value is None:
            return "Noch keine Angaben zu Zielwechseln."
        if result.value == 0:
            return "Das Ziel wechselte nie ohne erkennbaren Grund."
        return f"Das Ziel wechselte {_num(result.value, 0)} Mal ohne erkennbaren Grund."
    if result.id == "false_reroutes_per_tour":
        if result.value is None:
            return "Noch keine Angaben zu Routenänderungen."
        return f"Im Schnitt gab es {_num(result.value, 1)} unnötige Routenänderungen pro Rundgang."
    if result.id == "abort_rate":
        if result.value is None:
            return "Noch keine Aufgaben mit der App erfasst."
        return f"{_percent(result.value, 0)} der Aufgaben wurden abgebrochen."
    if result.id == "reuse_share":
        if result.value is None:
            return "Noch keine Befragung vorhanden."
        return (
            f"{_percent(result.value, 0)} würden die App wieder nutzen "
            f"({d['wieder_nutzen']} von {result.n} Befragten)."
        )
    if result.id == "staff_hours":
        if result.value is None:
            return "Noch nicht erfasst."
        return f"{_num(result.value, 1)} Stunden insgesamt."
    if result.id == "incident_rate":
        if result.value is None:
            return "Noch keine Angaben."
        return f"{d['incidents']} Mal (etwa Absturz oder Hänger) bei {result.n} Rundgängen."
    if result.id == "field_reroutes":
        if result.value is None:
            return "Noch keine Messung vor Ort erfasst."
        return (
            f"Bis zu {_num(result.value, 1)} Routenänderungen pro Rundgang, "
            "obwohl der Weg stimmte."
        )
    raise ValueError(f"unbekannte Kennzahl „{result.id}“")


def render_store_report(
    results: Iterable[MetricResult],
    tasks: Iterable[Task],
    survey: Iterable[SurveyRow],
    criteria: dict,
) -> str:
    """Markt-Bericht für Betreiber: einfache Sprache, höchstens zwei Seiten, ohne Kennungen.

    criteria wird nicht benötigt (die Grenzwerte stehen in results); der Parameter
    gehört zur einheitlichen Signatur mit dem Team-Bericht.
    """
    del criteria
    results = list(results)
    tasks = list(tasks)
    survey = list(survey)
    by_id = {result.id: result for result in results}
    ordered = [by_id[metric_id] for metric_id in METRIC_ORDER]
    testers = len({t.test_id for t in tasks})

    lines = [
        "# Pilot im Markt: Ergebnisse in Kürze",
        "",
        f"Zeitraum: {_period(tasks)}",
        "",
        f"Testpersonen: {testers}, davon {len(survey)} mit Fragebogen",
        "",
        "## Die Ergebnisse",
        "",
    ]
    for result in ordered:
        verdict = _STORE_VERDICT[result.verdict]
        lines.append(f"- **{_STORE_TITLES[result.id]}:** {_store_sentence(result)} {verdict}")
    lines.append("")

    goals = [result for result in ordered if result.id != "field_reroutes"]
    reached = sum(1 for result in goals if result.verdict == VERDICT_MET)
    lines += [
        "> **Was wir daraus lernen**",
        ">",
        f"> {reached} von {len(goals)} Zielen erreicht, {len(goals) - reached} noch offen.",
        "",
        "## Hinweis",
        "",
        "Die Zahl der Testpersonen ist klein. Die Ergebnisse geben einen ersten Eindruck, "
        "aber keine gesicherte Aussage.",
        "",
        "Vielen Dank an alle, die mitgemacht haben.",
        "",
        "Rückfragen an das Projektteam.",
    ]
    return "\n".join(lines).rstrip() + "\n"


# --- SVG-Diagramme ----------------------------------------------------------

def _svg(width: int, height: int, title: str, body: Sequence[str]) -> str:
    lines = [
        f'<svg xmlns="{_SVG_NS}" viewBox="0 0 {width} {height}" width="{width}" height="{height}"'
        f' font-family="{_SVG_FONT}">',
        f"  <title>{escape(title)}</title>",
    ]
    lines += [f"  {line}" for line in body]
    lines += ["</svg>", ""]
    return "\n".join(lines)


def _text(x: float, y: float, content: str, anchor: str = "middle", size: int = 13) -> str:
    return (
        f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" text-anchor="{anchor}" fill="#222">'
        f"{escape(content)}</text>"
    )


def svg_success(tasks: Iterable[Task]) -> str:
    """Balkendiagramm: Anteil der Aufgaben, die ohne Hilfe gefunden wurden, je Bedingung."""
    tasks = list(tasks)
    width, height = 480, 320
    left, right, top, bottom = 60, 460, 50, 260
    body: list[str] = []
    for pct in (0, 50, 100):
        y = bottom - (bottom - top) * pct / 100
        body.append(f'<line x1="{left}" y1="{y:.1f}" x2="{right}" y2="{y:.1f}" stroke="#d9d9d9"/>')
        body.append(_text(left - 8, y + 4, f"{pct} %", anchor="end", size=12))
    body.append(f'<line x1="{left}" y1="{bottom}" x2="{right}" y2="{bottom}" stroke="#444"/>')
    slot_width = (right - left) / len(_CONDITION_SLOTS)
    for index, (condition, label, color) in enumerate(_CONDITION_SLOTS):
        center = left + slot_width * (index + 0.5)
        group = [t for t in tasks if t.condition == condition]
        found = sum(1 for t in group if t.outcome == "gefunden")
        if group:
            share = found / len(group)
            bar_top = bottom - (bottom - top) * share
            body.append(
                f'<rect x="{center - 55:.1f}" y="{bar_top:.1f}" width="110" '
                f'height="{bottom - bar_top:.1f}" fill="{color}"/>'
            )
            body.append(_text(center, bar_top - 8, f"{_percent(share, 0)} ({found} von {len(group)})"))
        else:
            body.append(_text(center, (top + bottom) / 2, "keine Daten"))
        body.append(_text(center, bottom + 22, label))
    body.append(_text(width / 2, 22, "Aufgaben ohne Hilfe gefunden (Anteil)", size=14))
    return _svg(width, height, "Anteil gefundener Aufgaben je Bedingung", body)


def _five_numbers(values: list[float]) -> tuple[float, float, float, float, float]:
    """Minimum, Q1, Median, Q3, Maximum einer sortierten Liste."""
    if len(values) == 1:
        only = values[0]
        return only, only, only, only, only
    q1, _, q3 = statistics.quantiles(values, n=4, method="inclusive")
    return values[0], q1, statistics.median(values), q3, values[-1]


def svg_times(tasks: Iterable[Task]) -> str:
    """Box-artige Darstellung der Dauer gefundener Aufgaben je Bedingung (Sekunden)."""
    tasks = list(tasks)
    width, height = 480, 350
    left, right, top, bottom = 60, 460, 50, 270
    series = [
        (
            label,
            color,
            sorted(t.duration_s for t in tasks if t.condition == condition and t.outcome == "gefunden"),
        )
        for condition, label, color in _CONDITION_SLOTS
    ]
    all_values = [value for _, _, values in series for value in values]
    if not all_values:
        return _svg(width, height, "Dauer gefundener Aufgaben", [_text(width / 2, height / 2, "keine Daten", size=16)])

    ymax = max(30, math.ceil(max(all_values) / 30) * 30)

    def y_of(seconds: float) -> float:
        return bottom - (bottom - top) * seconds / ymax

    body: list[str] = []
    for seconds in (0, ymax / 2, ymax):
        y = y_of(seconds)
        body.append(f'<line x1="{left}" y1="{y:.1f}" x2="{right}" y2="{y:.1f}" stroke="#d9d9d9"/>')
        body.append(_text(left - 8, y + 4, f"{_num(seconds, 0)} s", anchor="end", size=12))
    body.append(f'<line x1="{left}" y1="{bottom}" x2="{right}" y2="{bottom}" stroke="#444"/>')
    slot_width = (right - left) / len(series)
    for index, (label, color, values) in enumerate(series):
        center = left + slot_width * (index + 0.5)
        if values:
            lo, q1, median, q3, hi = _five_numbers(values)
            body.append(f'<line x1="{center:.1f}" y1="{y_of(hi):.1f}" x2="{center:.1f}" y2="{y_of(lo):.1f}" stroke="#444"/>')
            for whisker in (lo, hi):
                body.append(
                    f'<line x1="{center - 15:.1f}" y1="{y_of(whisker):.1f}" '
                    f'x2="{center + 15:.1f}" y2="{y_of(whisker):.1f}" stroke="#444"/>'
                )
            box_top = y_of(q3)
            box_height = max(y_of(q1) - box_top, 1.0)
            body.append(
                f'<rect x="{center - 40:.1f}" y="{box_top:.1f}" width="80" height="{box_height:.1f}"'
                f' fill="{color}" fill-opacity="0.35" stroke="#444"/>'
            )
            body.append(
                f'<line x1="{center - 40:.1f}" y1="{y_of(median):.1f}" x2="{center + 40:.1f}" '
                f'y2="{y_of(median):.1f}" stroke="#222" stroke-width="2"/>'
            )
            body.append(_text(center, bottom + 22, f"{label} (n = {len(values)})"))
            body.append(_text(center, bottom + 40, f"Median {_num(median, 0)} s", size=12))
            body.append(_text(center, bottom + 56, f"Min {_num(lo, 0)} s, Max {_num(hi, 0)} s", size=12))
        else:
            body.append(_text(center, (top + bottom) / 2, "keine Daten"))
            body.append(_text(center, bottom + 22, label))
    body.append(_text(width / 2, 22, "Dauer gefundener Aufgaben (Sekunden)", size=14))
    return _svg(width, height, "Dauer gefundener Aufgaben je Bedingung", body)


# --- Dateien ----------------------------------------------------------------

def _write(path: Path, text: str) -> None:
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)


def write_reports(
    out_dir,
    results: Iterable[MetricResult],
    tasks: Iterable[Task],
    survey: Iterable[SurveyRow],
    field: Iterable[FieldRow],
    criteria: dict,
) -> None:
    """Schreibt report.md, report-markt.md, charts/success.svg und charts/times.svg."""
    out = Path(out_dir)
    charts_dir = out / "charts"
    charts_dir.mkdir(parents=True, exist_ok=True)
    results = list(results)
    tasks = list(tasks)
    survey = list(survey)
    field = list(field)

    _write(charts_dir / "success.svg", svg_success(tasks))
    _write(charts_dir / "times.svg", svg_times(tasks))
    charts = {
        "Erfolg je Bedingung": "charts/success.svg",
        "Dauer gefundener Aufgaben": "charts/times.svg",
    }
    _write(out / "report.md", render_team_report(results, tasks, survey, field, criteria, charts))
    _write(out / "report-markt.md", render_store_report(results, tasks, survey, criteria))
