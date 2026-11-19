#!/usr/bin/env python3
"""Feldtag in einem Befehl auswerten: alle Aufnahmen eines Ordners -> Entscheidung nach POSITIONING_DECISION.md.

Schritte:
  1. Jede Aufnahme anonymisieren und mit `check_recording_anonymized` prüfen. Bei einem Verstoß Abbruch,
     bevor irgendetwas ausgewertet wird. Die Originale bleiben unverändert.
  2. Je Aufnahme `analyze_walk` (Replay-Report) und der Vergleich aktuelle Pipeline gegen PositioningEngine
     (`compare_positioning`, liefert `<name>-comparison.json`).
  3. `positioning_verdict` über alle Bewertungsläufe (Rolle `evaluation`), genau nach der Regel im Dokument.
  4. Übergabeordner für das Positioning Lab (`import_recordings`), abschaltbar mit `--no-lab-import`.
  5. `BERICHT.md` (deutsch) und 6. `KOMMENTAR_195.md` (zum Einfuegen als GitHub-Kommentar in #195).

Es wird nichts eingeschaltet, nichts ans Backend geschrieben. Netzzugriff nur wie bei `compare_positioning`
(`--store`, Layout noch nicht lokal: zwei GET-Aufrufe).

Aufruf (Repo-Wurzel, über den Wrapper):
    scripts/field/evaluate_field_day.sh ORDNER-MIT-AUFNAHMEN [--out DIR] [--no-lab-import]
        [--store SPAR-Leonding-002 | --layout LAYOUT.json] [--offline] [--site testraum] [--markers SITE.md] [--date JJJJ-MM-TT]

Exit: 0 Bericht geschrieben (egal welches Ergebnis, auch SCHLECHTER), 1 Fehler (Anonymisierung, ein Werkzeug
ist fehlgeschlagen; der Bericht wird, soweit möglich, trotzdem geschrieben), 2 Aufruf- oder Eingabefehler.
Braucht für echte Auswertungen macOS mit Swift (`swift test`, `swift run`); ohne `swift` Abbruch mit Exit 2.
"""

from __future__ import annotations

import argparse
import datetime
import json
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parent))

import analyze_walk as aw  # noqa: E402
import compare_positioning as cp  # noqa: E402
import fetch_layout  # noqa: E402
import field_stats  # noqa: E402
import positioning_verdict as pv  # noqa: E402
import walk_report  # noqa: E402
from check_recording_anonymized import check_lines, split_lines  # noqa: E402

REPO_ROOT = aw.REPO_ROOT
LAB_DIR = REPO_ROOT / "tools" / "beacon-lab"
DEFAULT_STORE = "SPAR-Leonding-002"
REHEARSAL_PREFIX = "rehearsal-"
POSITIONING_DECISION = "docs/pilot-readiness/hardware/POSITIONING_DECISION.md"

# Beide Orte der Swift-Test-Ressourcen (vor und nach PR #218); genutzt für die Swift-Vorprüfung.
SWIFT_PACKAGE_CANDIDATES = (
    aw.SWIFT_DIR,
    aw.SWIFT_DIR / "Packages" / "IndooroKit",
)
TEST_RESOURCE_CANDIDATES = (
    aw.SWIFT_DIR / "Tests" / "IndooroNavigationCoreTests" / "Resources",
    aw.SWIFT_DIR / "Packages" / "IndooroKit" / "Tests" / "IndooroNavigationTests" / "Resources",
)


class FieldDayError(Exception):
    def __init__(self, message: str, code: int = 1) -> None:
        super().__init__(message)
        self.code = code


def existing_test_resources() -> Optional[Path]:
    """Der Ressourcenordner, der in diesem Checkout existiert (altes oder neues Layout), sonst None."""
    return next((path for path in TEST_RESOURCE_CANDIDATES if path.is_dir()), None)


def swift_available() -> Tuple[bool, str]:
    if shutil.which("swift") is None:
        return False, "`swift` nicht gefunden. Die Auswertung braucht macOS mit Xcode-Kommandozeilenwerkzeugen."
    if not any((path / "Package.swift").is_file() for path in SWIFT_PACKAGE_CANDIDATES):
        return False, "Kein Swift-Paket (Package.swift) im Repository gefunden."
    return True, ""


# ---------------------------------------------------------------------------------------------------------------------
# Hook für den Schattenbetrieb (Paket B)

ShadowHook = Callable[[Path, Path, Path, str], Optional[Path]]


