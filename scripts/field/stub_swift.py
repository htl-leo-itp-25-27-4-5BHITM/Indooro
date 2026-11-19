"""Ersatz fuer die beiden Swift-Schritte (`swift test` Replay, `swift run compare-positioning`) in Tests und Linux-CI.

Nur fuer Tests von `evaluate_field_day.py`. Die Zahlen sind erzeugt: Aus den Wahrheitsmarken einer Aufnahme wird je Weg
(aktuell, Engine) eine Position mit einem festen, glatten Fehler gebildet und mit den Definitionen aus
`tools/beacon-lab/docs/METRICS.md` ausgewertet (Perzentile Typ 7, Sprung = mehr als 2 m/s bei Paaren bis 2 s).
Das Ausgabeformat ist das von `compare-positioning` (`indooro-position-comparison/1`) und das von `NavigationReplay`.
Sie sagen nichts ueber die echte Pipeline. Der echte Lauf braucht macOS mit Swift.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence, Tuple

TICK_S = 0.35
WARMUP_S = 1.2
JUMP_SPEED_MPS = 2.0
PAIR_MAX_GAP_S = 2.0
TICK_HEADER = "t,truth_x,truth_y,est_x,est_y,proj_x,proj_y,confidence,beacons_used,route_rebuild,stop_change"


@dataclass(frozen=True)
class Profile:
    """Fehlerbild eines Weges: Groesse des Fehlers in Metern (ungefaehr der Median) und Ausfall jeder n-ten Epoche (0 = nie)."""

    scale: float
    outage_every: int = 0


def percentile(sorted_values: Sequence[float], q: float) -> float:
    """Typ 7 (wie R und numpy)."""
    h = (len(sorted_values) - 1) * q
    lower = int(math.floor(h))
    upper = min(lower + 1, len(sorted_values) - 1)
    return sorted_values[lower] + (h - lower) * (sorted_values[upper] - sorted_values[lower])


def read_records(path: Path) -> List[Dict[str, object]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def truth_at(truths: Sequence[Tuple[float, float, float]], t: float) -> Optional[Tuple[float, float]]:
    """Referenz: zwischen zwei Marken linear interpoliert, ausserhalb der ersten und letzten Marke keine."""
    if not truths or t < truths[0][0] or t > truths[-1][0]:
        return None
    for (t0, x0, y0), (t1, x1, y1) in zip(truths, truths[1:]):
        if t0 <= t <= t1:
            if t1 == t0 or (x0, y0) == (x1, y1):
                return (x0, y0)
            f = (t - t0) / (t1 - t0)
            return (x0 + (x1 - x0) * f, y0 + (y1 - y0) * f)
    return None


def epochs_for(records: Sequence[Dict[str, object]], profile: Profile, phase: float) -> List[Dict[str, object]]:
    times = [float(r["t"]) for r in records]
    truths = [(float(r["t"]), float(r["x"]), float(r["y"])) for r in records if r["type"] == "truth"]
    t0, t_end = min(times), max(times)
    rows: List[Dict[str, object]] = []
    tick = 0
    t = t0 + WARMUP_S
    while t <= t_end:
        truth = truth_at(truths, t)
        position: Optional[Tuple[float, float]] = None
        if truth is not None and not (profile.outage_every and tick % profile.outage_every == 0):
            magnitude = profile.scale * (1 + 0.4 * math.sin(2 * math.pi * t / 7.0 + phase))
            angle = 0.5 * t + phase
            position = (truth[0] + magnitude * math.cos(angle), truth[1] + magnitude * math.sin(angle))
        rows.append({"t": t, "truth": truth, "position": position})
        tick += 1
        t = t0 + WARMUP_S + tick * TICK_S
    return rows


def metrics(rows: Sequence[Dict[str, object]]) -> Dict[str, object]:
    with_truth = [r for r in rows if r["truth"] is not None]
    errors = sorted(
        math.hypot(r["position"][0] - r["truth"][0], r["position"][1] - r["truth"][1])  # type: ignore[index]
        for r in with_truth if r["position"] is not None
    )
    failed = sum(1 for r in with_truth if r["position"] is None)
    pairs = jumps = 0
    previous = None
    for r in rows:
        if r["position"] is not None and previous is not None:
            dt = r["t"] - previous["t"]  # type: ignore[operator]
            if 0 < dt <= PAIR_MAX_GAP_S:
                pairs += 1
                speed = math.hypot(r["position"][0] - previous["position"][0], r["position"][1] - previous["position"][1]) / dt  # type: ignore[index]
                jumps += 1 if speed > JUMP_SPEED_MPS else 0
        previous = r if r["position"] is not None else None
    n = len(with_truth)

    def v(value: Optional[float]) -> Optional[float]:
        return None if value is None else round(value, 6)

    return {
        "epochs": len(rows), "epochsWithTruth": n, "validEstimates": len(errors), "failedEstimates": failed,
        "outageRate": v(failed / n) if n else None,
        "median": v(percentile(errors, 0.5)) if errors else None,
        "p90": v(percentile(errors, 0.9)) if errors else None,
        "p95": v(percentile(errors, 0.95)) if errors else None,
        "pairs": pairs, "jumps": jumps, "jumpRate": v(jumps / pairs) if pairs else None,
    }


def comparison_document(path: Path, name: str, current: Profile, engine: Profile, records: Sequence[Dict[str, object]]) -> Dict[str, object]:
    session = next((r for r in records if r["type"] == "session"), None)
    origin = "synthetic" if path.name.startswith("synthetic-") else "field"
    return {
        "schema": "indooro-position-comparison/1",
        "origin": origin,
        "unit": "m",
        "recording": {
            "name": f"{name}.jsonl", "lines": len(records),
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        },
        "session": (
            {k: session.get(k) for k in ("schema", "app", "deviceModel", "os", "scenario", "role")} if session else None
        ),
        "summary": {
            "current": metrics(epochs_for(records, current, 0.0)),
            "engine": metrics(epochs_for(records, engine, 0.0)),
        },
        "warnings": ["STUB: erzeugte Zahlen aus stub_swift.py, keine Pipeline."],
    }


def make_compare_runner(profiles: Dict[str, Tuple[Profile, Profile]], default: Tuple[Profile, Profile], calls: Optional[List[str]] = None):
    """Gibt einen `CompareRunner` zurueck. `profiles` ist nach der Aufnahme (Name ohne Endung) geordnet."""

    def run(recording: Path, layout: Path, out_dir: Path, name: str, warmup: Optional[float]) -> int:
        if calls is not None:
            calls.append(name)
        current, engine = profiles.get(name, default)
        records = read_records(recording)
        if not any(r["type"] == "truth" for r in records):
            return 3
        document = comparison_document(recording, name, current, engine, records)
        (out_dir / f"{name}-comparison.json").write_text(json.dumps(document, sort_keys=True) + "\n", encoding="utf-8")
        (out_dir / f"{name}-comparison.txt").write_text("STUB\n", encoding="utf-8")
        return 0

    return run


def stub_replay_runner(recording: Path, layout: Path, work_dir: Path, name: str) -> Tuple[Path, Path]:
    """Tick-CSV und REPLAY-Zeile im Format von `NavigationReplay`."""
    records = read_records(recording)
    rows = epochs_for(records, Profile(1.0), 0.0)
    lines = [TICK_HEADER]
    for row in rows:
        marked = next(((r["x"], r["y"]) for r in records if r["type"] == "truth" and row["t"] <= float(r["t"]) < row["t"] + TICK_S), None)  # type: ignore[operator]
        truth = f"{marked[0]:.3f},{marked[1]:.3f}" if marked else ","
        position = row["position"]
        est = f"{position[0]:.3f},{position[1]:.3f}" if position else ","  # type: ignore[index]
        lines.append(f"{row['t']:.3f},{truth},{est},{est},0.900,3,0,0")
    ticks = work_dir / f"{name}-ticks.csv"
    ticks.write_text("\n".join(lines) + "\n", encoding="utf-8")
    replay = work_dir / f"{name}-replay.txt"
    replay.write_text(
        f"REPLAY {name} ticks={len(rows)} duration={len(rows) * TICK_S:.1f}s reroutes=0 reroutesPerMin=0.00 stopChanges=0 "
        "jumps=0 maxStep=0.10 lagMean=1.00 lagP95=2.00 offRouteDelays=[] lowConfToggles=0 planning=0x\n",
        encoding="utf-8",
    )
    return ticks, replay
