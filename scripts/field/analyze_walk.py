#!/usr/bin/env python3
"""Eine Aufnahme vom iPhone in einem Befehl auswerten (Feldtag Testraum).

Kette: anonymisieren und pruefen -> Replay durch die App-Pipeline (`swift test`, unveraenderter Code)
-> Statistik (`field_stats.py`) -> sichtbare Beacons je Position und Spruenge -> Report im Format von
`docs/pilot-readiness/hardware/reports/0000-synthetic-baseline.md`.

Aufruf (Repo-Wurzel, ueber den Wrapper):
    scripts/field/analyze_walk.sh [AUFNAHME.jsonl] [--site testraum] [--layout LAYOUT.json] [--markers SITE.md]
        [--out REPORT.md] [--min-window 20] [--source est|proj]

Ohne AUFNAHME gilt die neueste `*.jsonl` in `NavigationFixtures/incoming/`. Das Original bleibt unveraendert.
Zwischenstand und Report liegen in `NavigationFixtures/exports/` (gitignored). Aufnahmen, deren Dateiname mit
`synthetic-` beginnt, tragen im Report die Kennzeichnung SYNTHETISCH.

Exit: 0 Report geschrieben, 1 Anonymisierung oder Replay fehlgeschlagen, 2 Aufruf- oder Eingabefehler.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parent))

import field_stats  # noqa: E402
import walk_report  # noqa: E402
from anonymize_recording import anonymize_lines  # noqa: E402
from check_recording_anonymized import check_lines, split_lines  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
SWIFT_DIR = REPO_ROOT / "swift" / "indooro-EinkaeuferFinal"
FIXTURES = SWIFT_DIR / "NavigationFixtures"
DEFAULT_INCOMING = FIXTURES / "incoming"
DEFAULT_WORK_DIR = FIXTURES / "exports"
SITES_DIR = REPO_ROOT / "docs" / "pilot-readiness" / "hardware" / "sites"
TEST_RESOURCES = SWIFT_DIR / "Tests" / "IndooroNavigationCoreTests" / "Resources"
SWIFT_FILTER = "FieldExportTests/testFieldReplayOfSingleRecording"
SYNTHETIC_PREFIX = "synthetic-"
DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})")
SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9_.-]+")

# (Aufnahme, Layout, Arbeitsordner, Name) -> (Tick-CSV, REPLAY-Datei)
ReplayRunner = Callable[[Path, Path, Path, str], Tuple[Path, Path]]


class AnalysisError(Exception):
    """Ein Schritt ist fehlgeschlagen. `code` ist der Exit-Code."""

    def __init__(self, message: str, code: int = 1) -> None:
        super().__init__(message)
        self.code = code


def is_synthetic(path: Path) -> bool:
    return path.name.startswith(SYNTHETIC_PREFIX)


def newest_incoming(directory: Path) -> Path:
    files = sorted(directory.glob("*.jsonl"), key=lambda p: (p.stat().st_mtime, p.name)) if directory.is_dir() else []
    if not files:
        raise AnalysisError(
            f"Keine Aufnahme angegeben und keine *.jsonl in {directory}. "
            "Datei aus der Dateien-App oder per AirDrop dorthin legen oder als Argument uebergeben.",
            2,
        )
    return files[-1]


def resolve_layout(recording: Path, site: str, explicit: Optional[Path]) -> Path:
    if explicit is not None:
        if not explicit.is_file():
            raise AnalysisError(f"Layout nicht gefunden: {explicit}", 2)
        return explicit
    candidates = [
        SITES_DIR / f"layout-{site}.json",
        TEST_RESOURCES / f"layout-{site}.json",
        FIXTURES / "layouts" / f"{site}.json",
    ]
    if is_synthetic(recording):
        stem = DATE_RE.split(recording.stem)[0].rstrip("-")
        candidates.insert(0, recording.parent / f"layout-{stem}.json")
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    tried = "\n  ".join(str(c) for c in candidates)
    raise AnalysisError(
        "Kein Layout gefunden. Mit --layout angeben oder holen:\n"
        f"  python -I scripts/field/fetch_layout.py --store <storeCode> --out {FIXTURES / 'layouts' / (site + '.json')}\n"
        f"Gesucht in:\n  {tried}",
        2,
    )


def load_layout(path: Path) -> Dict[str, object]:
    """`LayoutData`-Objekt; akzeptiert auch die Mobile-Antwort mit `layout`-Schluessel."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise AnalysisError(f"Layout nicht lesbar: {path} ({error})", 2)
    if isinstance(data, dict) and isinstance(data.get("layout"), dict):
        data = data["layout"]
    if not isinstance(data, dict) or not isinstance(data.get("elements"), list) or "gridSize" not in data:
        raise AnalysisError(f"{path} ist kein Layout (elements, gridSize)", 2)
    return data


