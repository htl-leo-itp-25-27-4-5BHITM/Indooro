"""Tests für metrics.py: Kennzahlen mit kleinen, handgerechneten Eingaben und Verdikten."""

import copy
import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from inputs import (  # noqa: E402
    FieldRow,
    SurveyRow,
    Task,
    load_criteria,
    load_field,
    load_study,
    load_survey,
)
from metrics import (  # noqa: E402
    METRIC_ORDER,
    VERDICT_MET,
    VERDICT_NO_DATA,
    VERDICT_NOT_MET,
    Pair,
    compute_all,
    judge,
    pair_tasks,
    sign_test_p,
)

SAMPLES = HERE / "samples"
CRITERIA = load_criteria(HERE / "criteria.json")
BASE = datetime(2026, 11, 1, 9, 0, 0, tzinfo=timezone.utc)
_DEFAULT = object()


def make_task(
    test_id="T01",
    session_id="s-1",
    task_no=1,
    condition="app",
    outcome="gefunden",
    duration_s=60.0,
    start_s=None,
    manual=_DEFAULT,
    reroutes=_DEFAULT,
    stops=_DEFAULT,
    errors=0,
):
    """Baut eine Aufgabe. Zählerwerte sind bei App-Aufgaben 0, sonst None (wie im Export „-“)."""
    is_app = condition == "app"

    def pick(value, app_default):
        if value is _DEFAULT:
            return app_default if is_app else None
        return value

    start = BASE + timedelta(seconds=start_s if start_s is not None else task_no * 100)
    return Task(
        test_id=test_id,
        session_id=session_id,
        store_code="SYNTH",
        task_no=task_no,
        product_id=9100,
        product_name="SYNTH Testprodukt",
        condition=condition,
        positioning_mode="mit_ortung" if is_app else "-",
        started_at=start,
        ended_at=start + timedelta(seconds=duration_s),
        duration_s=duration_s,
        outcome=outcome,
        manual_position_count=pick(manual, 0),
        reroute_count=pick(reroutes, 0),
        stop_change_without_event_count=pick(stops, 0),
        app_error_count=errors,
    )


def pairs_from(specs):
    """specs: (test_id, app_dauer, ohne_dauer, app_ergebnis, ohne_ergebnis) je Test eine Sitzung."""
    tasks = []
    for index, (test_id, app_s, without_s, app_outcome, without_outcome) in enumerate(specs):
        offset = index * 1000
        tasks.append(make_task(test_id, "s-1", 1, "app", app_outcome, app_s, start_s=offset))
        tasks.append(
            make_task(test_id, "s-1", 2, "ohne_app", without_outcome, without_s, start_s=offset + 100)
        )
    return tasks


def results(tasks, survey=(), field=(), staff_hours=None, criteria=CRITERIA):
    return {r.id: r for r in compute_all(tasks, survey, field, criteria, staff_hours)}


def survey_rows(q1_values, q2=2, q3=4, q4=3, q5=5):
    return [
        SurveyRow(f"T{i + 1:02d}", (q1, q2, q3, q4, q5), "")
        for i, q1 in enumerate(q1_values)
    ]


def field_row(site="Testraum", reroutes=0.4, day=20):
    return FieldRow(
        site=site,
        date=date(2026, 10, day),
        device="SYNTH iPhone A",
        median_error_m=2.4,
        p90_error_m=4.6,
        correct_aisle_share=0.82,
        reroutes_per_tour=reroutes,
    )


class SignTestTest(unittest.TestCase):
    def test_seven_of_ten(self):
        self.assertAlmostEqual(sign_test_p(7, 3), 0.34375)

    def test_ten_of_ten_wins(self):
        self.assertAlmostEqual(sign_test_p(10, 0), 0.001953125)

    def test_no_pairs_gives_one(self):
        self.assertEqual(sign_test_p(0, 0), 1.0)

    def test_symmetric(self):
        self.assertEqual(sign_test_p(3, 7), sign_test_p(7, 3))

    def test_capped_at_one(self):
        self.assertEqual(sign_test_p(5, 5), 1.0)


