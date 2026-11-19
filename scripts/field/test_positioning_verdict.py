"""Tests fuer positioning_verdict.py (Entscheidungsregel, mechanisch)."""

import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import positioning_verdict as pv  # noqa: E402


def comparison(name, sha, role="evaluation", origin="field", current=None, engine=None, epochs=300):
    base = {"epochsWithTruth": epochs, "median": 2.0, "p90": 4.0, "outageRate": 0.02, "jumpRate": 0.03}
    return {
        "schema": pv.SCHEMA,
        "origin": origin,
        "recording": {"name": name, "sha256": sha},
        "session": {"role": role, "scenario": "S2"} if role else None,
        "summary": {"current": {**base, **(current or {})}, "engine": {**base, **(engine or {})}},
    }


class VerdictTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def write(self, index, data):
        path = Path(self.tmp.name) / f"run{index}-comparison.json"
        path.write_text(json.dumps(data), encoding="utf-8")
        return path

    def verdict(self, datas):
        paths = [self.write(i, d) for i, d in enumerate(datas)]
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = pv.main([str(p) for p in paths])
        self.assertEqual(code, 0)
        return out.getvalue()

    def runs(self, n, **kwargs):
        return [comparison(f"testraum-{i}.jsonl", f"{i:064d}", **kwargs) for i in range(n)]

    def test_fewer_than_three_runs_is_exploratory_even_if_the_engine_is_better(self):
        out = self.verdict(self.runs(2, engine={"median": 1.0, "p90": 2.0}))
        self.assertIn("ERGEBNIS: EXPLORATIV", out)
        self.assertIn("Noch nicht entscheiden", out)

    def test_engine_better_on_all_figures_passes_the_rule(self):
        out = self.verdict(self.runs(3, engine={"median": 1.5, "p90": 3.0}))
        self.assertIn("ERGEBNIS: BESSER", out)

    def test_better_median_but_higher_outage_rate_fails(self):
        out = self.verdict(self.runs(3, engine={"median": 1.5, "p90": 3.0, "outageRate": 0.05}))
        self.assertNotIn("ERGEBNIS: BESSER", out)
        self.assertIn("ERGEBNIS: GEMISCHT", out)

    def test_better_median_but_unchanged_p90_is_not_enough(self):
        out = self.verdict(self.runs(3, engine={"median": 1.5}))
        self.assertIn("ERGEBNIS: GEMISCHT", out)

    def test_identical_pipelines_are_equivalent_and_the_flag_stays_off(self):
        out = self.verdict(self.runs(3))
        self.assertIn("ERGEBNIS: GLEICHWERTIG", out)
        self.assertIn("Das Flag bleibt aus", out)

    def test_small_differences_inside_the_tolerance_are_equivalent(self):
        out = self.verdict(self.runs(3, engine={"median": 1.8, "p90": 3.8, "outageRate": 0.025, "jumpRate": 0.035}))
        self.assertIn("ERGEBNIS: GLEICHWERTIG", out)

    def test_rates_only_worse_is_worse_with_equal_errors(self):
        out = self.verdict(self.runs(3, engine={"outageRate": 0.04}))  # +2 pp outage, median and P90 equal
        self.assertIn("ERGEBNIS: SCHLECHTER", out)
        out = self.verdict(self.runs(3, engine={"jumpRate": 0.06}))
        self.assertIn("ERGEBNIS: SCHLECHTER", out)

    def test_worse_engine_is_worse(self):
        out = self.verdict(self.runs(3, engine={"median": 2.6}))
        self.assertIn("ERGEBNIS: SCHLECHTER", out)

    def test_one_run_with_a_clearly_worse_engine_blocks_the_rule(self):
        datas = self.runs(3, engine={"median": 1.2, "p90": 3.0})
        datas[2]["summary"]["engine"]["median"] = 2.5  # +0.5 m in one run, mean -0.37 m is still below -0.3
        out = self.verdict(datas)
        self.assertIn("ERGEBNIS: GEMISCHT", out)
        self.assertIn("In mindestens einem Lauf", out)

    def test_synthetic_calibration_and_unknown_role_runs_do_not_count(self):
        datas = self.runs(3, engine={"median": 1.0, "p90": 2.0})
        datas[0]["origin"] = "synthetic"
        datas[1]["session"]["role"] = "calibration"
        datas[2]["session"] = None
        out = self.verdict(datas)
        self.assertIn("Bewertungslaeufe gezaehlt: 0", out)
        self.assertIn("synthetisch", out)
        self.assertIn("calibration", out)
        self.assertIn("unbekannt", out)
        self.assertIn("ERGEBNIS: EXPLORATIV", out)

    def test_run_with_too_few_epochs_does_not_count(self):
        datas = self.runs(3, engine={"median": 1.0, "p90": 2.0}, epochs=99)
        self.assertIn("weniger als 100 Epochen", self.verdict(datas))

    def test_the_same_recording_twice_counts_once(self):
        datas = self.runs(3, engine={"median": 1.0, "p90": 2.0})
        datas[1]["recording"]["sha256"] = datas[0]["recording"]["sha256"]
        out = self.verdict(datas)
        self.assertIn("Bewertungslaeufe gezaehlt: 2", out)
        self.assertIn("Datenleck", out)

    def test_exactly_minus_zero_point_three_meter_passes_despite_float_noise(self):
        # 2.0 - 1.7 = 0.30000000000000004 in floating point; the document says "<= -0.3 m" passes.
        out = self.verdict(self.runs(3, engine={"median": 1.7, "p90": 3.7}))
        self.assertIn("ERGEBNIS: BESSER", out)

    def test_just_inside_the_tolerance_is_not_better(self):
        out = self.verdict(self.runs(3, engine={"median": 1.71, "p90": 3.71}))
        self.assertIn("ERGEBNIS: GLEICHWERTIG", out)

    def test_exactly_one_percentage_point_more_outage_is_still_allowed(self):
        out = self.verdict(self.runs(3, engine={"median": 1.5, "p90": 3.5, "outageRate": 0.03, "jumpRate": 0.04}))
        self.assertIn("ERGEBNIS: BESSER", out)

    def test_exactly_plus_and_minus_one_percentage_point_are_inside_the_tolerance(self):
        # Doc condition 4/5: "höchstens +1 Prozentpunkt" passes; a difference of exactly 1 pp counts as equal, in both directions.
        for engine in ({"outageRate": 0.03}, {"outageRate": 0.01}, {"jumpRate": 0.04}, {"jumpRate": 0.02}):
            out = self.verdict(self.runs(3, engine=engine))
            self.assertIn("ERGEBNIS: GLEICHWERTIG", out, engine)

    def test_just_beyond_one_percentage_point_is_outside_the_tolerance(self):
        self.assertIn("ERGEBNIS: SCHLECHTER", self.verdict(self.runs(3, engine={"outageRate": 0.0301})))
        self.assertIn("ERGEBNIS: GEMISCHT", self.verdict(self.runs(3, engine={"outageRate": 0.0099})))

    def test_recording_named_synthetic_never_counts_even_if_the_origin_claims_field(self):
        datas = self.runs(3, engine={"median": 1.0, "p90": 2.0})
        datas[0]["recording"]["name"] = "synthetic-testraum-1.jsonl"
        out = self.verdict(datas)
        self.assertIn("Bewertungslaeufe gezaehlt: 2", out)

    def test_rehearsal_recordings_are_not_field_runs_unless_explicitly_allowed(self):
        datas = [comparison(f"rehearsal-eval-{i}.jsonl", f"{i:064d}", engine={"median": 1.0, "p90": 2.0}) for i in range(3)]
        paths = [self.write(i, d) for i, d in enumerate(datas)]
        denied = pv.evaluate(paths)
        self.assertEqual(denied.verdict, "EXPLORATIV")
        self.assertEqual(len(denied.accepted), 0)
        self.assertIn("Probeaufnahme", denied.rejected[0][1])
        allowed = pv.evaluate(paths, allow_rehearsal=True)
        self.assertEqual(allowed.verdict, "BESSER")
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            pv.main([str(p) for p in paths] + ["--allow-rehearsal"])
        self.assertIn("ERGEBNIS: BESSER", out.getvalue())

    def test_criteria_name_each_failed_condition(self):
        paths = [self.write(i, d) for i, d in enumerate(self.runs(3, engine={"median": 1.5, "p90": 3.5, "outageRate": 0.05}))]
        result = pv.evaluate(paths)
        by_number = {c.number: c for c in pv.criteria(result.accepted, result.mean)}
        self.assertEqual([by_number[n].passed for n in (1, 2, 3, 4, 5)], [True, True, True, False, True])
        self.assertIn("Ausfallrate", by_number[4].text)

    def test_criteria_report_the_run_that_is_clearly_worse(self):
        datas = self.runs(3, engine={"median": 1.2, "p90": 3.0})
        datas[2]["summary"]["engine"]["median"] = 2.5
        result = pv.evaluate([self.write(i, d) for i, d in enumerate(datas)])
        median = {c.number: c for c in pv.criteria(result.accepted, result.mean)}[2]
        self.assertFalse(median.passed)
        self.assertIn("testraum-2.jsonl", median.text)

    def test_wrong_schema_is_an_input_error(self):
        path = self.write(0, {"schema": "other/1"})
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(pv.main([str(path)]), 2)


if __name__ == "__main__":
    unittest.main()