def anonymize_to(source: Path, target: Path) -> int:
    """Anonymisierte Kopie schreiben. Meldet jeden Verstoss; schreibt bei Verstoss nichts. Zeilenzahl zurueck."""
    try:
        text = source.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as error:
        raise AnalysisError(f"Aufnahme nicht lesbar: {source} ({error})", 2)
    lines = anonymize_lines(split_lines(text))
    violations = check_lines(lines)
    if violations:
        detail = "\n".join(f"  {source.name}:{v.line}: {v.reason}" for v in violations[:20])
        more = f"\n  ... und {len(violations) - 20} weitere" if len(violations) > 20 else ""
        raise AnalysisError(f"Anonymisierungspruefung fehlgeschlagen, es wird nichts ausgewertet:\n{detail}{more}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return len([line for line in lines if line.strip()])


def swift_replay(recording: Path, layout: Path, work_dir: Path, name: str) -> Tuple[Path, Path]:
    """Replay ueber den vorhandenen Test `FieldExportTests` (gleiche Kette wie die App, nichts neu gebaut)."""
    env = dict(os.environ)
    env.update({
        "FIELD_REPLAY_RECORDING": str(recording.resolve()),
        "FIELD_EXPORT_LAYOUT": str(layout.resolve()),
        "FIELD_EXPORT_DIR": str(work_dir.resolve()),
        "FIELD_REPLAY_NAME": name,
    })
    try:
        done = subprocess.run(
            ["swift", "test", "--filter", SWIFT_FILTER],
            cwd=SWIFT_DIR, env=env, capture_output=True, text=True, check=False,
        )
    except OSError as error:
        raise AnalysisError(f"swift nicht ausfuehrbar ({error}). Xcode-Kommandozeilenwerkzeuge installiert?", 2)
    output = (done.stdout or "") + (done.stderr or "")
    ticks = work_dir / f"{name}-ticks.csv"
    replay = work_dir / f"{name}-replay.txt"
    if done.returncode != 0 or "Test skipped" in output or not ticks.is_file() or not replay.is_file():
        tail = "\n".join(output.strip().splitlines()[-25:])
        raise AnalysisError(f"Replay fehlgeschlagen (swift test, Exit {done.returncode}):\n{tail}")
    return ticks, replay


def recording_date(path: Path, records: Sequence[Dict[str, object]]) -> str:
    match = DATE_RE.search(path.name)
    if match:
        return match.group(1)
    times = [float(r["t"]) for r in records if isinstance(r.get("t"), (int, float))]
    if times:
        return datetime.datetime.fromtimestamp(min(times), datetime.timezone.utc).strftime("%Y-%m-%d")
    return "unbekannt"


def git_commit() -> str:
    try:
        done = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO_ROOT, capture_output=True, text=True, check=False)
        return done.stdout.strip() or "unbekannt"
    except OSError:
        return "unbekannt"


def demote_headings(markdown: str) -> List[str]:
    """`# Titel` -> `### Titel`, damit field_stats-Abschnitte unter einem eigenen `##` stehen."""
    return [("##" + line) if line.startswith("#") else line for line in markdown.splitlines()]