class JudgeTest(unittest.TestCase):
    def test_no_value_is_no_data(self):
        self.assertEqual(judge(None, 50, ">=", 0.9, 10), VERDICT_NO_DATA)

    def test_equal_to_threshold_is_met(self):
        self.assertEqual(judge(0.9, 10, ">=", 0.9, 10), VERDICT_MET)

    def test_below_threshold_is_not_met(self):
        self.assertEqual(judge(0.8, 10, ">=", 0.9, 10), VERDICT_NOT_MET)

    def test_below_min_n_is_no_data(self):
        self.assertEqual(judge(1.0, 9, ">=", 0.9, 10), VERDICT_NO_DATA)

    def test_zero_tolerance_violation_counts_below_min_n(self):
        self.assertEqual(judge(1.0, 1, "==", 0, 5), VERDICT_NOT_MET)

    def test_zero_equality_met_and_below_min_n(self):
        self.assertEqual(judge(0.0, 5, "==", 0, 5), VERDICT_MET)
        self.assertEqual(judge(0.0, 4, "==", 0, 5), VERDICT_NO_DATA)

    def test_upper_bound_is_inclusive(self):
        self.assertEqual(judge(0.1, 10, "<=", 0.1, 10), VERDICT_MET)
        self.assertEqual(judge(0.2, 10, "<=", 0.1, 10), VERDICT_NOT_MET)


class PairTasksTest(unittest.TestCase):
    def test_alternating_order_pairs_each_two(self):
        tasks = [
            make_task(task_no=1, condition="app"),
            make_task(task_no=2, condition="ohne_app"),
            make_task(task_no=3, condition="app"),
            make_task(task_no=4, condition="ohne_app"),
        ]
        pairs = pair_tasks(tasks)
        self.assertEqual([(p.app.task_no, p.without.task_no) for p in pairs], [(1, 2), (3, 4)])
        self.assertTrue(all(p.app.condition == "app" for p in pairs))
        self.assertTrue(all(p.without.condition == "ohne_app" for p in pairs))

    def test_ohne_app_first_still_pairs_with_app_as_app(self):
        tasks = [make_task(task_no=1, condition="ohne_app"), make_task(task_no=2, condition="app")]
        pairs = pair_tasks(tasks)
        self.assertEqual(len(pairs), 1)
        self.assertEqual((pairs[0].app.task_no, pairs[0].without.task_no), (2, 1))

    def test_unpaired_rest_is_left_over(self):
        tasks = [
            make_task(task_no=1, condition="app"),
            make_task(task_no=2, condition="ohne_app"),
            make_task(task_no=3, condition="app"),
        ]
        pairs = pair_tasks(tasks)
        self.assertEqual([(p.app.task_no, p.without.task_no) for p in pairs], [(1, 2)])

    def test_two_equal_conditions_in_a_row_are_not_paired(self):
        tasks = [
            make_task(task_no=1, condition="app"),
            make_task(task_no=2, condition="app"),
            make_task(task_no=3, condition="ohne_app"),
            make_task(task_no=4, condition="ohne_app"),
        ]
        pairs = pair_tasks(tasks)
        self.assertEqual([(p.app.task_no, p.without.task_no) for p in pairs], [(2, 3)])

    def test_sessions_of_one_person_are_not_mixed(self):
        tasks = [
            make_task(session_id="s-1", task_no=1, condition="app", start_s=0),
            make_task(session_id="s-2", task_no=1, condition="ohne_app", start_s=5000),
        ]
        self.assertEqual(pair_tasks(tasks), [])

    def test_each_session_pairs_on_its_own(self):
        tasks = [
            make_task(session_id="s-1", task_no=1, condition="app", start_s=0),
            make_task(session_id="s-1", task_no=2, condition="ohne_app", start_s=100),
            make_task(session_id="s-2", task_no=1, condition="ohne_app", start_s=5000),
            make_task(session_id="s-2", task_no=2, condition="app", start_s=5100),
        ]
        pairs = pair_tasks(tasks)
        self.assertEqual(len(pairs), 2)
        self.assertEqual([p.app.session_id for p in pairs], ["s-1", "s-2"])
        self.assertEqual([p.app.task_no for p in pairs], [1, 2])

    def test_order_is_by_start_time_not_task_number(self):
        tasks = [
            make_task(task_no=1, condition="app", start_s=0),
            make_task(task_no=3, condition="ohne_app", start_s=100),
            make_task(task_no=2, condition="ohne_app", start_s=200),
            make_task(task_no=4, condition="app", start_s=300),
        ]
        pairs = pair_tasks(tasks)
        self.assertEqual(
            [(p.app.task_no, p.without.task_no) for p in pairs],
            [(1, 3), (4, 2)],
        )

    def test_output_is_deterministic_and_sorted_by_test_id(self):
        t2 = [make_task("T02", task_no=1, condition="app"), make_task("T02", task_no=2, condition="ohne_app")]
        t1 = [make_task("T01", task_no=1, condition="ohne_app"), make_task("T01", task_no=2, condition="app")]
        forward = pair_tasks(t2 + t1)
        backward = pair_tasks(list(reversed(t2 + t1)))
        self.assertEqual(forward, backward)
        self.assertEqual([p.test_id for p in forward], ["T01", "T02"])
        self.assertIsInstance(forward[0], Pair)


