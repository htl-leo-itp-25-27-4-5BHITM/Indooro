"""Erzeugt die synthetischen Beispieldaten für scripts/pilot-eval (deterministisch, seed 42).

Nur Testdaten: keine echten Personen, Märkte oder Messwerte.
Aufruf: python3 -I scripts/pilot-eval/samples/make_samples.py
"""

import csv
import json
import random
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from inputs import FIELD_COLUMNS, STUDY_COLUMNS, SURVEY_COLUMNS  # noqa: E402

SEED = 42
STORE = "SYNTH"
TEST_IDS = [f"T{i:02d}" for i in range(1, 13)]
PRODUCTS = [
    "SYNTH Kokosraspeln 200 g",
    "SYNTH Sojasauce hell 500 ml",
    "SYNTH Miso-Paste weiß 300 g",
    "SYNTH Matcha-Pulver 80 g",
    "SYNTH Kichererbsenmehl 500 g",
    "SYNTH Tahin Glas 370 g",
    "SYNTH Rote Currypaste 400 g",
    "SYNTH Perlgraupen 500 g",
    "SYNTH Reiswaffeln Bio 100 g",
    "SYNTH Mandelmus 250 g",
    "SYNTH Bambussprossen Dose 225 g",
    "SYNTH Nori-Blätter 10 Stk",
]
NOTES = [
    "Regal war schwer zu finden",
    "Schild war verdeckt",
    "Ortung kurz gesprungen",
    "Produkt lag im falschen Fach",
]
FREITEXTE = [
    "Schnell gefunden, Karte war klar.",
    "",
    "Ortung war am Anfang unruhig.",
    "Hätte gern größere Schrift.",
    "Liste in Laufreihenfolge hilft.",
    "",
    "Personal hätte ich trotzdem gefragt.",
    "Route war gut, Abbiegen unklar.",
    "Sehr einfach zu bedienen.",
    "",
    "Regal-Angabe hat gereicht.",
    "Kurz gewartet, dann ok.",
]


def stamp(moment: datetime) -> str:
    return f"{moment:%Y-%m-%dT%H:%M:%S}.{moment.microsecond // 1000:03d}Z"


