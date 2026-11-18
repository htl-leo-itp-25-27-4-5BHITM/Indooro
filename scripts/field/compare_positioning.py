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
Exit: 0 fertig, 1 Anonymisierung oder Vergleich fehlgeschlagen, 2 Aufruf- oder Eingabefehler (Datei, Layout),
3 keine Epoche mit Referenz (keine Wahrheitsmarken): Positionen sind geschrieben, Kennzahlen fehlen.
"""

from __future__ import annotations

import argparse
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
) -> int:
    if not recording.is_file():
        raise AnalysisError(f"Aufnahme nicht gefunden: {recording}", 2)
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
    parser.add_argument("--work-dir", type=Path, default=DEFAULT_WORK_DIR, metavar="DIR", help="Ausgabeordner (Standard: NavigationFixtures/exports/, gitignored)")
    args = parser.parse_args(argv)
    if args.store and args.layout:
        parser.error("--store und --layout schliessen sich aus")
    if args.warmup is not None and args.warmup < 0:
        parser.error("--warmup muss >= 0 sein")

    try:
        recording = args.recording or newest_incoming(DEFAULT_INCOMING)
        return compare(
            recording, store=args.store, layout=args.layout, site=args.site, work_dir=args.work_dir,
            warmup=args.warmup, refresh_layout=args.refresh_layout, runner=runner, fetcher=fetcher,
        )
    except AnalysisError as error:
        print(f"Fehler: {error}", file=sys.stderr)
        return error.code


if __name__ == "__main__":
    sys.exit(main())