class TaskSuccessTest(unittest.TestCase):
    def test_nine_of_ten_is_met(self):
        tasks = [make_task(task_no=i + 1, outcome="gefunden" if i < 9 else "hilfe") for i in range(10)]
        r = results(tasks)["task_success"]
        self.assertAlmostEqual(r.value, 0.9)
        self.assertEqual(r.n, 10)
        self.assertEqual(r.verdict, VERDICT_MET)

    def test_eight_of_ten_is_not_met(self):
        tasks = [make_task(task_no=i + 1, outcome="gefunden" if i < 8 else "abgebrochen") for i in range(10)]
        r = results(tasks)["task_success"]
        self.assertAlmostEqual(r.value, 0.8)
        self.assertEqual(r.verdict, VERDICT_NOT_MET)

    def test_ohne_app_tasks_do_not_count(self):
        tasks = [make_task(task_no=i + 1, outcome="gefunden" if i < 9 else "hilfe") for i in range(10)]
        tasks += [make_task(task_no=i + 11, condition="ohne_app", outcome="hilfe") for i in range(10)]
        r = results(tasks)["task_success"]
        self.assertAlmostEqual(r.value, 0.9)
        self.assertEqual(r.n, 10)
        self.assertAlmostEqual(r.details["gefunden_anteil"]["ohne_app"], 0.0)
        self.assertEqual(r.details["ergebnisse"]["app"]["hilfe"], 1)

    def test_nine_app_tasks_are_no_data_but_value_kept(self):
        tasks = [make_task(task_no=i + 1) for i in range(9)]
        r = results(tasks)["task_success"]
        self.assertEqual(r.value, 1.0)
        self.assertEqual(r.n, 9)
        self.assertEqual(r.verdict, VERDICT_NO_DATA)
        self.assertIn("9 < 10", r.note)

    def test_no_app_tasks_gives_no_value(self):
        r = results([make_task(condition="ohne_app")])["task_success"]
        self.assertIsNone(r.value)
        self.assertEqual(r.verdict, VERDICT_NO_DATA)


