#!/usr/bin/env python3
"""Eine Aufnahme durch die aktuelle App-Pipeline und die PositioningEngine spielen und vergleichen.

Kette: anonymisierte Kopie und Pruefung (wie `analyze_walk.py`) -> Layout (Datei oder lesend vom Backend)
-> `swift run compare-positioning` (zwei Pfade, dieselben Samples, dieselbe Uhr, dasselbe Layout)
-> Dateien in `NavigationFixtures/exports/` und Kurzfassung auf der Standardausgabe.

Es wird nichts an die App, ein Flag, das Routing oder das Backend geschrieben. Netzzugriff nur mit `--store`
und nur, wenn das Layout noch nicht unter `NavigationFixtures/layouts/` liegt (zwei GET-Aufrufe, `fetch_layout.py`).

Aufruf (Repo-Wurzel, ueber den Wrapper):
    scripts/field/compare_positioning.sh [AUFNAHME.jsonl] --store SPAR-Leonding-002
    scripts/field/compare_positioning.sh [AUFNAHME.jsonl] --layout LAYOUT.json [--warmup SEKUNDEN] [--work-dir DIR]

Ausgabe `<name>-comparison.csv|json|txt`, `<name>-current-ticks.csv`, `<name>-engine-ticks.csv`.
Schattenmodus: Enthaelt die Aufnahme `shadow`-Zeilen (Debug-Schalter "Schattenmodus", beide Ortungen laufen im
selben Lauf), liest dieser Aufruf sie direkt: je Zeile Fehler der alten und der neuen Position gegen die
Wahrheitsmarker, ohne Swift und ohne Layout. Ergebnis `<name>-comparison.json` mit `origin: "shadow"`.
`--replay` erzwingt den Replay trotzdem, `--shadow` verlangt den Schattenmodus.
Exit: 0 fertig, 1 Anonymisierung oder Vergleich fehlgeschlagen, 2 Aufruf- oder Eingabefehler (Datei, Layout),
3 keine Epoche mit Referenz (keine Wahrheitsmarken): Positionen sind geschrieben, Kennzahlen fehlen.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import subprocess
import sys
from pathlib import Path
from typing import Callable, List, Optional, Sequence

sys.path.insert(0, str(Path(__file__).resolve().parent))

import fetch_layout  # noqa: E402
from analyze_walk import (  # noqa: E402
    DEFAULT_INCOMING,
    DEFAULT_WORK_DIR,
    FIXTURES,
    SAFE_NAME_RE,
    SWIFT_DIR,
    AnalysisError,
    anonymize_to,
    is_synthetic,
    newest_incoming,
    resolve_layout,
)

LAYOUTS_DIR = FIXTURES / "layouts"
STORE_CODE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")
NO_TRUTH_EXIT = 3

SCHEMA = "indooro-position-comparison/1"
JUMP_SPEED_MPS = 2.0
MAX_PAIR_GAP_S = 2.0
SYNTHETIC_PREFIX = "synthetic-"

# (anonymisierte Aufnahme, Layout, Ausgabeordner, Name, Aufwaermphase) -> Exit-Code des Werkzeugs
CompareRunner = Callable[[Path, Path, Path, str, Optional[float]], int]
# (argv) -> Exit-Code von fetch_layout.main
LayoutFetcher = Callable[[List[str]], int]


def swift_compare(recording: Path, layout: Path, out_dir: Path, name: str, warmup: Optional[float]) -> int:
    """Startet `compare-positioning` (SwiftPM-Ziel `ComparePositioningCLI`); die Ausgabe geht direkt ans Terminal."""
    command = [
        "swift", "run", "compare-positioning", str(recording.resolve()),
        "--layout", str(layout.resolve()), "--out", str(out_dir.resolve()), "--name", name,
    ]
    if warmup is not None:
        command += ["--warmup", str(warmup)]
    try:
        return subprocess.run(command, cwd=SWIFT_DIR, check=False).returncode
    except OSError as error:
        raise AnalysisError(f"swift nicht ausfuehrbar ({error}). Xcode-Kommandozeilenwerkzeuge installiert?", 2)


# ---------------------------------------------------------------------------------------------------------------------
# Schattenmodus: direkte Auswertung der `shadow`-Zeilen (Definitionen wie ComparisonMetrics.swift und METRICS.md)

def read_recording_lines(path: Path) -> List[dict]:
    lines: List[dict] = []
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not raw.strip():
            continue
        try:
            obj = json.loads(raw)
        except ValueError as error:
            raise AnalysisError(f"{path.name}: Zeile {number} ist kein JSON ({error})", 2)
        if isinstance(obj, dict):
            lines.append(obj)
    return lines


def has_shadow_lines(path: Path) -> bool:
    try:
        return any(line.get("type") == "shadow" for line in read_recording_lines(path))
    except (OSError, AnalysisError):
        return False


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _percentile(sorted_values: Sequence[float], p: float) -> float:
    """Hyndman-Fan Typ 7 (PERCENTILE.INC) wie in ComparisonMetrics.swift."""
    h = (len(sorted_values) - 1) * p / 100
    lower = int(math.floor(h))
    upper = min(lower + 1, len(sorted_values) - 1)
    return sorted_values[lower] + (h - lower) * (sorted_values[upper] - sorted_values[lower])


def _round6(value: Optional[float]) -> Optional[float]:
    return None if value is None else round(value * 1_000_000) / 1_000_000


def truth_track(lines: Sequence[dict]):
    """Wahrheitsmarker (sortiert) und Standzeiten (gleiche Position in Folge) wie `TruthTrack.swift`."""
    markers = sorted(
        ((float(line["t"]), float(line["x"]), float(line["y"])) for line in lines
         if line.get("type") == "truth" and all(_is_number(line.get(key)) for key in ("t", "x", "y"))),
        key=lambda item: item[0],
    )
    holds = []
    i = 0
    while i < len(markers):
        j = i
        while j + 1 < len(markers) and abs(markers[j + 1][1] - markers[i][1]) < 1e-6 and abs(markers[j + 1][2] - markers[i][2]) < 1e-6:
            j += 1
        if j > i:
            holds.append((markers[i][0], markers[j][0], markers[i][1], markers[i][2]))
        i = j + 1
    return markers, holds


def truth_at(markers, holds, t: float) -> Optional[Tuple[float, float]]:
    if not markers:
        return None
    for start, end, x, y in holds:
        if start <= t <= end:
            return (x, y)
    low, high = 0, len(markers)
    while low < high:
        mid = (low + high) // 2
        if markers[mid][0] < t:
            low = mid + 1
        else:
            high = mid
    if low >= len(markers):
        return None
    nxt = markers[low]
    if nxt[0] == t:
        return (nxt[1], nxt[2])
    if low == 0:
        return None
    prev = markers[low - 1]
    span = nxt[0] - prev[0]
    if span <= 0:
        return None
    fraction = (t - prev[0]) / span
    return (prev[1] + fraction * (nxt[1] - prev[1]), prev[2] + fraction * (nxt[2] - prev[2]))


def path_metrics(epochs: Sequence[Tuple[float, Optional[Tuple[float, float]], Optional[Tuple[float, float]]]]) -> dict:
    """Kennzahlen eines Pfades; Epochen sind (t, Wahrheit, Position). Schluessel wie `summary.<methode>` im Replay."""
    errors: List[float] = []
    with_truth = 0
    for _t, truth, position in epochs:
        if truth is None:
            continue
        with_truth += 1
        if position is not None:
            error = math.hypot(position[0] - truth[0], position[1] - truth[1])
            if math.isfinite(error):
                errors.append(error)
    failed = with_truth - len(errors)
    out: dict = {
        "epochs": len(epochs), "epochsWithTruth": with_truth, "validEstimates": len(errors), "failedEstimates": failed,
        "outageRate": _round6(failed / with_truth) if with_truth else None,
        "mean": None, "median": None, "rmse": None, "p90": None, "p95": None, "max": None,
        "within2": None, "within3": None, "within5": None,
    }
    if with_truth:
        for limit in (2, 3, 5):
            out[f"within{limit}"] = _round6(sum(1 for e in errors if e <= limit) / with_truth)
    if errors:
        ordered = sorted(errors)
        out["mean"] = _round6(sum(errors) / len(errors))
        out["median"] = _round6(_percentile(ordered, 50))
        out["p90"] = _round6(_percentile(ordered, 90))
        out["p95"] = _round6(_percentile(ordered, 95))
        out["rmse"] = _round6(math.sqrt(sum(e * e for e in errors) / len(errors)))
        out["max"] = _round6(ordered[-1])
    positioned = sorted(((t, p) for t, _truth, p in epochs if p is not None), key=lambda item: item[0])
    pairs = jumps = 0
    for (t0, p0), (t1, p1) in zip(positioned, positioned[1:]):
        dt = t1 - t0
        if not (0 < dt <= MAX_PAIR_GAP_S):
            continue
        pairs += 1
        if math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / dt > JUMP_SPEED_MPS:
            jumps += 1
    out["pairs"] = pairs
    out["jumps"] = jumps
    out["jumpRate"] = _round6(jumps / pairs) if pairs else None
    return out


def _side_position(side: object) -> Optional[Tuple[float, float]]:
    if isinstance(side, dict) and _is_number(side.get("x")) and _is_number(side.get("y")):
        return (float(side["x"]), float(side["y"]))
    return None


SHADOW_WARMUP_S = 1.2  # wie der Replay (App-Wert); Aufwaermphase der Engine ab der ersten shadow-Zeile
NOT_READY_STATUSES = frozenset({"stopped", "warmingUp"})


def shadow_comparison_data(recording: Path, name: Optional[str] = None, warmup: float = SHADOW_WARMUP_S) -> dict:
    """`indooro-position-comparison/1` aus den `shadow`-Zeilen einer (anonymisierten) Aufnahme, `origin: "shadow"`.

    Wie im Replay zaehlen die ersten `warmup` Sekunden ab der ersten shadow-Zeile nicht, und Epochen, in denen eine
    Seite `stopped` oder `warmingUp` meldet, fallen fuer **beide** Pfade weg (gleiche Epochenmenge, `excludedEpochs`).
    Die Seiten tragen eigene Quell-Zeitstempel `t`; der Versatz ist hoechstens ein Tick (0,35 s).
    """
    raw = recording.read_bytes()
    lines = read_recording_lines(recording)
    shadow = sorted((line for line in lines if line.get("type") == "shadow" and _is_number(line.get("t"))), key=lambda l: l["t"])
    if not shadow:
        raise AnalysisError(f"{recording.name}: keine shadow-Zeilen (Schattenmodus war aus).", 2)
    markers, holds = truth_track(lines)
    rows = []
    current_epochs = []
    engine_epochs = []
    excluded = 0
    start = float(shadow[0]["t"])
    for line in shadow:
        t = float(line["t"])
        statuses = {(line.get(side) or {}).get("status") for side in ("legacy", "engine") if isinstance(line.get(side), dict)}
        if t < start + warmup or statuses & NOT_READY_STATUSES:
            excluded += 1
            continue
        truth = truth_at(markers, holds, t)
        legacy = _side_position(line.get("legacy"))
        engine = _side_position(line.get("engine"))
        current_epochs.append((t, truth, legacy))
        engine_epochs.append((t, truth, engine))
        def error(position):
            return None if truth is None or position is None else round(math.hypot(position[0] - truth[0], position[1] - truth[1]), 6)
        rows.append({
            "t": t,
            "truth": None if truth is None else [round(truth[0], 6), round(truth[1], 6)],
            "current": None if legacy is None else [legacy[0], legacy[1]],
            "engine": None if engine is None else [engine[0], engine[1]],
            "currentError": error(legacy),
            "engineError": error(engine),
        })
    session_line = next((line for line in lines if line.get("type") == "session"), None)
    session = None
    if session_line is not None:
        session = {key: session_line.get(key) for key in ("schema", "app", "deviceModel", "os", "scenario", "role")}
    recording_name = name or recording.stem
    return {
        "schema": SCHEMA,
        "origin": "shadow",
        "unit": "m",
        "recording": {"name": recording_name, "lines": len(lines), "sha256": hashlib.sha256(raw).hexdigest()},
        "session": session,
        "methods": ["current", "engine"],
        "epochs": rows,
        "summary": {"current": path_metrics(current_epochs), "engine": path_metrics(engine_epochs)},
        "warmupSeconds": warmup,
        "excludedEpochs": excluded,
        "warnings": [
            "Schattenmodus: beide Ortungen liefen im selben Lauf auf demselben Geraet, die Epochen sind die der neuen Ortung (shadow-Zeilen).",
            "Aufnahmen mit Namen synthetic- gelten nie als Feldlauf.",
        ] + (["Keine session-Zeile (Format 1): Rolle und Szenario sind unbekannt."] if session is None else []),
    }


def write_shadow_comparison(recording: Path, out_dir: Path, name: str, warmup: float = SHADOW_WARMUP_S) -> Optional[Path]:
    """Schreibt `<name>-comparison.json`; `None`, wenn die Aufnahme keine `shadow`-Zeilen hat."""
    if not has_shadow_lines(recording):
        return None
    data = shadow_comparison_data(recording, name, warmup)
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / f"{name}-comparison.json"
    target.write_text(json.dumps(data, sort_keys=True, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return target


def compare_shadow(recording: Path, work_dir: Path, warmup: Optional[float] = None) -> int:
    if not recording.is_file():
        raise AnalysisError(f"Aufnahme nicht gefunden: {recording}", 2)
    name = SAFE_NAME_RE.sub("-", recording.stem).strip("-") or "aufnahme"
    work_dir.mkdir(parents=True, exist_ok=True)
    anonymized = work_dir / f"{name}.anon.jsonl"
    anonymize_to(recording, anonymized)
    if is_synthetic(recording):
        print("Hinweis: synthetische Aufnahme. Das Ergebnis ist keine Messung.", file=sys.stderr)
    target = write_shadow_comparison(anonymized, work_dir, name, SHADOW_WARMUP_S if warmup is None else warmup)
    if target is None:
        raise AnalysisError("Keine shadow-Zeilen in der Aufnahme (Schattenmodus aus). Ohne --shadow laeuft der Replay.", 2)
    data = json.loads(target.read_text(encoding="utf-8"))
    for method, label in (("current", "alt "), ("engine", "neu ")):
        m = data["summary"][method]
        def f(key):
            return "-" if m[key] is None else f"{m[key]:.2f}"
        print(f"{label}: Epochen mit Referenz {m['epochsWithTruth']}, Median {f('median')} m, P90 {f('p90')} m, "
              f"Ausfall {f('outageRate')}, Spruenge {f('jumpRate')}")
    print(f"Geschrieben: {target}")
    return 0 if data["summary"]["current"]["epochsWithTruth"] > 0 else NO_TRUTH_EXIT


def layout_for_store(store: str, refresh: bool, fetcher: LayoutFetcher, layouts_dir: Path = LAYOUTS_DIR) -> Path:
    """Layout eines Marktes: vorhandene Datei, sonst lesend holen (`fetch_layout.py`)."""
    if not STORE_CODE_RE.match(store):
        raise AnalysisError(f"Ungueltiger Markt-Code: {store!r}", 2)
    target = layouts_dir / f"{store.lower()}.json"
    if target.is_file() and not refresh:
        return target
    print(f"Layout von {store} holen (nur lesend, zwei GET-Aufrufe) ...", file=sys.stderr)
    code = fetcher(["--store", store, "--out", str(target)])
    if code != 0 or not target.is_file():
        raise AnalysisError(
            f"Layout von {store} nicht geholt (fetch_layout.py, Exit {code}). "
            "Mit --layout eine vorhandene Datei angeben.",
            2,
        )
    return target


def compare(
    recording: Path,
    *,
    store: Optional[str],
    layout: Optional[Path],
    site: str,
    work_dir: Path,
    warmup: Optional[float] = None,
    refresh_layout: bool = False,
    runner: CompareRunner = swift_compare,
    fetcher: LayoutFetcher = fetch_layout.main,
    layouts_dir: Path = LAYOUTS_DIR,
    mode: str = "auto",
) -> int:
    if not recording.is_file():
        raise AnalysisError(f"Aufnahme nicht gefunden: {recording}", 2)
    if mode == "shadow" or (mode == "auto" and has_shadow_lines(recording)):
        code = compare_shadow(recording, work_dir, warmup)
        if code == NO_TRUTH_EXIT:
            print("Keine Epoche mit Referenz: keine Wahrheitsmarken (Marker M1 bis M8) im Zeitraum der shadow-Zeilen.", file=sys.stderr)
        return code
    if layout is not None:
        if not layout.is_file():
            raise AnalysisError(f"Layout nicht gefunden: {layout}", 2)
        layout_path = layout
    elif store is not None:
        layout_path = layout_for_store(store, refresh_layout, fetcher, layouts_dir)
    else:
        layout_path = resolve_layout(recording, site, None)

    name = SAFE_NAME_RE.sub("-", recording.stem).strip("-") or "aufnahme"
    work_dir.mkdir(parents=True, exist_ok=True)
    anonymized = work_dir / f"{name}.anon.jsonl"
    anonymize_to(recording, anonymized)

    if is_synthetic(recording):
        print("Hinweis: synthetische Aufnahme. Das Ergebnis ist keine Messung.", file=sys.stderr)
    code = runner(anonymized, layout_path, work_dir, name, warmup)
    if code == 0:
        return 0
    if code == NO_TRUTH_EXIT:
        print(
            "Keine Epoche mit Referenz: Die Aufnahme hat keine Wahrheitsmarken (Long-Press auf die Karte) "
            "oder sie liegen ausserhalb. Die Positionen sind geschrieben, Kennzahlen fehlen.",
            file=sys.stderr,
        )
        return NO_TRUTH_EXIT
    raise AnalysisError(f"Vergleich fehlgeschlagen (compare-positioning, Exit {code}).", 1)


def main(argv: Optional[Sequence[str]] = None, runner: CompareRunner = swift_compare, fetcher: LayoutFetcher = fetch_layout.main) -> int:
    parser = argparse.ArgumentParser(description="Aktuelle App-Pipeline und PositioningEngine auf einer Aufnahme vergleichen.")
    parser.add_argument("recording", nargs="?", type=Path, help="Aufnahme (*.jsonl); Standard: neueste in NavigationFixtures/incoming/")
    parser.add_argument("--store", metavar="CODE", help="storeCode, z. B. SPAR-Leonding-002; Layout aus NavigationFixtures/layouts/ oder lesend vom Backend")
    parser.add_argument("--layout", type=Path, metavar="LAYOUT.json", help="Layout-JSON (statt --store)")
    parser.add_argument("--refresh-layout", action="store_true", help="Layout von --store neu holen, auch wenn die Datei existiert")
    parser.add_argument("--site", default="testraum", help="Standortkennung fuer die Layout-Suche ohne --store/--layout (Standard: testraum)")
    parser.add_argument("--warmup", type=float, metavar="SEKUNDEN", help="Aufwaermphase fuer beide Pfade (Standard: App-Wert 1.2)")
    parser.add_argument("--shadow", action="store_true", help="shadow-Zeilen der Aufnahme direkt auswerten (ohne Swift, ohne Layout)")
    parser.add_argument("--replay", action="store_true", help="Replay erzwingen, auch wenn die Aufnahme shadow-Zeilen hat")
    parser.add_argument("--work-dir", type=Path, default=DEFAULT_WORK_DIR, metavar="DIR", help="Ausgabeordner (Standard: NavigationFixtures/exports/, gitignored)")
    args = parser.parse_args(argv)
    if args.store and args.layout:
        parser.error("--store und --layout schliessen sich aus")
    if args.shadow and args.replay:
        parser.error("--shadow und --replay schliessen sich aus")
    if args.warmup is not None and args.warmup < 0:
        parser.error("--warmup muss >= 0 sein")

    try:
        recording = args.recording or newest_incoming(DEFAULT_INCOMING)
        return compare(
            recording, store=args.store, layout=args.layout, site=args.site, work_dir=args.work_dir,
            warmup=args.warmup, refresh_layout=args.refresh_layout, runner=runner, fetcher=fetcher,
            mode="shadow" if args.shadow else ("replay" if args.replay else "auto"),
        )
    except AnalysisError as error:
        print(f"Fehler: {error}", file=sys.stderr)
        return error.code


if __name__ == "__main__":
    sys.exit(main())