def observations(
    summary: walk_report.RecordingSummary,
    layout_beacons: Dict[str, Tuple[float, float]],
    reports: Sequence[walk_report.VisitReport],
    unmatched: Sequence[walk_report.UnmatchedBeacon],
) -> List[str]:
    notes: List[str] = []
    if summary.measurements == 0:
        notes.append("**Keine Messungen in der Aufnahme.** Layout und Registrierung (UUID/Major/Minor) prüfen, siehe Abschnitt „Beacons ohne Layout-Treffer“.")
    if summary.truths == 0:
        notes.append("**Keine `truth`-Zeilen.** Ohne Long-Press auf der Karte gibt es keinen Positionsfehler.")
    silent = sorted(set(layout_beacons) - set(summary.beacons))
    if layout_beacons and silent:
        notes.append(f"Layout-Beacons ohne eine einzige Messung: {', '.join(silent)}.")
    if len(layout_beacons) < 3:
        notes.append(f"Das Layout hat nur {len(layout_beacons)} Beacons; der Solver braucht mindestens 3 für eine Position.")
    standing = [r for r in reports if r.visit.presses >= 2 and r.strongest and r.nearest_layout_beacon]
    wrong = [r for r in standing if r.strongest.name != r.nearest_layout_beacon]  # type: ignore[union-attr]
    if wrong:
        where = "; ".join(f"{r.visit.point[0]:.1f} / {r.visit.point[1]:.1f}" for r in wrong[:5])
        notes.append(
            f"An {len(wrong)} von {len(standing)} Stand-Positionen ist nicht der nächste Layout-Beacon der stärkste ({where}). "
            "Mögliche Ursachen: Beacon-Koordinate im Layout falsch, zwei Beacons vertauscht, Abschattung."
        )
    low = [r for r in reports if r.visible and r.stable < 3]
    if low:
        notes.append(f"{len(low)} von {len(reports)} Positionen haben weniger als 3 Beacons mit ≥ {walk_report.MIN_SAMPLES_STABLE} Samples.")
    if unmatched and layout_beacons and silent:
        notes.append("Layout-fremde iBeacons und stumme Layout-Beacons gleichzeitig: wahrscheinlich passt die Registrierung nicht zum Layout.")
    return notes