def shadow_comparison(recording: Path, anonymized: Path, out_dir: Path, name: str) -> Optional[Path]:
    """Schattenbetrieb: Hat die Aufnahme `shadow`-Zeilen (alte und neue Position je Epoche im selben Lauf),
    wertet `compare_positioning.write_shadow_comparison` sie direkt aus und gibt den Pfad der
    `<name>-comparison.json` zurueck (Schema `indooro-position-comparison/1`, `origin: "shadow"`).
    Ohne `shadow`-Zeilen gibt sie None zurueck, dann nimmt der Auswerter den Replay. Alles danach (Regel,
    Bericht, Kommentar) bleibt unveraendert; der Bericht nennt als Quelle dann "Schattenbetrieb".

    recording: Original, anonymized: geprueft anonymisierte Kopie (wird gelesen), out_dir: Arbeitsordner, name: sicherer Name.
    """
    return cp.write_shadow_comparison(anonymized, out_dir, name)


# ---------------------------------------------------------------------------------------------------------------------
# Datenmodell

@dataclass
class Run:
    path: Path
    name: str  # sicherer Name (wie in den Werkzeugen)
    anonymized: Path
    role: Optional[str] = None
    scenario: Optional[str] = None
    device: Optional[str] = None
    layout_beacons_silent: List[str] = field(default_factory=list)
    report_path: Optional[Path] = None
    comparison_path: Optional[Path] = None
    comparison: Optional[Dict[str, object]] = None
    source: str = "Replay"  # Replay | Schattenbetrieb
    errors: List[str] = field(default_factory=list)  # Werkzeugfehler (fuehren zu Exit 1)
    excluded: Optional[str] = None  # Grund, warum der Lauf nicht zählt
    counted: bool = False

    @property
    def rehearsal(self) -> bool:
        return self.path.name.startswith(REHEARSAL_PREFIX)

    @property
    def synthetic(self) -> bool:
        return self.path.name.startswith(aw.SYNTHETIC_PREFIX)


@dataclass
class DayResult:
    runs: List[Run]
    evaluation: pv.Evaluation
    verdict_text: str
    out_dir: Path
    date: str
    store: str
    layout: Path
    lab_note: str
    warnings: List[str]

    @property
    def probe(self) -> bool:
        return any(run.rehearsal or run.synthetic for run in self.runs)


# ---------------------------------------------------------------------------------------------------------------------
# Schritt 1: Anonymisieren und prüfen

def list_recordings(directory: Path) -> List[Path]:
    if not directory.is_dir():
        raise FieldDayError(f"Ordner nicht gefunden: {directory}", 2)
    files = sorted((p for p in directory.iterdir() if p.is_file() and p.suffix == ".jsonl"), key=lambda p: p.name)
    if not files:
        raise FieldDayError(f"Keine *.jsonl-Aufnahmen in {directory}", 2)
    return files


def safe_name(path: Path) -> str:
    return aw.SAFE_NAME_RE.sub("-", path.stem).strip("-") or "aufnahme"


def anonymize_and_verify(recordings: Sequence[Path], anon_dir: Path) -> List[Run]:
    """Alle Aufnahmen anonymisieren und danach die geschriebene Datei noch einmal prüfen. Ein Verstoß bricht ab."""
    anon_dir.mkdir(parents=True, exist_ok=True)
    runs: List[Run] = []
    names: Dict[str, Path] = {}
    failures: List[str] = []
    for path in recordings:
        name = safe_name(path)
        if name in names:
            raise FieldDayError(f"Zwei Aufnahmen ergeben denselben Namen '{name}': {names[name].name} und {path.name}", 2)
        names[name] = path
        target = anon_dir / f"{name}.jsonl"
        try:
            aw.anonymize_to(path, target)
            violations = check_lines(split_lines(target.read_text(encoding="utf-8")))
        except aw.AnalysisError as error:
            failures.append(f"{path.name}: {error}")
            continue
        if violations:
            failures.append(f"{path.name}: " + "; ".join(f"Zeile {v.line}: {v.reason}" for v in violations[:5]))
            target.unlink()
            continue
        runs.append(Run(path=path, name=name, anonymized=target))
    if failures:
        raise FieldDayError(
            "Anonymisierungsprüfung fehlgeschlagen, es wird nichts ausgewertet:\n  " + "\n  ".join(failures)
        )
    return runs


def read_session(run: Run) -> List[Dict[str, object]]:
    records = walk_report.parse_recording(run.anonymized.read_text(encoding="utf-8"))
    for record in records:
        if record.get("type") == "session":
            run.role = record.get("role") if isinstance(record.get("role"), str) else None
            run.scenario = record.get("scenario") if isinstance(record.get("scenario"), str) else None
            run.device = record.get("deviceModel") if isinstance(record.get("deviceModel"), str) else None
            break
    return records