class FasterShareTest(unittest.TestCase):
    def test_seven_of_ten_faster_is_met(self):
        specs = [("T%02d" % (i + 1), 50.0, 60.0, "gefunden", "gefunden") for i in range(7)]
        specs += [("T%02d" % (i + 8), 70.0, 60.0, "gefunden", "gefunden") for i in range(3)]
        r = results(pairs_from(specs))["faster_share"]
        self.assertAlmostEqual(r.value, 0.7)
        self.assertEqual(r.n, 10)
        self.assertEqual(r.verdict, VERDICT_MET)
        d = r.details
        self.assertEqual((d["wins"], d["losses"], d["ties"]), (7, 3, 0))
        self.assertAlmostEqual(d["p_sign"], 0.34375)
        self.assertEqual(d["median_app_s"], 50.0)
        self.assertEqual(d["median_without_s"], 60.0)
        self.assertEqual(d["median_diff_s"], 10.0)
        self.assertEqual((d["pairs_total"], d["pairs_excluded"]), (10, 0))

    def test_nine_pairs_are_no_data_with_descriptive_values(self):
        specs = [("T%02d" % (i + 1), 50.0, 60.0, "gefunden", "gefunden") for i in range(7)]
        specs += [("T%02d" % (i + 8), 70.0, 60.0, "gefunden", "gefunden") for i in range(2)]
        r = results(pairs_from(specs))["faster_share"]
        self.assertAlmostEqual(r.value, 7 / 9)
        self.assertEqual(r.n, 9)
        self.assertEqual(r.verdict, VERDICT_NO_DATA)
        self.assertEqual(r.note, "n = 9 < 10 Paare: nur beschreibend")
        self.assertIsNotNone(r.details["median_diff_s"])

    def test_ties_stay_in_denominator(self):
        specs = [("T%02d" % (i + 1), 50.0, 60.0, "gefunden", "gefunden") for i in range(5)]
        specs += [("T%02d" % (i + 6), 70.0, 60.0, "gefunden", "gefunden") for i in range(3)]
        specs += [("T%02d" % (i + 9), 60.0, 60.0, "gefunden", "gefunden") for i in range(2)]
        r = results(pairs_from(specs))["faster_share"]
        # 5 von 10 (Gleichstand im Nenner) = 0.5, nicht 5 von 8 = 0.625.
        self.assertAlmostEqual(r.value, 0.5)
        self.assertEqual(r.n, 10)
        self.assertEqual(r.verdict, VERDICT_NOT_MET)
        self.assertEqual((r.details["wins"], r.details["losses"], r.details["ties"]), (5, 3, 2))
        self.assertAlmostEqual(r.details["p_sign"], 0.7265625)

    def test_pair_with_unfound_task_is_excluded(self):
        specs = [("T01", 50.0, 60.0, "hilfe", "gefunden")]  # App-Aufgabe nicht gefunden
        specs += [("T%02d" % (i + 2), 50.0, 60.0, "gefunden", "gefunden") for i in range(6)]
        specs += [("T%02d" % (i + 8), 70.0, 60.0, "gefunden", "gefunden") for i in range(4)]
        r = results(pairs_from(specs))["faster_share"]
        self.assertEqual(r.details["pairs_total"], 11)
        self.assertEqual(r.details["pairs_excluded"], 1)
        self.assertEqual(r.n, 10)
        # Ohne den ausgeschlossenen Schnellen-Fall wäre es 6 von 10; mit ihm 7 von 11.
        self.assertAlmostEqual(r.value, 0.6)
        self.assertEqual(r.details["wins"], 6)
        self.assertEqual(r.verdict, VERDICT_MET)

    def test_without_unfound_partner_is_excluded_too(self):
        specs = [("T01", 50.0, 60.0, "gefunden", "abgebrochen")]
        r = results(pairs_from(specs))["faster_share"]
        self.assertEqual(r.n, 0)
        self.assertEqual(r.details["pairs_excluded"], 1)

    def test_no_usable_pairs_gives_no_medians(self):
        specs = [("T01", 50.0, 60.0, "hilfe", "gefunden")]
        r = results(pairs_from(specs))["faster_share"]
        self.assertIsNone(r.value)
        self.assertEqual(r.n, 0)
        self.assertEqual(r.verdict, VERDICT_NO_DATA)
        self.assertIsNone(r.details["median_app_s"])
        self.assertIsNone(r.details["median_diff_s"])
        self.assertEqual(r.details["p_sign"], 1.0)


class ManualCorrectionsTest(unittest.TestCase):
    def test_median_of_five_is_met(self):
        values = [1, 1, 2, 3, 4, None]
        tasks = [make_task(task_no=i + 1, manual=v) for i, v in enumerate(values)]
        r = results(tasks)["manual_corrections_median"]
        self.assertEqual(r.value, 2.0)
        self.assertEqual(r.n, 5)
        self.assertEqual(r.verdict, VERDICT_MET)
        self.assertEqual(r.details["ohne_wert"], 1)

    def test_median_above_two_is_not_met(self):
        tasks = [make_task(task_no=i + 1, manual=v) for i, v in enumerate([1, 2, 3, 4, 5])]
        r = results(tasks)["manual_corrections_median"]
        self.assertEqual(r.value, 3.0)
        self.assertEqual(r.verdict, VERDICT_NOT_MET)

    def test_four_values_are_no_data_but_median_shown(self):
        tasks = [make_task(task_no=i + 1, manual=v) for i, v in enumerate([1, 2, 3, 4, None, None])]
        r = results(tasks)["manual_corrections_median"]
        self.assertEqual(r.value, 2.5)
        self.assertEqual(r.n, 4)
        self.assertEqual(r.verdict, VERDICT_NO_DATA)

    def test_only_none_gives_no_value(self):
        tasks = [make_task(task_no=i + 1, manual=None) for i in range(6)]
        r = results(tasks)["manual_corrections_median"]
        self.assertIsNone(r.value)
        self.assertEqual(r.verdict, VERDICT_NO_DATA)


