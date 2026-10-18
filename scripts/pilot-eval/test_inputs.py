"""Tests für inputs.py: Beispieldaten laden und Validierungsfehler melden."""

import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from inputs import (  # noqa: E402
    FIELD_COLUMNS,
    STUDY_COLUMNS,
    STUDY_OPTIONAL_COLUMNS,
    SURVEY_COLUMNS,
    InputError,
    load_criteria,
    load_field,
    load_study,
    load_survey,
)

SAMPLES = HERE / "samples"
STUDY_NAME = "study-T01-20261101-090000.csv"
EVENTS_NAME = "study-T01-20261101-090000.jsonl"

BASE_ROW = {
    "test_id": "T01",
    "session_id": "s-1",
    "store_code": "SYNTH",
    "task_no": "1",
    "product_id": "9100",
    "product_name": "SYNTH Testprodukt",
    "condition": "app",
    "positioning_mode": "mit_ortung",
    "started_at": "2026-11-01T09:00:00.000Z",
    "ended_at": "2026-11-01T09:01:00.000Z",
    "duration_s": "60.0",
    "outcome": "gefunden",
    "manual_position_count": "1",
    "reroute_count": "0",
    "stop_change_without_event_count": "0",
    "app_error_count": "0",
}
BASE_EVENT = {"sessionId": "s-1", "taskNo": 1, "testId": "T01", "t": "2026-11-01T09:00:00.000Z", "type": "taskStart"}


class SampleDataTest(unittest.TestCase):
    def test_study_sample_has_12_tests_and_48_tasks(self):
        tasks = load_study(SAMPLES / "study")
        self.assertEqual(len(tasks), 48)
        self.assertEqual(sorted({t.test_id for t in tasks}), [f"T{i:02d}" for i in range(1, 13)])
        for test_id in {t.test_id for t in tasks}:
            self.assertEqual(sum(t.test_id == test_id for t in tasks), 4)
        self.assertEqual(sum(t.condition == "app" for t in tasks), 24)

    def test_study_sample_order_alternates(self):
        tasks = load_study(SAMPLES / "study")
        first = {t.test_id: t.condition for t in tasks if t.task_no == 1}
        self.assertEqual(first["T01"], "app")
        self.assertEqual(first["T02"], "ohne_app")

    def test_study_sample_dash_is_none(self):
        tasks = load_study(SAMPLES / "study")
        for task in tasks:
            if task.condition == "ohne_app":
                self.assertEqual(task.positioning_mode, "-")
                self.assertIsNone(task.manual_position_count)
                self.assertIsNone(task.reroute_count)
                self.assertIsNone(task.stop_change_without_event_count)
        self.assertTrue(any(t.manual_position_count is None for t in tasks if t.condition == "app"))

    def test_survey_sample(self):
        rows = load_survey(SAMPLES / "survey.csv")
        self.assertEqual(len(rows), 12)
        self.assertEqual(sum(r.answers[0] >= 4 for r in rows), 8)

    def test_field_sample(self):
        rows = load_field(SAMPLES / "field-summary.csv")
        self.assertEqual(len(rows), 3)
        self.assertTrue(any(r.reroutes_per_tour <= 1 for r in rows))

    def test_criteria_sample(self):
        criteria = load_criteria(HERE / "criteria.json")
        self.assertEqual(criteria["version"], 1)
        self.assertEqual(len(criteria["metrics"]), 10)


class ValidationTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def _write(self, name, lines):
        path = self.dir / name
        with open(path, "w", encoding="utf-8", newline="") as fh:
            fh.write("\n".join(lines) + "\n")
        return path

    def _write_rows(self, name, header, rows):
        path = self.dir / name
        with open(path, "w", encoding="utf-8", newline="") as fh:
            writer = csv.writer(fh, lineterminator="\n")
            writer.writerow(header)
            writer.writerows(rows)
        return path

    def _study(self, *rows, header=STUDY_COLUMNS, events=None):
        """Schreibt eine Studien-CSV (Zeilen als Dicts, Basiswerte ergänzt) und optional JSONL."""
        body = []
        for row in rows:
            merged = {**BASE_ROW, **row}
            body.append([merged[c] for c in header])
        self._write_rows(STUDY_NAME, header, body)
        if events is not None:
            self._write(EVENTS_NAME, [json.dumps(e) for e in events])

    def _expect(self, message_part_list, call):
        with self.assertRaises(InputError) as ctx:
            call()
        message = str(ctx.exception)
        for part in message_part_list:
            self.assertIn(part, message)
        return message

    def test_valid_minimal_study(self):
        self._study({}, {"task_no": "2", "condition": "ohne_app", "positioning_mode": "-",
                         "manual_position_count": "-", "reroute_count": "-",
                         "stop_change_without_event_count": "-"})
        tasks = load_study(self.dir)
        self.assertEqual(len(tasks), 2)
        self.assertIsNone(tasks[1].reroute_count)
        self.assertEqual(tasks[0].reroute_count, 0)

    def test_arrival_columns_are_optional_but_known(self):
        self._study({"arrival_suggestion_shown_count": "2", "arrival_suggestion_accepted_count": "1",
                     "arrival_suggestion_rejected_count": "1"},
                    header=STUDY_COLUMNS + STUDY_OPTIONAL_COLUMNS)
        self.assertEqual(len(load_study(self.dir)), 1)
        self._study({"arrival_unknown_count": "1"}, header=STUDY_COLUMNS + ("arrival_unknown_count",))
        self._expect([STUDY_NAME, "arrival_unknown_count"], lambda: load_study(self.dir))

    def test_dash_gives_none(self):
        self._study({"manual_position_count": "-"})
        self.assertIsNone(load_study(self.dir)[0].manual_position_count)

    def test_fehlende_spalte(self):
        header = [c for c in STUDY_COLUMNS if c != "condition"]
        self._study(header=header)
        self._expect([STUDY_NAME, "Zeile 1", "condition"], lambda: load_study(self.dir))

    def test_unbekannter_enum_wert(self):
        self._study({"condition": "mit_app"})
        self._expect([STUDY_NAME, "Zeile 2", "mit_app"], lambda: load_study(self.dir))

    def test_name_statt_test_id_in_csv(self):
        self._study({}, {"test_id": "Max"})
        self._expect([STUDY_NAME, "Zeile 3", "ungültige Test-ID", "Max"], lambda: load_study(self.dir))

    def test_name_statt_test_id_in_survey(self):
        path = self._write(
            "survey.csv",
            [",".join(SURVEY_COLUMNS), "T01,4,4,4,4,4,", "Max,5,5,5,5,5,"],
        )
        self._expect([path.name, "Zeile 3", "Max"], lambda: load_survey(path))

    def test_name_statt_test_id_in_jsonl(self):
        self._study({}, events=[BASE_EVENT, {**BASE_EVENT, "testId": "Max"}])
        self._expect([EVENTS_NAME, "Zeile 2", "Max"], lambda: load_study(self.dir))

    def test_kaputte_zahl(self):
        self._study({"duration_s": "12,5"})
        self._expect([STUDY_NAME, "Zeile 2", "duration_s"], lambda: load_study(self.dir))

    def test_ended_vor_started(self):
        self._study({"ended_at": "2026-11-01T08:59:00.000Z"})
        self._expect([STUDY_NAME, "Zeile 2", "ended_at"], lambda: load_study(self.dir))

    def test_zeitstempel_ohne_utc(self):
        self._study({"started_at": "2026-11-01T09:00:00"})
        self._expect([STUDY_NAME, "Zeile 2", "started_at", "UTC"], lambda: load_study(self.dir))

    def test_duplikat(self):
        self._study({}, {})
        self._expect([STUDY_NAME, "Zeile 3", "doppelte Aufgabe"], lambda: load_study(self.dir))

    def test_negativer_zaehler(self):
        self._study({"reroute_count": "-1"})
        self._expect([STUDY_NAME, "Zeile 2", "reroute_count"], lambda: load_study(self.dir))

    def test_ungueltiger_jsonl_typ(self):
        self._study({}, events=[BASE_EVENT, {**BASE_EVENT, "type": "foo"}])
        self._expect([EVENTS_NAME, "Zeile 2", "foo"], lambda: load_study(self.dir))

    def test_jsonl_kein_json(self):
        self._study({}, events=[BASE_EVENT])
        self._write(EVENTS_NAME, [json.dumps(BASE_EVENT), "{kaputt"])
        self._expect([EVENTS_NAME, "Zeile 2"], lambda: load_study(self.dir))

    def test_leerer_ordner(self):
        self._expect([self.dir.name], lambda: load_study(self.dir))

    def test_survey_wert_6(self):
        path = self._write("survey.csv", [",".join(SURVEY_COLUMNS), "T01,4,6,4,4,4,"])
        self._expect([path.name, "Zeile 2", "q2"], lambda: load_survey(path))

    def test_survey_doppelte_test_id(self):
        path = self._write("survey.csv", [",".join(SURVEY_COLUMNS), "T01,4,4,4,4,4,", "T01,3,3,3,3,3,"])
        self._expect([path.name, "Zeile 3", "doppelte"], lambda: load_survey(path))

    def test_survey_falsche_kopfzeile(self):
        path = self._write("survey.csv", ["test_id,q1,q2,q3,q4,q5", "T01,4,4,4,4,4"])
        self._expect([path.name, "Zeile 1", "freitext"], lambda: load_survey(path))

    def test_field_anteil_1_5(self):
        path = self._write_rows(
            "field-summary.csv",
            FIELD_COLUMNS,
            [["Testraum", "2026-10-20", "iPhone", "2.4", "4.6", "1.5", "0.4"]],
        )
        self._expect([path.name, "Zeile 2", "correct_aisle_share"], lambda: load_field(path))

    def test_field_ungueltiges_datum(self):
        path = self._write_rows(
            "field-summary.csv",
            FIELD_COLUMNS,
            [["Testraum", "20.10.2026", "iPhone", "2.4", "4.6", "0.8", "0.4"]],
        )
        self._expect([path.name, "Zeile 2", "date"], lambda: load_field(path))

    def test_kaputtes_criteria_json(self):
        path = self._write("criteria.json", ["{", '"version" 1,'])
        self._expect([path.name, "Zeile 2", "ungültiges JSON"], lambda: load_criteria(path))

    def test_criteria_fehlende_metrik(self):
        criteria = json.loads((SAMPLES.parent / "criteria.json").read_text(encoding="utf-8"))
        del criteria["metrics"]["abort_rate"]
        path = self._write("criteria.json", [json.dumps(criteria)])
        self._expect([path.name, "abort_rate"], lambda: load_criteria(path))

    def test_criteria_falscher_operator(self):
        criteria = json.loads((SAMPLES.parent / "criteria.json").read_text(encoding="utf-8"))
        criteria["metrics"]["abort_rate"]["op"] = "=>"
        path = self._write("criteria.json", [json.dumps(criteria)])
        self._expect([path.name, "abort_rate", "op"], lambda: load_criteria(path))


if __name__ == "__main__":
    unittest.main()
