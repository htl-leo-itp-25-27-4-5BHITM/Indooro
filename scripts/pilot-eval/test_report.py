"""Tests für report.py: Team-Bericht, Markt-Bericht, SVG-Diagramme und Dateischreiben."""

import re
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from inputs import FieldRow, SurveyRow, Task, load_criteria, load_field, load_study, load_survey  # noqa: E402
from metrics import (  # noqa: E402
    METRIC_ORDER,
    VERDICT_MET,
    VERDICT_NO_DATA,
    VERDICT_NOT_MET,
    compute_all,
)
from report import (  # noqa: E402
    format_criterion,
    format_value,
    render_store_report,
    render_team_report,
    svg_success,
    svg_times,
    write_reports,
)

SAMPLES = HERE / "samples"
SVG_NS = "{http://www.w3.org/2000/svg}"
BASE = datetime(2026, 11, 1, 9, 0, tzinfo=timezone.utc)
CHARTS = {"Erfolg je Bedingung": "charts/success.svg", "Dauer gefundener Aufgaben": "charts/times.svg"}


def _task(test_id, session_id, task_no, condition, started, duration, outcome="gefunden",
          manual=None, reroute=None, stop=0, errors=0):
    return Task(
        test_id=test_id,
        session_id=session_id,
        store_code="SYNTH",
        task_no=task_no,
        product_id=9100,
        product_name="SYNTH Testprodukt",
        condition=condition,
        positioning_mode="mit_ortung" if condition == "app" else "-",
        started_at=started,
        ended_at=started + timedelta(seconds=duration),
        duration_s=float(duration),
        outcome=outcome,
        manual_position_count=manual,
        reroute_count=reroute,
        stop_change_without_event_count=stop,
        app_error_count=errors,
    )


def _pairs(count, app_outcome="gefunden"):
    """count Paare (mit App, ohne App); mit App ist jede Aufgabe schneller."""
    tasks = []
    for i in range(count):
        test_id = f"T{i + 1:02d}"
        session = f"s{i + 1}"
        start = BASE + timedelta(hours=i)
        tasks.append(_task(test_id, session, 1, "app", start, 60 + i, app_outcome, manual=1, reroute=0))
        tasks.append(_task(test_id, session, 2, "ohne_app", start + timedelta(minutes=5), 90 + i))
    return tasks


def _survey(count):
    return [SurveyRow(f"T{i + 1:02d}", (4, 4, 4, 4, 4), "") for i in range(count)]


def _field():
    return [FieldRow("Testraum", date(2026, 10, 20), "SYNTH iPhone A", 2.4, 4.6, 0.82, 1.2)]


def _criteria():
    return load_criteria(HERE / "criteria.json")


class TeamReportTest(unittest.TestCase):
    def setUp(self):
        self.criteria = _criteria()

    def _render(self, tasks, survey, field, staff_hours=None):
        results = compute_all(tasks, survey, field, self.criteria, staff_hours)
        text = render_team_report(results, tasks, survey, field, self.criteria, CHARTS)
        return results, text

    def test_header_has_criteria_version_and_source(self):
        _, text = self._render(_pairs(10), _survey(10), _field())
        self.assertIn("Pilot-Auswertung (Team)", text)
        self.assertIn("Kriterien-Version 1", text)
        self.assertIn(self.criteria["source"], text)

    def test_lists_all_ten_metric_labels(self):
        results, text = self._render(_pairs(10), _survey(10), _field())
        self.assertEqual(len(results), len(METRIC_ORDER))
        for result in results:
            self.assertIn(result.label, text)

    def test_shows_all_three_verdicts(self):
        # 10 Paare: Erfolg erfüllt; Feldreroutes 1,2 > 1 nicht erfüllt; Aufwand ohne Angabe zu wenig Daten.
        _, text = self._render(_pairs(10), _survey(10), _field())
        self.assertIn(VERDICT_MET, text)
        self.assertIn(VERDICT_NOT_MET, text)
        self.assertIn(VERDICT_NO_DATA, text)

    def test_small_sample_hint_for_few_pairs(self):
        _, text = self._render(_pairs(9), [], [])
        self.assertIn("n < 10: nur beschreibend", text)

    def test_no_small_sample_hint_with_ten_pairs(self):
        _, text = self._render(_pairs(10), _survey(10), _field())
        self.assertNotIn("n < 10: nur beschreibend", text)

    def test_disclaimer_always_present(self):
        _, text = self._render(_pairs(10), _survey(10), _field())
        self.assertIn("Kleine Stichprobe: rein beschreibend, keine Signifikanzaussage; Kriterien sind vorläufig", text)

    def test_missing_inputs_are_marked(self):
        _, text = self._render(_pairs(10), [], [])
        self.assertIn("Kein Fragebogen vorhanden.", text)
        self.assertIn("Keine Feldwerte vorhanden.", text)
        self.assertIn(VERDICT_NO_DATA, text)

    def test_charts_are_linked(self):
        _, text = self._render(_pairs(10), _survey(10), _field())
        self.assertIn("![Erfolg je Bedingung](charts/success.svg)", text)
        self.assertIn("![Dauer gefundener Aufgaben](charts/times.svg)", text)

    def test_rendering_is_deterministic(self):
        _, first = self._render(_pairs(10), _survey(10), _field(), staff_hours=1.5)
        _, second = self._render(_pairs(10), _survey(10), _field(), staff_hours=1.5)
        self.assertEqual(first, second)

    def test_criterion_and_value_formatting(self):
        results = compute_all(_pairs(10), _survey(10), _field(), self.criteria, None)
        by_id = {r.id: r for r in results}
        self.assertEqual(format_criterion(by_id["task_success"]), "≥ 90 %")
        self.assertEqual(format_value(by_id["task_success"]), "100 %")
        self.assertEqual(format_criterion(by_id["unjustified_stop_changes"]), "= 0")
        self.assertEqual(format_value(by_id["staff_hours"]), "–")


class StoreReportTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.criteria = _criteria()
        cls.tasks = load_study(SAMPLES / "study")
        cls.survey = load_survey(SAMPLES / "survey.csv")
        cls.field = load_field(SAMPLES / "field-summary.csv")
        cls.results = compute_all(cls.tasks, cls.survey, cls.field, cls.criteria, None)
        cls.text = render_store_report(cls.results, cls.tasks, cls.survey, cls.criteria)

    def test_length_limits(self):
        self.assertLessEqual(len(self.text.splitlines()), 55)
        self.assertLessEqual(len(self.text), 4500)

    def test_no_test_ids(self):
        self.assertIsNone(re.search(r"T\d{1,3}\b", self.text))

    def test_no_session_or_uuid(self):
        self.assertIsNone(re.search(
            r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", self.text
        ))

    def test_no_metric_ids_or_technical_terms(self):
        for metric_id in METRIC_ORDER:
            self.assertNotIn(metric_id, self.text)
        for word in ("Reroute", "p-Wert", "Vorzeichentest", "test_id", "median_"):
            self.assertNotIn(word, self.text)

    def test_plain_verdict_phrases(self):
        self.assertIn("Ziel erreicht.", self.text)
        self.assertIn("Ziel noch nicht erreicht.", self.text)

    def test_goal_count_excludes_field_metric(self):
        # Ohne Aufwandsangabe: 8 von 9 Zielen erfüllt; der Feldlauf zählt nicht mit.
        self.assertIn("8 von 9 Zielen erreicht, 1 noch offen.", self.text)
        self.assertIn("Noch zu wenig Daten für eine Aussage.", self.text)

    def test_small_sample_hint(self):
        self.assertIn("Die Zahl der Testpersonen ist klein", self.text)

    def test_rendering_is_deterministic(self):
        again = render_store_report(self.results, self.tasks, self.survey, self.criteria)
        self.assertEqual(self.text, again)


class SvgTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tasks = load_study(SAMPLES / "study")

    def _assert_svg(self, text):
        root = ET.fromstring(text)
        self.assertEqual(root.tag, SVG_NS + "svg")
        self.assertIsNotNone(root.find(SVG_NS + "title"))
        self.assertNotIn("href", text)
        self.assertNotIn("<image", text)
        self.assertNotIn("<script", text)

    def test_success_chart_is_wellformed(self):
        self._assert_svg(svg_success(self.tasks))

    def test_times_chart_is_wellformed(self):
        self._assert_svg(svg_times(self.tasks))

    def test_empty_data_shows_no_data_text(self):
        for render in (svg_success, svg_times):
            text = render([])
            self._assert_svg(text)
            self.assertIn("keine Daten", text)

    def test_charts_are_deterministic(self):
        self.assertEqual(svg_success(self.tasks), svg_success(list(self.tasks)))
        self.assertEqual(svg_times(self.tasks), svg_times(list(self.tasks)))

    def test_single_found_task_per_condition(self):
        tasks = [
            _task("T01", "s1", 1, "app", BASE, 42),
            _task("T01", "s1", 2, "ohne_app", BASE, 80),
        ]
        self._assert_svg(svg_times(tasks))
        self._assert_svg(svg_success(tasks))


class WriteReportsTest(unittest.TestCase):
    def test_writes_four_files(self):
        criteria = _criteria()
        tasks = _pairs(10)
        survey = _survey(10)
        field = _field()
        results = compute_all(tasks, survey, field, criteria, None)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "bericht"
            write_reports(out, results, tasks, survey, field, criteria)
            for name in ("report.md", "report-markt.md", "charts/success.svg", "charts/times.svg"):
                self.assertTrue((out / name).is_file(), name)
            for path in out.rglob("*"):
                if path.is_file():
                    self.assertNotIn(b"\r\n", path.read_bytes(), path.name)


if __name__ == "__main__":
    unittest.main()