def build_tasks(rng: random.Random) -> list[dict]:
    """Erzeugt alle 48 Aufgaben mit Zeiten, Paarung und Ergebnis (Zähler folgen später)."""
    faster_flags = [True] * 17 + [False] * 7  # 17 von 24 Paaren: mit App schneller
    rng.shuffle(faster_flags)
    tasks: list[dict] = []
    pair_index = 0
    for i, test_id in enumerate(TEST_IDS, start=1):
        session_id = str(uuid.UUID(int=rng.getrandbits(128), version=4))
        order = (
            ["app", "ohne_app", "app", "ohne_app"]
            if i % 2 == 1
            else ["ohne_app", "app", "ohne_app", "app"]
        )
        products = rng.sample(range(len(PRODUCTS)), 2)
        cursor = datetime(2026, 11, 1 + (i - 1) // 3, 9 + 2 * ((i - 1) % 3), 0, 0)
        session_tasks = []
        for pair in range(2):
            ohne_duration = round(rng.uniform(55, 170), 1)
            if faster_flags[pair_index]:
                app_duration = round(ohne_duration * rng.uniform(0.45, 0.9), 1)
            else:
                app_duration = round(ohne_duration * rng.uniform(1.05, 1.35), 1)
            pair_index += 1
            durations = {"app": app_duration, "ohne_app": ohne_duration}
            for pos in range(2):
                k = 2 * pair + pos
                condition = order[k]
                if session_tasks:
                    cursor += timedelta(seconds=rng.randint(5, 30))
                start = cursor
                end = start + timedelta(milliseconds=round(durations[condition] * 1000))
                cursor = end
                session_tasks.append(
                    {
                        "test_id": test_id,
                        "session_id": session_id,
                        "task_no": k + 1,
                        "product_index": products[pair],
                        "condition": condition,
                        "start": start,
                        "end": end,
                        "duration": durations[condition],
                        "outcome": "gefunden",
                        "positioning": "-",
                        "counters": {
                            "manual": None,
                            "reroute": None,
                            "stop_change": None,
                            "app_error": 0,
                        },
                    }
                )
        tasks.extend(session_tasks)
    return tasks


def assign_app_details(rng: random.Random, tasks: list[dict]) -> None:
    """Verteilt Ergebnisse, Ortungsmodus und Zähler auf die 24 App-Aufgaben."""
    app_tasks = [t for t in tasks if t["condition"] == "app"]
    for task in app_tasks:
        task["positioning"] = "mit_ortung"

    # 22 gefunden, 1 hilfe, 1 abgebrochen (ca. 92 % gefunden bei App-Aufgaben)
    help_task, abort_task = rng.sample(app_tasks, 2)
    help_task["outcome"] = "hilfe"
    abort_task["outcome"] = "abgebrochen"

    # 4 Aufgaben im Modus ohne Ortung (Modus B): keine manuellen Korrekturen
    ohne_ortung = rng.sample(app_tasks, 4)
    for task in ohne_ortung:
        task["positioning"] = "ohne_ortung"
        task["counters"]["manual"] = 0

    remaining = [t for t in app_tasks if t["positioning"] == "mit_ortung"]
    manual_values = [1] * 12 + [2] * 5 + [3] * 3  # 20 Werte, Gesamtmedian 1
    rng.shuffle(manual_values)
    for task, value in zip(remaining, manual_values):
        task["counters"]["manual"] = value

    reroute_values = [0] * 10 + [1] * 9 + [2] * 5  # 24 Werte
    rng.shuffle(reroute_values)
    for task, value in zip(app_tasks, reroute_values):
        task["counters"]["reroute"] = value
        task["counters"]["stop_change"] = 0

    # Ein Fehler insgesamt
    rng.choice(app_tasks)["counters"]["app_error"] = 1
    # Zwei Zählerwerte "-" (nicht erfasst)
    free = [t for t in app_tasks if t["counters"]["manual"] not in (None, 0)]
    free[0]["counters"]["manual"] = None
    free[1]["counters"]["reroute"] = None

    for task in tasks:
        if task["condition"] == "ohne_app":
            task["counters"]["stop_change"] = None
            task["counters"]["manual"] = None
            task["counters"]["reroute"] = None
            task["counters"]["app_error"] = 0


def dash(value) -> str:
    return "-" if value is None else str(value)


def build_events(rng: random.Random, task: dict) -> list[dict]:
    """JSONL-Ereignisse einer Aufgabe, passend zu den Zählern."""
    base = {"sessionId": task["session_id"], "taskNo": task["task_no"], "testId": task["test_id"]}
    duration_ms = int(round(task["duration"] * 1000))
    events = [{**base, "t": stamp(task["start"]), "type": "taskStart"}]
    counters = task["counters"]

    def moment() -> str:
        return stamp(task["start"] + timedelta(milliseconds=rng.randint(1, duration_ms - 1)))

    for _ in range(counters["manual"] or 0):
        events.append({**base, "t": moment(), "type": "manualPosition"})
    for _ in range(counters["reroute"] or 0):
        events.append({**base, "t": moment(), "type": "reroute"})
    if counters["app_error"]:
        events.append({**base, "t": moment(), "type": "error", "message": "Synthetischer Testfehler"})
    if task["condition"] == "app" and rng.random() < 0.25:
        events.append({**base, "t": moment(), "type": "note", "text": rng.choice(NOTES)})
    events.sort(key=lambda e: e["t"])
    events.append(
        {
            **base,
            "t": stamp(task["end"]),
            "type": "taskEnd",
            "outcome": task["outcome"],
            "counters": {
                "manualPositionCount": counters["manual"],
                "rerouteCount": counters["reroute"],
                "stopChangeWithoutEventCount": counters["stop_change"],
                "appErrorCount": counters["app_error"],
            },
        }
    )
    return events


def write_csv(path: Path, header, rows) -> None:
    with open(path, "w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(header)
        writer.writerows(rows)


def write_study_files(rng: random.Random, tasks: list[dict], study_dir: Path) -> None:
    study_dir.mkdir(parents=True, exist_ok=True)
    for test_id in TEST_IDS:
        own = sorted((t for t in tasks if t["test_id"] == test_id), key=lambda t: t["task_no"])
        first_start = own[0]["start"]
        stem = f"study-{test_id}-{first_start:%Y%m%d-%H%M%S}"
        rows = []
        events: list[dict] = []
        for task in own:
            counters = task["counters"]
            product_index = task["product_index"]
            rows.append(
                [
                    test_id,
                    task["session_id"],
                    STORE,
                    str(task["task_no"]),
                    str(9100 + product_index),
                    PRODUCTS[product_index],
                    task["condition"],
                    task["positioning"],
                    stamp(task["start"]),
                    stamp(task["end"]),
                    f"{task['duration']:.1f}",
                    task["outcome"],
                    dash(counters["manual"]),
                    dash(counters["reroute"]),
                    dash(counters["stop_change"]),
                    str(counters["app_error"]),
                ]
            )
            events.extend(build_events(rng, task))
        write_csv(study_dir / f"{stem}.csv", STUDY_COLUMNS, rows)
        with open(study_dir / f"{stem}.jsonl", "w", encoding="utf-8", newline="\n") as fh:
            for event in events:
                fh.write(json.dumps(event, ensure_ascii=False) + "\n")


def write_survey(rng: random.Random, path: Path) -> None:
    strong = set(rng.sample(range(len(TEST_IDS)), 8))
    rows = []
    for index, test_id in enumerate(TEST_IDS):
        q1 = rng.choice([4, 5]) if index in strong else rng.choice([1, 2, 3])
        others = [rng.randint(2, 5) for _ in range(4)]
        rows.append([test_id, str(q1), *map(str, others), FREITEXTE[index]])
    write_csv(path, SURVEY_COLUMNS, rows)


def write_field(path: Path) -> None:
    rows = [
        ["Testraum", "2026-10-20", "SYNTH iPhone A", "2.4", "4.6", "0.82", "0.4"],
        ["Grosser Raum", "2026-10-27", "SYNTH iPhone B", "3.1", "5.8", "0.74", "1.2"],
        ["SYNTH-Markt", "2026-11-05", "SYNTH iPhone A", "2.8", "5.1", "0.78", "0.7"],
    ]
    write_csv(path, FIELD_COLUMNS, rows)


def main() -> None:
    rng = random.Random(SEED)
    tasks = build_tasks(rng)
    assign_app_details(rng, tasks)
    write_study_files(rng, tasks, HERE / "study")
    write_survey(rng, HERE / "survey.csv")
    write_field(HERE / "field-summary.csv")


if __name__ == "__main__":
    main()