class StopChangesTest(unittest.TestCase):
    def test_five_zero_is_met(self):
        tasks = [make_task(task_no=i + 1, stops=0) for i in range(5)]
        r = results(tasks)["unjustified_stop_changes"]
        self.assertEqual(r.value, 0.0)
        self.assertEqual(r.n, 5)
        self.assertEqual(r.verdict, VERDICT_MET)

    def test_one_violation_among_five_is_not_met(self):
        tasks = [make_task(task_no=i + 1, stops=1 if i == 4 else 0) for i in range(5)]
        r = results(tasks)["unjustified_stop_changes"]
        self.assertEqual(r.value, 1.0)
        self.assertEqual(r.verdict, VERDICT_NOT_MET)
        self.assertEqual(r.details["touren_mit_zielwechsel"], 1)

    def test_one_violation_with_too_few_tours_is_not_met_with_note(self):
        tasks = [make_task(task_no=i + 1, stops=v) for i, v in enumerate([0, 0, 1])]
        r = results(tasks)["unjustified_stop_changes"]
        self.assertEqual(r.n, 3)
        self.assertEqual(r.verdict, VERDICT_NOT_MET)
        self.assertIn("ein Verstoß genügt", r.note)

    def test_zero_with_too_few_tours_is_no_data(self):
        tasks = [make_task(task_no=i + 1, stops=v) for i, v in enumerate([0, 0, 0, 0, None])]
        r = results(tasks)["unjustified_stop_changes"]
        self.assertEqual(r.value, 0.0)
        self.assertEqual(r.n, 4)
        self.assertEqual(r.verdict, VERDICT_NO_DATA)

    def test_only_none_counters_are_no_data(self):
        tasks = [make_task(task_no=i + 1, stops=None) for i in range(3)]
        r = results(tasks)["unjustified_stop_changes"]
        self.assertIsNone(r.value)
        self.assertEqual(r.n, 0)
        self.assertEqual(r.verdict, VERDICT_NO_DATA)


class FalseReroutesTest(unittest.TestCase):
    def test_mean_of_five_is_met(self):
        tasks = [make_task(task_no=i + 1, reroutes=v) for i, v in enumerate([0, 1, 1, 0, 1])]
        r = results(tasks)["false_reroutes_per_tour"]
        self.assertAlmostEqual(r.value, 0.6)
        self.assertEqual(r.n, 5)
        self.assertEqual(r.verdict, VERDICT_MET)

    def test_none_is_ignored_not_counted_as_zero(self):
        # Mittelwert ohne None: (2+0+2+1+1)/5 = 1.2; mit None als 0 wären es 1.0.
        tasks = [make_task(task_no=i + 1, reroutes=v) for i, v in enumerate([2, 0, 2, None, 1, 1])]
        r = results(tasks)["false_reroutes_per_tour"]
        self.assertAlmostEqual(r.value, 1.2)
        self.assertEqual(r.n, 5)
        self.assertEqual(r.verdict, VERDICT_NOT_MET)
        self.assertEqual(r.details["ohne_wert"], 1)

    def test_only_none_is_no_data(self):
        tasks = [make_task(task_no=i + 1, reroutes=None) for i in range(5)]
        r = results(tasks)["false_reroutes_per_tour"]
        self.assertIsNone(r.value)
        self.assertEqual(r.verdict, VERDICT_NO_DATA)


class AbortRateTest(unittest.TestCase):
    def test_one_of_ten_is_met(self):
        tasks = [make_task(task_no=i + 1, outcome="abgebrochen" if i == 0 else "gefunden") for i in range(10)]
        r = results(tasks)["abort_rate"]
        self.assertAlmostEqual(r.value, 0.1)
        self.assertEqual(r.verdict, VERDICT_MET)

    def test_two_of_ten_is_not_met(self):
        tasks = [make_task(task_no=i + 1, outcome="abgebrochen" if i < 2 else "gefunden") for i in range(10)]
        r = results(tasks)["abort_rate"]
        self.assertAlmostEqual(r.value, 0.2)
        self.assertEqual(r.verdict, VERDICT_NOT_MET)

    def test_nine_tasks_are_no_data(self):
        tasks = [make_task(task_no=i + 1) for i in range(9)]
        r = results(tasks)["abort_rate"]
        self.assertEqual(r.value, 0.0)
        self.assertEqual(r.verdict, VERDICT_NO_DATA)