def build_report(
    *,
    report_id: str,
    source_path: Path,
    layout_path: Path,
    site: str,
    synthetic: bool,
    records: Sequence[Dict[str, object]],
    ticks_path: Path,
    replay_text: str,
    markers_path: Optional[Path],
    layout: Dict[str, object],
    min_window: float,
    position_source: str,
    command: str,
) -> str:
    summary = walk_report.summarize_recording(records)
    layout_beacons = walk_report.layout_beacons(layout)
    ticks = walk_report.parse_ticks(ticks_path.read_text(encoding="utf-8"))
    visits = walk_report.truth_visits(records)
    reports = walk_report.visit_reports(records, visits, layout_beacons, ticks)
    unmatched = walk_report.unmatched_beacons(records)
    jumps, largest = walk_report.find_jumps(ticks)
    t0 = summary.t_first or 0.0
    date = recording_date(source_path, records)

    site_data = field_stats.read_site_file(markers_path) if markers_path else field_stats.SiteData(markers=[], aisles=[])
    layout_aisles = [a for a in _layout_aisles(layout)]
    if site_data.aisles:
        aisles: Optional[List[field_stats.Aisle]] = site_data.aisles
        aisle_source = "Standort-Datei (Gang-Tabelle)"
    elif layout_aisles:
        aisles = layout_aisles
        aisle_source = "Layout-JSON (type aisle)"
    else:
        aisles = None
        aisle_source = "n/a (keine Gangdefinition; Standort-Datei mit Gang-Tabelle angeben)"
    ticks_for_stats = field_stats.read_ticks_file(ticks_path)
    recording_result = field_stats.analyze_recording(
        source_path.stem, ticks_for_stats, site_data.markers, aisles, position_source, min_window
    )
    stats_markdown = field_stats.render_report(
        [recording_result], site_data.markers, aisles, aisle_source, position_source, min_window,
        field_stats.parse_replay_lines(replay_text),
    )

    title = "SYNTHETISCH (keine Messung)" if synthetic else "Feldaufnahme"
    lines: List[str] = [f"# Report {report_id}: {site} – {title}", ""]
    if synthetic:
        lines += [
            "> **SYNTHETISCH – keine Messung.** Die Funkwerte stammen aus einem Modell mit festem Seed "
            "(`scripts/field/make_synthetic_walk.py`). Diese Zahlen sind ein Probelauf der Werkzeugkette und dürfen "
            "nicht als Feldergebnis, nicht in `RESULT_SUMMARY.md` und nicht in Berichten zitiert werden.",
            "",
        ]
    lines += [
        f"- Datum: {date}",
        f"- Commit: `{git_commit()}` (Werkzeuge und Pipeline; Replay mit `StabilizedNavigationConfig.default`)",
        f"- Befehl: `{command}`",
        f"- Quelle: {'**synthetische Aufnahme, keine Messdaten**' if synthetic else 'echte Feldaufnahme (DEBUG-Recorder, anonymisiert)'}",
        f"- Aufnahme: `{source_path.name}`, {summary.duration_s:.0f} s, {summary.lines} Zeilen "
        f"(Messungen {summary.measurements}, Wahrheitsmarker {summary.truths}, Ereignisse {summary.events}, fremde iBeacons {summary.scans})",
        f"- Layout: `{layout_path.name}`, {len(layout_beacons)} Beacons ({', '.join(sorted(layout_beacons)) or 'keine'})",
        f"- Gehört in der Aufnahme: {', '.join(summary.beacons) or 'keine Layout-Beacons'}",
        f"- Positionsquelle der Statistik: {'Schätzung (est)' if position_source == 'est' else 'projizierte Position (proj)'}",
        "- Referenzgenauigkeit: Die Wahrheit ist die getippte Kartenposition (`MEASUREMENT_PROTOCOL.md`, Abschnitt 2); sie begrenzt, wie genau ein Fehler überhaupt gemessen werden kann.",
        "",
        "## Replay-Kennzahlen",
        "",
        "```text",
        replay_text.strip(),
        "```",
        "",
        "## Sprünge",
        "",
        *walk_report.render_jumps(jumps, largest, t0),
        "",
        "## Sichtbare Beacons je Position",
        "",
        *walk_report.render_visit_table(reports, t0),
        "",
        "## Beacons ohne Layout-Treffer",
        "",
        *walk_report.render_unmatched(unmatched),
        "",
        "## Auffälligkeiten",
        "",
    ]
    notes = observations(summary, layout_beacons, reports, unmatched)
    lines += [f"- {note}" for note in notes] if notes else ["- Keine automatisch erkannten Auffälligkeiten."]
    lines += ["", "## Positionsfehler und Gang (field_stats.py)", "", *demote_headings(stats_markdown), "",
              "Hinweise:", "",
              "- Der Fehler wird nur in Stand-Fenstern gerechnet: zwei Long-Presses an derselben Stelle, mindestens "
              f"{min_window:.0f} s auseinander. Einzelne Durchgänge zählen für die Sichtbarkeit der Beacons, nicht für den Fehler.",
              "- Ohne Marker-Tabelle (`--markers`) heißen die Stellen „kein Marker (x / y)“; die Zahlen gelten trotzdem.",
              ""]
    return "\n".join(lines)


def _layout_aisles(layout: Dict[str, object]) -> List[field_stats.Aisle]:
    aisles: List[field_stats.Aisle] = []
    for element in layout.get("elements", []):  # type: ignore[union-attr]
        if isinstance(element, dict) and element.get("type") == "aisle":
            try:
                x, y = float(element["x"]), float(element["y"])
                width, height = float(element["width"]), float(element["height"])
            except (KeyError, TypeError, ValueError):
                continue
            aisles.append(field_stats.Aisle(str(element.get("label") or element.get("id")), x, y, x + width, y + height))
    return aisles