# ---------------------------------------------------------------------------------------------------------------------
# Schritt 2: Report und Vergleich je Aufnahme

def process_run(
    run: Run,
    *,
    layout: Path,
    site: str,
    markers: Optional[Path],
    out_dir: Path,
    replay_runner: aw.ReplayRunner,
    compare_runner: cp.CompareRunner,
    shadow: ShadowHook,
) -> None:
    work = out_dir / "work"
    reports = out_dir / "reports"
    work.mkdir(parents=True, exist_ok=True)
    reports.mkdir(parents=True, exist_ok=True)
    records = read_session(run)

    layout_data = aw.load_layout(layout)
    summary = walk_report.summarize_recording(records)
    run.layout_beacons_silent = sorted(set(walk_report.layout_beacons(layout_data)) - set(summary.beacons))

    # Report (Replay durch die App-Pipeline)
    try:
        report_path, _ = aw.analyze(
            run.anonymized, site=site, layout=layout, markers=markers, out=reports / f"{run.name}-report.md",
            work_dir=work, min_window=field_stats.DEFAULT_MIN_WINDOW_S, position_source="est",
            runner=replay_runner, command=f"scripts/field/evaluate_field_day.sh ({run.path.name})",
        )
        run.report_path = report_path
    except aw.AnalysisError as error:
        run.errors.append(f"Report (analyze_walk) fehlgeschlagen: {error}")

    # Vergleich: erst der Schattenbetrieb (Hook), sonst Replay
    expected = work / f"{run.name}-comparison.json"
    if expected.exists():
        expected.unlink()  # keine Altlasten aus frueheren Läufen
    try:
        shadow_path = shadow(run.path, run.anonymized, work, run.name)
    except Exception as error:  # Hook von Paket B darf die Auswertung nicht kippen
        shadow_path = None
        run.errors.append(f"Schatten-Hook fehlgeschlagen: {error}")
    if shadow_path is not None:
        run.source = "Schattenbetrieb"
        run.comparison_path = shadow_path
    else:
        try:
            code = cp.compare(
                run.anonymized, store=None, layout=layout, site=site, work_dir=work,
                runner=compare_runner, fetcher=fetch_layout.main,
            )
        except aw.AnalysisError as error:
            run.errors.append(f"Vergleich (compare_positioning) fehlgeschlagen: {error}")
            return
        if code != 0:
            run.excluded = "keine Epoche mit Referenz (keine Wahrheitsmarken)" if code == cp.NO_TRUTH_EXIT else None
            if code != cp.NO_TRUTH_EXIT:
                run.errors.append(f"Vergleich lieferte Exit {code}")
            return
        run.comparison_path = expected
    if run.comparison_path is None or not run.comparison_path.is_file():
        run.errors.append(f"Vergleichsdatei fehlt: {run.comparison_path or expected}")
        run.comparison_path = None
        return
    try:
        data = json.loads(run.comparison_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        run.errors.append(f"Vergleichsdatei nicht lesbar: {error}")
        return
    run.comparison = data if isinstance(data, dict) else None


# ---------------------------------------------------------------------------------------------------------------------
# Schritt 3: Regel

def apply_rule(runs: Sequence[Run]) -> pv.Evaluation:
    """Alle Läufe mit Vergleichsdatei durch die Regel. Zusaetzliche Ausschlüsse aus Abschnitt 3 (Punkt 5)."""
    candidates: List[Run] = []
    for run in runs:
        if run.comparison_path is None or run.comparison is None:
            run.excluded = run.excluded or ("Werkzeugfehler, siehe unten" if run.errors else "kein Vergleich")
            continue
        if run.report_path is None:
            run.excluded = "Report (analyze_walk) lief nicht durch (Mindestdaten, Abschnitt 3 Punkt 5)"
            continue
        if run.layout_beacons_silent:
            run.excluded = "Beacons des Layouts nie gehört: " + ", ".join(run.layout_beacons_silent) + " (Mindestdaten, Abschnitt 3 Punkt 5)"
            continue
        candidates.append(run)
    try:
        # Probeaufnahmen (rehearsal-*) zählen hier mit; der Bericht trägt dann den Kasten PROBELAUF.
        evaluation = pv.evaluate([run.comparison_path for run in candidates], allow_rehearsal=True)  # type: ignore[misc]
    except pv.InputError as error:
        raise FieldDayError(f"Vergleichsdatei ungültig: {error}")
    counted = {run.path: run for run in evaluation.accepted}
    for run in candidates:
        assert run.comparison_path is not None
        if run.comparison_path in counted:
            run.counted = True
        else:
            run.excluded = (evaluation.rejected_by_path or {}).get(run.comparison_path, "unbekannt")
    return evaluation


# ---------------------------------------------------------------------------------------------------------------------
# Schritt 4: Lab-Übergabe

def lab_import(runs: Sequence[Run], out_dir: Path, site: str, date: str, enabled: bool) -> str:
    """Anonymisierte Aufnahmen und Vergleichsdateien in einen Ordner legen, den man im Positioning Lab laedt."""
    if not enabled:
        return "Übersprungen (--no-lab-import)."
    if not LAB_DIR.is_dir():
        return f"Übersprungen: {LAB_DIR} nicht vorhanden."
    try:
        import import_recordings  # noqa: PLC0415
    except ImportError as error:
        return f"Übersprungen: import_recordings nicht ladbar ({error})."
    target = out_dir / "lab-import"
    incoming = out_dir / "anonymized"
    # Probe- und synthetische Aufnahmen behalten ihre Kennzeichnung im Dateinamen (rehearsal-/synthetic-), damit sie im
    # Lab nie wie echte Feldaufnahmen aussehen. import_recordings benennt nach `<site>-<date>-<n>`; die Kennung kommt in `site`.
    marker = next((p for p in (REHEARSAL_PREFIX, aw.SYNTHETIC_PREFIX) if any(r.path.name.startswith(p) for r in runs)), "")
    try:
        results = import_recordings.run(incoming, target / "recordings", f"{marker}{site}", date, move=False, dry_run=False)
        (target / "comparisons").mkdir(parents=True, exist_ok=True)
        copied = 0
        for run in runs:
            if run.comparison_path is not None and run.comparison_path.is_file():
                shutil.copy2(run.comparison_path, target / "comparisons" / run.comparison_path.name)
                copied += 1
    except (OSError, ValueError) as error:
        return f"Fehlgeschlagen (nur Hinweis, Auswertung gilt): {error}"
    rejected = [r.source.name for r in results if not r.accepted]
    note = (
        f"{sum(1 for r in results if r.accepted)} Aufnahme(n) und {copied} Vergleichsdatei(en) in "
        f"`{target.relative_to(out_dir)}/` (im Lab: Aufnahmen über den Import laden, Vergleiche über „Positionsvergleich“)."
    )
    return note + (f" Nicht übernommen: {', '.join(rejected)}." if rejected else "")


# ---------------------------------------------------------------------------------------------------------------------
# Berichte

def de(value: float, digits: int = 2, sign: bool = False) -> str:
    text = f"{value:+.{digits}f}" if sign else f"{value:.{digits}f}"
    return text.replace(".", ",")


def pct(value: float, digits: int = 1, sign: bool = False) -> str:
    return de(value * 100, digits, sign)


def figure(run: Run, method: str, key: str) -> Optional[float]:
    summary = run.comparison.get("summary") if run.comparison else None
    block = summary.get(method) if isinstance(summary, dict) else None
    value = block.get(key) if isinstance(block, dict) else None
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def cell(run: Run, key: str, rate: bool = False) -> str:
    current, engine = figure(run, "current", key), figure(run, "engine", key)
    if current is None or engine is None:
        return "–"
    fmt = (lambda v: pct(v)) if rate else (lambda v: de(v))
    return f"{fmt(current)} / {fmt(engine)}"


def delta_cell(run: Run, key: str, rate: bool = False) -> str:
    current, engine = figure(run, "current", key), figure(run, "engine", key)
    if current is None or engine is None:
        return "–"
    return pct(engine - current, 1, True) if rate else de(engine - current, 2, True)


VERDICT_TEXT = {
    "BESSER": (
        "Die neue Positionsberechnung war in diesem Test messbar genauer und nicht instabiler. Das Team darf in einem "
        "eigenen Change vorschlagen, sie hinter ihrem Flag einzuschalten. Vorher muss die Funkschicht im Feld geprüft werden "
        "(Schattenbetrieb), und ein BESSER ist laut Dokument erklärungsbedürftig (Abschnitt 5: beide Wege nutzen dieselbe Pipeline)."
    ),
    "GLEICHWERTIG": (
        "Kein Genauigkeitsgewinn belegt. Das Flag bleibt aus. Ein Einschalten wäre eine Architekturentscheidung "
        "und braucht eine eigene Begründung, nicht diese Regel."
    ),
    "SCHLECHTER": "Die neue Positionsberechnung war in diesem Test bei mindestens einer Kennzahl schlechter. Das Flag bleibt aus, die Ursache wird untersucht.",
    "GEMISCHT": "Die Regel ist nicht erfüllt (zum Beispiel nur eine Kennzahl besser oder besser und schlechter zugleich). Das Flag bleibt aus.",
    "EXPLORATIV": "Zu wenige Bewertungsläufe für eine Entscheidung: noch nicht entscheiden. Das Flag bleibt aus, weitere Läufe aufnehmen.",
}
VERDICT_SHORT = {
    "BESSER": "BESSER – Vorschlag zum Einschalten möglich (eigener Change)",
    "GLEICHWERTIG": "GLEICHWERTIG – Flag bleibt aus",
    "SCHLECHTER": "SCHLECHTER – Flag bleibt aus, Ursache untersuchen",
    "GEMISCHT": "GEMISCHT – Flag bleibt aus",
    "EXPLORATIV": "EXPLORATIV – noch nicht entscheiden, Flag bleibt aus",
}
PROBE_LINE = "PROBELAUF / SYNTHETISCH – keine Messung. Diese Zahlen nie zitieren und nicht für die Entscheidung verwenden."
PROBE_BANNER = (
    "> **PROBELAUF / SYNTHETISCH – keine Messung.** Diese Aufnahmen sind erzeugt (`rehearsal-*` oder `synthetic-*`). "
    "Das Ergebnis zeigt nur, dass die Werkzeugkette läuft. Diese Zahlen nie zitieren und nicht für die Entscheidung verwenden."
)


def runs_table(runs: Sequence[Run]) -> List[str]:
    lines = [
        "| Lauf | Rolle / Szenario | Gerät | Epochen mit Referenz | Median (m) aktuell / Engine | P90 (m) aktuell / Engine "
        "| Ausfall (%) aktuell / Engine | Sprung (%) aktuell / Engine | Status |",
        "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    for run in runs:
        epochs = figure(run, "engine", "epochsWithTruth")
        status = "gezählt" if run.counted else f"nicht gezählt: {run.excluded or 'unbekannt'}"
        lines.append(
            f"| `{run.path.name}` | {run.role or 'ohne session'} / {run.scenario or '–'} | {run.device or '–'} "
            f"| {int(epochs) if epochs is not None else '–'} | {cell(run, 'median')} | {cell(run, 'p90')} "
            f"| {cell(run, 'outageRate', True)} | {cell(run, 'jumpRate', True)} | {status} |"
        )
    return lines


def delta_table(result: DayResult) -> List[str]:
    counted = [run for run in result.runs if run.counted]
    lines = [
        "| Lauf | Δ Median (m) | Δ P90 (m) | Δ Ausfallrate (Prozentpunkte) | Δ Sprungrate (Prozentpunkte) |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for run in counted:
        lines.append(
            f"| `{run.path.name}` | {delta_cell(run, 'median')} | {delta_cell(run, 'p90')} "
            f"| {delta_cell(run, 'outageRate', True)} | {delta_cell(run, 'jumpRate', True)} |"
        )
    if counted:
        mean = result.evaluation.mean
        lines.append(
            f"| **Mittel über die Läufe** | **{de(mean['median'], 2, True)}** | **{de(mean['p90'], 2, True)}** "
            f"| **{pct(mean['outageRate'], 1, True)}** | **{pct(mean['jumpRate'], 1, True)}** |"
        )
    else:
        lines.append("| (kein Lauf gezählt) | – | – | – | – |")
    return lines


def criteria_lines(result: DayResult) -> List[str]:
    evaluation = result.evaluation
    if not evaluation.accepted:
        return ["- Kein Bewertungslauf gezählt, deshalb ist keine Bedingung erfüllt."]
    out = []
    for criterion in pv.criteria(evaluation.accepted, evaluation.mean):
        out.append(f"- Bedingung {criterion.number}: **{'erfüllt' if criterion.passed else 'NICHT erfüllt'}**. {criterion.text}")
    return out


def conspicuous_lines(result: DayResult) -> List[str]:
    """Läufe, in denen die Engine um die Toleranz oder mehr schlechter ist (Abschnitt 4: das blockiert BESSER)."""
    figures = (
        ("median", "Median", pv.EPSILON_ERROR_M, False), ("p90", "P90", pv.EPSILON_ERROR_M, False),
        ("outageRate", "Ausfallrate", pv.DELTA_RATE, True), ("jumpRate", "Sprungrate", pv.DELTA_RATE, True),
    )
    notes = []
    for run in result.runs:
        if not run.counted:
            continue
        worse = []
        for key, label, tolerance, rate in figures:
            current, engine = figure(run, "current", key), figure(run, "engine", key)
            if current is None or engine is None:
                continue
            difference = round(engine - current, pv.ROUND_DIGITS)
            if (difference >= tolerance) if not rate else (difference > tolerance):
                worse.append(f"{label} {delta_cell(run, key, rate)}{' Prozentpunkte' if rate else ' m'}")
        if worse:
            notes.append(f"- `{run.path.name}`: Engine klar schlechter bei " + ", ".join(worse) + ".")
    return notes


def excluded_lines(result: DayResult) -> List[str]:
    lines = []
    for run in result.runs:
        if not run.counted:
            lines.append(f"- `{run.path.name}`: {run.excluded or 'unbekannt'}.")
    return lines


def render_report(result: DayResult) -> str:
    ev = result.evaluation
    counted = [run for run in result.runs if run.counted]
    sources = sorted({run.source for run in counted}) or ["–"]
    lines = [f"# Auswertung Feldtag Testraum – {result.date}", ""]
    if result.probe:
        lines += [PROBE_BANNER, ""]
    lines += [
        f"Markt `{result.store}` · Layout `{result.layout.name}` · Regel: `{POSITIONING_DECISION}` · "
        f"Quelle des Vergleichs: {', '.join(sources)}",
        "",
        "## Ergebnis",
        "",
        f"**{VERDICT_SHORT[ev.verdict]}**",
        "",
        VERDICT_TEXT[ev.verdict],
        "",
        f"Bewertungsläufe gezählt: **{len(counted)}** (Minimum {pv.MIN_EVALUATION_RUNS}) von {len(result.runs)} Aufnahmen.",
        "",
        "## Kennzahlen je Lauf",
        "",
        "Positionsfehler in Metern (1 Rasterzelle = 1 m). Ausfall in % der Epochen mit Referenz, Sprung in % der Positionspaare. „aktuell“ ist die bisherige App-Pipeline, „Engine“ die PositioningEngine.",
        "",
        *runs_table(result.runs),
        "",
        "### Differenz Engine minus aktuelle Pipeline (negativ bei Median und P90 = Engine besser)",
        "",
        *delta_table(result),
        "",
        "## Regel in Klartext",
        "",
        "BESSER gilt nur, wenn alle fünf Bedingungen erfüllt sind:",
        "",
        *criteria_lines(result),
        "",
    ]
    notes = conspicuous_lines(result)
    if notes:
        lines += ["### Auffällige Läufe", "", *notes, ""]
    ex = excluded_lines(result)
    lines += ["## Nicht gezählte Läufe", ""]
    lines += ex if ex else ["- Keine, alle Aufnahmen zählen."]
    lines.append("")
    errors = [(run, e) for run in result.runs for e in run.errors]
    if errors or result.warnings:
        lines += ["## Fehler und Hinweise der Werkzeuge", ""]
        lines += [f"- `{run.path.name}`: {error}" for run, error in errors]
        lines += [f"- {warning}" for warning in result.warnings]
        lines.append("")
    lines += [
        "## Was der Mensch noch prüfen muss",
        "",
        "Diese Punkte aus Abschnitt 3 des Dokuments kann das Werkzeug nicht sehen:",
        "",
        "- Alle Wahrheitsmarken sind in jeder Aufnahme da (Zahl mit dem Notizblatt vergleichen).",
        "- Die Aufnahmen wurden nicht nachträglich geändert.",
        "- Die Rolle `evaluation` wurde vor dem Lauf in den Debug-Einstellungen gewählt und stimmt (Rolle steht in der `session`-Zeile).",
        "- Empfehlung: Läufe aus zwei Sessions zu verschiedenen Tageszeiten und von mehr als einem Gerätemodell.",
        "",
        "## Grenzen",
        "",
        "- Der Replay bekommt dieselben Messwerte und nutzt dieselbe `PositioningPipeline`. Er zeigt, dass die Engine die Pipeline nicht "
        "verschlechtert, nicht wie die Funkschicht der Engine sich im Feld verhält (Schattenbetrieb, Abschnitt 6).",
        "- Die Aussage gilt nur für diesen Raum, diese Geräte und diese Läufe. Die Referenz (getippte Wahrheitsmarke) ist selbst unsicher.",
        "- Die Regel wird nicht nachträglich angepasst, bis ein Ergebnis passt.",
        "",
        "## Dateien",
        "",
        f"- Reports je Lauf: `reports/<name>-report.md`; Vergleiche: `work/<name>-comparison.json|csv|txt`; Regel-Ausgabe: `VERDICT.txt`",
        f"- Positioning Lab: {result.lab_note}",
        "",
    ]
    return "\n".join(lines)


def render_comment(result: DayResult) -> str:
    ev = result.evaluation
    counted = [run for run in result.runs if run.counted]
    lines = [f"## Auswertung Feldtag Testraum {result.date} – Ergebnis: {ev.verdict}", ""]
    if result.probe:
        lines += [PROBE_BANNER, ""]
    lines += [
        f"**{VERDICT_SHORT[ev.verdict]}**",
        "",
        VERDICT_TEXT[ev.verdict],
        "",
        f"Regel: `{POSITIONING_DECISION}` (Vorschlag, vom Team zu bestätigen). "
        f"Gezählt: {len(counted)} von {len(result.runs)} Aufnahmen (Minimum {pv.MIN_EVALUATION_RUNS} Bewertungsläufe).",
        "",
        "### Differenz Engine minus aktuelle Pipeline (negativ = Engine besser)",
        "",
        *delta_table(result),
        "",
        "### Regel",
        "",
        *criteria_lines(result),
        "",
    ]
    notes = conspicuous_lines(result)
    if notes:
        lines += ["### Auffällige Läufe", "", *notes, ""]
    ex = excluded_lines(result)
    if ex:
        lines += ["### Nicht gezählt", "", *ex, ""]
    lines += [
        "### Grenzen",
        "",
        "- Replay mit denselben Messwerten und derselben Pipeline: zeigt nicht das Verhalten der Funkschicht der Engine im Feld.",
        "- Gilt nur für diesen Raum, diese Geräte und diese Läufe. Noch offen: alle Wahrheitsmarken vorhanden, Aufnahmen unverändert, Rolle `evaluation` vor dem Lauf gewählt.",
        "- Es wird nichts eingeschaltet. Die Entscheidung trifft das Team.",
        "",
        "Vollständiger Bericht: `BERICHT.md` im Auswertungsordner (Anhang der Story).",
        "",
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------------------------------------------------
# Ablauf

def evaluate_field_day(
    directory: Path,
    out_dir: Path,
    *,
    store: str = DEFAULT_STORE,
    layout: Optional[Path] = None,
    site: str = "testraum",
    markers: Optional[Path] = None,
    date: Optional[str] = None,
    lab: bool = True,
    offline: bool = False,
    replay_runner: aw.ReplayRunner = aw.swift_replay,
    compare_runner: cp.CompareRunner = cp.swift_compare,
    shadow: ShadowHook = shadow_comparison,
    fetcher: cp.LayoutFetcher = fetch_layout.main,
) -> DayResult:
    recordings = list_recordings(directory)
    if layout is not None:
        if not layout.is_file():
            raise FieldDayError(f"Layout nicht gefunden: {layout}", 2)
        layout_path = layout
    elif offline:
        cached = cp.LAYOUTS_DIR / f"{store.lower()}.json"
        if not cached.is_file():
            raise FieldDayError(
                f"--offline: kein Layout. Mit --layout DATEI angeben oder {cached} vorher holen (fetch_layout.py).", 2
            )
        layout_path = cached
    else:
        try:
            layout_path = cp.layout_for_store(store, False, fetcher)
        except aw.AnalysisError as error:
            raise FieldDayError(str(error), error.code)
    try:
        aw.load_layout(layout_path)
    except aw.AnalysisError as error:
        raise FieldDayError(str(error), error.code)
    if markers is not None and not markers.is_file():
        raise FieldDayError(f"Standort-Datei nicht gefunden: {markers}", 2)

    out_dir.mkdir(parents=True, exist_ok=True)
    for stale in ("anonymized", "lab-import"):  # Altlasten früherer Läufe nie mit neuen mischen (nur innerhalb von --out)
        shutil.rmtree(out_dir / stale, ignore_errors=True)
    runs = anonymize_and_verify(recordings, out_dir / "anonymized")  # Schritt 1, Abbruch bei Verstoß
    for run in runs:  # Schritt 2
        print(f"== {run.path.name}", file=sys.stderr)
        process_run(
            run, layout=layout_path, site=site, markers=markers, out_dir=out_dir,
            replay_runner=replay_runner, compare_runner=compare_runner, shadow=shadow,
        )
    evaluation = apply_rule(runs)  # Schritt 3
    # Dieselben nicht gezählten Läufe wie im Bericht (inkl. Werkzeug-Ausschlüsse), damit VERDICT.txt und BERICHT.md übereinstimmen.
    not_counted = [(run.path.name, run.excluded or "unbekannt") for run in runs if not run.counted]
    verdict_text = pv.render(evaluation.accepted, not_counted, evaluation.verdict, evaluation.mean, evaluation.reasons)
    if any(run.rehearsal or run.synthetic for run in runs):
        verdict_text = PROBE_LINE + "\n\n" + verdict_text
    (out_dir / "VERDICT.txt").write_text(verdict_text + "\n", encoding="utf-8")

    first_date = date or _first_date(runs)
    lab_note = lab_import(runs, out_dir, site, first_date, lab)  # Schritt 4
    warnings: List[str] = []
    if lab_note.startswith("Fehlgeschlagen"):
        warnings.append(f"Lab-Übergabe: {lab_note}")
    result = DayResult(runs, evaluation, verdict_text, out_dir, date or first_date, store, layout_path, lab_note, warnings)
    (out_dir / "BERICHT.md").write_text(render_report(result), encoding="utf-8")  # Schritt 5
    (out_dir / "KOMMENTAR_195.md").write_text(render_comment(result), encoding="utf-8")  # Schritt 6
    return result


def _first_date(runs: Sequence[Run]) -> str:
    dates = []
    for run in runs:
        records = walk_report.parse_recording(run.anonymized.read_text(encoding="utf-8"))
        dates.append(aw.recording_date(run.path, records))
    known = sorted(d for d in dates if d != "unbekannt")
    return known[0] if known else datetime.date.today().isoformat()


def main(
    argv: Optional[Sequence[str]] = None,
    *,
    replay_runner: Optional[aw.ReplayRunner] = None,
    compare_runner: Optional[cp.CompareRunner] = None,
    shadow: ShadowHook = shadow_comparison,
    fetcher: cp.LayoutFetcher = fetch_layout.main,
) -> int:
    parser = argparse.ArgumentParser(description="Alle Aufnahmen eines Feldtags auswerten und die Entscheidung nach POSITIONING_DECISION.md ableiten.")
    parser.add_argument("directory", type=Path, help="Ordner mit den Aufnahmen (*.jsonl, indooro-recording/2)")
    parser.add_argument("--out", type=Path, metavar="DIR", help="Ausgabeordner (Standard: NavigationFixtures/exports/feldtag-<Datum>/, gitignored)")
    parser.add_argument("--no-lab-import", action="store_true", help="Lab-Übergabeordner nicht schreiben")
    parser.add_argument("--store", default=DEFAULT_STORE, metavar="CODE", help=f"storeCode für das Layout (Standard: {DEFAULT_STORE})")
    parser.add_argument("--layout", type=Path, metavar="LAYOUT.json", help="Layout-JSON (statt --store)")
    parser.add_argument("--offline", action="store_true", help="kein Netzzugriff: fehlt das Layout lokal (--layout oder NavigationFixtures/layouts/), Abbruch mit Exit 2")
    parser.add_argument("--site", default="testraum", help="Standortkennung (Standard: testraum)")
    parser.add_argument("--markers", type=Path, metavar="SITE.md", help="Standort-Datei mit Marker- und Gang-Tabelle")
    parser.add_argument("--date", metavar="JJJJ-MM-TT", help="Messdatum für Bericht und Lab-Namen (Standard: Datum der Aufnahmen)")
    args = parser.parse_args(argv)

    real_swift = replay_runner is None or compare_runner is None
    try:
        if real_swift:
            ok, reason = swift_available()
            if not ok:
                raise FieldDayError(reason, 2)
        out_dir = args.out or (aw.DEFAULT_WORK_DIR / f"feldtag-{datetime.date.today().isoformat()}")
        result = evaluate_field_day(
            args.directory, out_dir, store=args.store, layout=args.layout, site=args.site, markers=args.markers,
            date=args.date, lab=not args.no_lab_import, offline=args.offline,
            replay_runner=replay_runner or aw.swift_replay, compare_runner=compare_runner or cp.swift_compare,
            shadow=shadow, fetcher=fetcher,
        )
    except FieldDayError as error:
        print(f"Fehler: {error}", file=sys.stderr)
        return error.code

    print(result.verdict_text)
    print(f"Bericht: {out_dir / 'BERICHT.md'}")
    print(f"Kommentar für #195: {out_dir / 'KOMMENTAR_195.md'}")
    if result.probe:
        print("Hinweis: PROBELAUF mit synthetischen Aufnahmen. Diese Zahlen nie zitieren.", file=sys.stderr)
    failed = [run for run in result.runs if run.errors]
    for run in failed:
        for error in run.errors:
            print(f"Fehler in {run.path.name}: {error}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