class ReuseShareTest(unittest.TestCase):
    # q1 >= 4 bei sechs von zehn Personen (5,4,4,5,4,5); q1-Mittelwert 3.6.
    Q1_TEN = [5, 4, 4, 5, 4, 3, 2, 1, 5, 3]

    def test_six_of_ten_is_met(self):
        r = results([], survey=survey_rows(self.Q1_TEN))["reuse_share"]
        self.assertAlmostEqual(r.value, 0.6)
        self.assertEqual(r.n, 10)
        self.assertEqual(r.verdict, VERDICT_MET)
        self.assertEqual(r.details["wieder_nutzen"], 6)

    def test_question_means(self):
        r = results([], survey=survey_rows(self.Q1_TEN))["reuse_share"]
        means = r.details["question_means"]
        self.assertEqual(len(means), 5)
        for got, expected in zip(means, [3.6, 2.0, 4.0, 3.0, 5.0]):
            self.assertAlmostEqual(got, expected)

    def test_five_of_ten_is_not_met(self):
        r = results([], survey=survey_rows([5, 5, 4, 4, 4, 3, 2, 1, 1, 1]))["reuse_share"]
        self.assertAlmostEqual(r.value, 0.5)
        self.assertEqual(r.verdict, VERDICT_NOT_MET)

    def test_nine_people_are_no_data(self):
        r = results([], survey=survey_rows(self.Q1_TEN[:9]))["reuse_share"]
        self.assertAlmostEqual(r.value, 6 / 9)
        self.assertEqual(r.verdict, VERDICT_NO_DATA)

    def test_no_survey_gives_no_value(self):
        r = results([])["reuse_share"]
        self.assertIsNone(r.value)
        self.assertEqual(r.details["question_means"], [None] * 5)


class IncidentRateTest(unittest.TestCase):
    def app_tasks(self, errors):
        tasks = [make_task(task_no=i + 1, errors=e) for i, e in enumerate(errors)]
        return tasks

    def test_one_incident_in_twenty_tours_is_met(self):
        tasks = self.app_tasks([1] + [0] * 19)
        # Ein Vorfall bei einer Ohne-App-Aufgabe darf nicht zählen.
        tasks.append(make_task(task_no=99, condition="ohne_app", errors=5))
        r = results(tasks)["incident_rate"]
        self.assertAlmostEqual(r.value, 0.05)
        self.assertEqual(r.n, 20)
        self.assertEqual(r.verdict, VERDICT_MET)
        self.assertEqual(r.details["incidents"], 1)
        self.assertAlmostEqual(r.details["per_20_tours"], 1.0)

    def test_two_incidents_in_twenty_tours_is_not_met(self):
        r = results(self.app_tasks([2] + [0] * 19))["incident_rate"]
        self.assertAlmostEqual(r.value, 0.1)
        self.assertEqual(r.verdict, VERDICT_NOT_MET)
        self.assertAlmostEqual(r.details["per_20_tours"], 2.0)

    def test_nineteen_tours_are_no_data(self):
        r = results(self.app_tasks([0] * 19))["incident_rate"]
        self.assertEqual(r.value, 0.0)
        self.assertEqual(r.verdict, VERDICT_NO_DATA)


class StaffHoursTest(unittest.TestCase):
    def test_none_is_no_data(self):
        r = results([])["staff_hours"]
        self.assertIsNone(r.value)
        self.assertEqual(r.n, 0)
        self.assertEqual(r.verdict, VERDICT_NO_DATA)

    def test_one_and_a_half_hours_is_met(self):
        r = results([], staff_hours=1.5)["staff_hours"]
        self.assertEqual(r.value, 1.5)
        self.assertEqual(r.n, 1)
        self.assertEqual(r.verdict, VERDICT_MET)
        self.assertEqual(r.note, "")

    def test_three_hours_is_not_met(self):
        r = results([], staff_hours=3.0)["staff_hours"]
        self.assertEqual(r.value, 3.0)
        self.assertEqual(r.verdict, VERDICT_NOT_MET)