def analyze(
    recording: Path,
    *,
    site: str,
    layout: Optional[Path],
    markers: Optional[Path],
    out: Optional[Path],
    work_dir: Path,
    min_window: float,
    position_source: str,
    runner: ReplayRunner = swift_replay,
    command: Optional[str] = None,
) -> Tuple[Path, str]:
    """Gesamte Kette. Gibt (Reportpfad, Report) zurueck."""
    if not recording.is_file():
        raise AnalysisError(f"Aufnahme nicht gefunden: {recording}", 2)
    if markers is not None and not markers.is_file():
        raise AnalysisError(f"Standort-Datei nicht gefunden: {markers}", 2)
    layout_path = resolve_layout(recording, site, layout)
    layout_data = load_layout(layout_path)

    name = SAFE_NAME_RE.sub("-", recording.stem).strip("-") or "aufnahme"
    work_dir.mkdir(parents=True, exist_ok=True)
    anonymized = work_dir / f"{name}.anon.jsonl"
    anonymize_to(recording, anonymized)
    records = walk_report.parse_recording(anonymized.read_text(encoding="utf-8"))
    if not any(r["type"] == "measurement" for r in records):
        print("Warnung: keine Messungen in der Aufnahme. Der Replay liefert keine Position.", file=sys.stderr)

    layout_for_replay = layout_path
    if "layout" in json.loads(layout_path.read_text(encoding="utf-8")):
        layout_for_replay = work_dir / f"{name}.layout.json"
        layout_for_replay.write_text(json.dumps(layout_data), encoding="utf-8")

    ticks_path, replay_path = runner(anonymized, layout_for_replay, work_dir, name)
    replay_text = replay_path.read_text(encoding="utf-8")

    if markers is None:
        default_markers = SITES_DIR / f"{site}.md"
        markers = default_markers if default_markers.is_file() else None

    report_path = out or (work_dir / f"{name}-report.md")
    try:
        report = build_report(
            report_id=f"{recording_date(recording, records)}-{site}-{name}",
            source_path=recording, layout_path=layout_path, site=site, synthetic=is_synthetic(recording),
            records=records, ticks_path=ticks_path, replay_text=replay_text, markers_path=markers,
            layout=layout_data, min_window=min_window, position_source=position_source,
            command=command or f"scripts/field/analyze_walk.sh {recording} --site {site}",
        )
    except (walk_report.ReportInputError, field_stats.InputError) as error:
        raise AnalysisError(f"Auswertung nicht moeglich: {error}", 2)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(report, encoding="utf-8")
    return report_path, report


def main(argv: Optional[Sequence[str]] = None, runner: ReplayRunner = swift_replay) -> int:
    parser = argparse.ArgumentParser(description="Eine Aufnahme in einem Befehl auswerten und einen Report schreiben.")
    parser.add_argument("recording", nargs="?", type=Path, help="Aufnahme (*.jsonl); Standard: neueste in NavigationFixtures/incoming/")
    parser.add_argument("--site", default="testraum", help="Standortkennung (Standard: testraum)")
    parser.add_argument("--layout", type=Path, metavar="LAYOUT.json", help="Layout-JSON wie in der App (siehe fetch_layout.py)")
    parser.add_argument("--markers", type=Path, metavar="SITE.md", help="Standort-Datei mit Marker- und Gang-Tabelle")
    parser.add_argument("--out", type=Path, metavar="REPORT.md", help="Report-Datei (Standard: NavigationFixtures/exports/<name>-report.md)")
    parser.add_argument("--work-dir", type=Path, default=DEFAULT_WORK_DIR, metavar="DIR")
    parser.add_argument("--min-window", type=float, default=field_stats.DEFAULT_MIN_WINDOW_S, metavar="SECONDS")
    parser.add_argument("--source", choices=["est", "proj"], default="est")
    args = parser.parse_args(argv)

    try:
        recording = args.recording or newest_incoming(DEFAULT_INCOMING)
        command = "scripts/field/analyze_walk.sh " + " ".join(sys.argv[1:]) if argv is None else None
        report_path, report = analyze(
            recording, site=args.site, layout=args.layout, markers=args.markers, out=args.out,
            work_dir=args.work_dir, min_window=args.min_window, position_source=args.source,
            runner=runner, command=command,
        )
    except AnalysisError as error:
        print(f"Fehler: {error}", file=sys.stderr)
        return error.code
    print(f"Report geschrieben: {report_path}")
    for line in report.splitlines():
        if line.startswith("REPLAY ") or line.startswith("- Schritte der projizierten") or line.startswith("- Größter Schritt"):
            print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