class FieldRerouteTest(unittest.TestCase):
    def test_maximum_is_taken_and_not_met(self):
        field = [field_row(reroutes=0.4), field_row("Grosser Raum", 1.2, 27), field_row(reroutes=0.7)]
        r = results([], field=field)["field_reroutes"]
        self.assertEqual(r.value, 1.2)
        self.assertEqual(r.n, 3)
        self.assertEqual(r.verdict, VERDICT_NOT_MET)
        self.assertEqual(len(r.details["rows"]), 3)
        self.assertEqual(r.details["rows"][1]["site"], "Grosser Raum")
        self.assertEqual(r.details["rows"][1]["date"], "2026-10-27")
        self.assertEqual(r.details["rows"][1]["reroutes_per_tour"], 1.2)

    def test_maximum_below_limit_is_met(self):
        field = [field_row(reroutes=0.4), field_row(reroutes=0.7)]
        r = results([], field=field)["field_reroutes"]
        self.assertEqual(r.value, 0.7)
        self.assertEqual(r.verdict, VERDICT_MET)

    def test_no_rows_is_no_data(self):
        r = results([], field=[])["field_reroutes"]
        self.assertIsNone(r.value)
        self.assertEqual(r.n, 0)
        self.assertEqual(r.verdict, VERDICT_NO_DATA)
        self.assertEqual(r.details["rows"], [])


class ComputeAllTest(unittest.TestCase):
    def setUp(self):
        self.tasks = load_study(SAMPLES / "study")
        self.survey = load_survey(SAMPLES / "survey.csv")
        self.field = load_field(SAMPLES / "field-summary.csv")

    def test_sample_gives_ten_results_in_order(self):
        results_list = compute_all(self.tasks, self.survey, self.field, CRITERIA)
        self.assertEqual([r.id for r in results_list], list(METRIC_ORDER))
        self.assertEqual(len(results_list), 10)
        for r in results_list:
            self.assertIn(r.verdict, {VERDICT_MET, VERDICT_NOT_MET, VERDICT_NO_DATA})
            self.assertIsInstance(r.details, dict)

    def test_sample_task_success_uses_24_tours(self):
        r = results(self.tasks, self.survey, self.field)["task_success"]
        self.assertEqual(r.n, 24)
        self.assertAlmostEqual(r.value, 22 / 24)
        self.assertEqual(r.verdict, VERDICT_MET)

    def test_sample_faster_share_pairs(self):
        r = results(self.tasks, self.survey, self.field)["faster_share"]
        self.assertEqual(r.details["pairs_total"], 24)
        self.assertEqual(r.details["pairs_excluded"], 2)
        self.assertEqual(r.n, 22)
        self.assertEqual((r.details["wins"], r.details["losses"]), (15, 7))
        self.assertAlmostEqual(r.value, 15 / 22)

    def test_sample_field_and_staff(self):
        results_map = results(self.tasks, self.survey, self.field)
        self.assertEqual(results_map["field_reroutes"].n, 3)
        self.assertAlmostEqual(results_map["field_reroutes"].value, 1.2)
        self.assertEqual(results_map["field_reroutes"].verdict, VERDICT_NOT_MET)
        self.assertEqual(results_map["staff_hours"].verdict, VERDICT_NO_DATA)

    def test_sample_reuse_share_counts_twelve_people(self):
        r = results(self.tasks, self.survey, self.field)["reuse_share"]
        self.assertEqual(r.n, 12)
        self.assertEqual(r.details["wieder_nutzen"], 8)

    def test_thresholds_come_from_criteria(self):
        criteria = copy.deepcopy(CRITERIA)
        criteria["metrics"]["task_success"]["value"] = 0.95
        tasks = [make_task(task_no=i + 1, outcome="gefunden" if i < 9 else "hilfe") for i in range(10)]
        r = results(tasks, criteria=criteria)["task_success"]
        self.assertEqual(r.threshold, 0.95)
        self.assertEqual(r.verdict, VERDICT_NOT_MET)

    def test_metadata_is_copied_from_criteria(self):
        r = results([])["faster_share"]
        metric = CRITERIA["metrics"]["faster_share"]
        self.assertEqual(r.label, metric["label"])
        self.assertEqual(r.unit, metric["unit"])
        self.assertEqual(r.n_unit, metric["n_unit"])
        self.assertEqual(r.op, metric["op"])
        self.assertEqual(r.min_n, metric["min_n"])
        self.assertEqual(r.threshold, float(metric["value"]))


if __name__ == "__main__":
    unittest.main()
