"""Tests fuer den Schattenmodus: `shadow`-Zeilen -> `<name>-comparison.json` (compare_positioning.py) und die Kette im Feldtag."""

import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import check_recording_anonymized as chk  # noqa: E402
import compare_positioning as cp  # noqa: E402
import evaluate_field_day as efd  # noqa: E402
import make_synthetic_recordings as msr  # noqa: E402
import positioning_verdict as pv  # noqa: E402
import stub_swift as stub  # noqa: E402

LAYOUT = msr.LAYOUT_FIXTURE


def line(**fields):
    return json.dumps(fields, sort_keys=True)


class MetricsTest(unittest.TestCase):
    def test_errors_outage_and_jumps_are_per_path(self):
        truth = (0.0, 0.0)
        epochs = [
            (0.0, truth, (0.0, 1.0)),   # Fehler 1
            (1.0, truth, (0.0, 3.0)),   # Fehler 3, Sprung 2 m in 1 s = 2 m/s (nicht ueber 2)
            (2.0, truth, None),         # Ausfall
            (3.0, None, (9.0, 9.0)),    # ohne Referenz: zaehlt nie in den Fehlern
        ]
        metrics = cp.path_metrics(epochs)
        self.assertEqual(metrics["epochsWithTruth"], 3)
        self.assertEqual(metrics["validEstimates"], 2)
        self.assertAlmostEqual(metrics["outageRate"], 1 / 3, places=6)
        self.assertEqual(metrics["median"], 2.0)
        self.assertEqual(metrics["p90"], 2.8)
        self.assertEqual(metrics["pairs"], 2)  # (0 s, 1 s) und (1 s, 3 s): Abstand 2 s zaehlt noch
        self.assertEqual(metrics["jumps"], 1)  # nur der Sprung nach (9, 9)

    def test_truth_is_interpolated_and_held(self):
        lines = [
            {"type": "truth", "t": 0, "x": 0, "y": 0},
            {"type": "truth", "t": 10, "x": 10, "y": 0},
            {"type": "truth", "t": 20, "x": 10, "y": 0},
        ]
        markers, holds = cp.truth_track(lines)
        self.assertEqual(cp.truth_at(markers, holds, 5), (5.0, 0.0))
        self.assertEqual(cp.truth_at(markers, holds, 15), (10.0, 0.0))  # Standzeit
        self.assertIsNone(cp.truth_at(markers, holds, 25))
        self.assertIsNone(cp.truth_at(markers, holds, -1))


class ShadowFileTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def write(self, name, lines):
        path = self.root / name
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return path

    def sample(self):
        return [
            line(type="session", t=0, schema="indooro-recording/2", app="1.0 (1)", deviceModel="iPhone15,3", os="iOS 18.1",
                 scenario="S2", role="evaluation"),
            line(type="truth", t=0, x=0.5, y=0.5, marker="M1"),
            line(type="truth", t=10, x=0.5, y=0.5, marker="M1"),
            line(type="shadow", t=1, legacy={"x": 0.5, "y": 1.5, "status": "tracking"},
                 engine={"x": 0.5, "y": 0.75, "status": "tracking", "confidence": 0.9}),
            line(type="shadow", t=3, legacy={"status": "none"}, engine={"x": 0.5, "y": 1.5, "status": "lowConfidence", "confidence": 0.2}),
        ]

    def test_summary_schema_origin_and_session(self):
        data = cp.shadow_comparison_data(self.write("rehearsal-x.jsonl", self.sample()))
        self.assertEqual(data["schema"], "indooro-position-comparison/1")
        self.assertEqual(data["origin"], "shadow")
        self.assertEqual(data["session"]["role"], "evaluation")
        self.assertEqual(len(data["recording"]["sha256"]), 64)
        current, engine = data["summary"]["current"], data["summary"]["engine"]
        # t=1 ist die erste Zeile (Aufwaermphase 1,2 s ab ihr): nur t=3 zaehlt
        self.assertEqual((current["epochsWithTruth"], engine["epochsWithTruth"]), (1, 1))
        self.assertEqual(current["outageRate"], 1.0)
        self.assertEqual(engine["outageRate"], 0.0)
        self.assertEqual(engine["median"], 1.0)
        data0 = cp.shadow_comparison_data(self.write("rehearsal-x0.jsonl", self.sample()), warmup=0)
        self.assertEqual(data0["summary"]["current"]["epochsWithTruth"], 2)
        self.assertEqual(data0["summary"]["engine"]["median"], 0.625)  # Fehler 0,25 und 1,0

    def test_warmup_and_not_ready_epochs_drop_for_both_paths(self):
        lines = self.sample()[:3] + [
            line(type="shadow", t=1, legacy={"x": 0.5, "y": 0.5, "status": "tracking"}, engine={"status": "warmingUp"}),
            line(type="shadow", t=1.5, legacy={"x": 9, "y": 9, "status": "tracking"}, engine={"x": 9, "y": 9, "status": "tracking"}),
            line(type="shadow", t=2.4, legacy={"x": 0.5, "y": 0.5, "status": "tracking"}, engine={"status": "stopped"}),
            line(type="shadow", t=3, legacy={"x": 0.5, "y": 0.5, "status": "tracking"}, engine={"x": 0.5, "y": 1.5, "status": "tracking"}),
        ]
        data = cp.shadow_comparison_data(self.write("w.jsonl", lines))
        # t=1 (Aufwaermphase und warmingUp), t=1.5 (Aufwaermphase 1,2 s ab erster Zeile), t=2.4 (stopped) fallen weg
        self.assertEqual(data["excludedEpochs"], 3)
        self.assertEqual(data["summary"]["current"]["epochs"], data["summary"]["engine"]["epochs"])
        self.assertEqual(data["summary"]["current"]["epochs"], 1)
        self.assertEqual(data["summary"]["current"]["median"], 0.0)
        self.assertEqual(data["summary"]["engine"]["median"], 1.0)

    def test_recording_without_shadow_lines_is_not_shadow(self):
        path = self.write("a.jsonl", self.sample()[:3])
        self.assertFalse(cp.has_shadow_lines(path))
        self.assertIsNone(cp.write_shadow_comparison(path, self.root, "a"))
        with self.assertRaises(cp.AnalysisError):
            cp.shadow_comparison_data(path)

    def test_checker_accepts_shadow_and_rejects_free_text(self):
        self.assertEqual(chk.check_lines(self.sample()), [])
        bad = line(type="shadow", t=1, legacy={"status": "none", "name": "Erik"}, engine={"status": "tracking", "note": "x"})
        reasons = " ".join(v.reason for v in chk.check_lines([bad]))
        self.assertIn("name", reasons)
        self.assertIn("note", reasons)
        self.assertTrue(chk.check_lines([line(type="shadow", t=1, legacy={"status": "weird"}, engine={"status": "tracking"})]))

    def test_cli_shadow_mode_needs_no_swift_and_no_layout(self):
        recording = self.write("rehearsal-y.jsonl", self.sample())
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = cp.main([str(recording), "--work-dir", str(self.root / "w")],
                           runner=lambda *a: self.fail("kein Replay im Schattenmodus"))
        self.assertEqual(code, 0, err.getvalue())
        self.assertTrue((self.root / "w" / "rehearsal-y-comparison.json").is_file())
        self.assertIn("neu :", out.getvalue())

    def test_replay_flag_forces_the_replay(self):
        recording = self.write("rehearsal-z.jsonl", self.sample())
        calls = []

        def runner(anonymized, layout, out_dir, name, warmup):
            calls.append(name)
            return 0

        with contextlib.redirect_stderr(io.StringIO()):
            code = cp.main([str(recording), "--layout", str(LAYOUT), "--replay", "--work-dir", str(self.root / "w")], runner=runner)
        self.assertEqual((code, calls), (0, ["rehearsal-z"]))


class ShadowWithoutTruthTest(unittest.TestCase):
    def test_zero_truth_epochs_exclude_the_run_like_the_replay(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            recording = root / "rehearsal-eval-1.jsonl"
            recording.write_text(
                "\n".join([
                    line(type="session", t=0, schema="indooro-recording/2", app="1.0 (1)", deviceModel="iPhone15,3", os="iOS 18.1", role="evaluation"),
                    line(type="shadow", t=1, legacy={"x": 1, "y": 1, "status": "tracking"}, engine={"x": 1, "y": 1, "status": "tracking"}),
                    line(type="shadow", t=4, legacy={"x": 1, "y": 1, "status": "tracking"}, engine={"x": 1, "y": 1, "status": "tracking"}),
                ]) + "\n", encoding="utf-8")
            run = efd.Run(path=recording, name="rehearsal-eval-1", anonymized=recording)
            efd.process_run(
                run, layout=LAYOUT, site="testraum", markers=None, out_dir=root / "out",
                replay_runner=stub.stub_replay_runner, compare_runner=lambda *a: 1, shadow=efd.shadow_comparison,
            )
            self.assertIn("keine Epoche mit Referenz", run.excluded or "")
            self.assertIsNone(run.comparison_path)


class FieldDayWithShadowTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.incoming = self.root / "incoming"
        self.out = self.root / "out"
        msr.write_all(self.incoming, shadow=True)

    def test_synthetic_shadow_recordings_are_valid_and_labelled(self):
        for path in sorted(self.incoming.glob("*.jsonl")):
            lines = path.read_text(encoding="utf-8").splitlines()
            self.assertEqual(chk.check_lines(lines), [], path.name)
            self.assertTrue(any('"type":"shadow"' in text for text in lines), path.name)

    def test_field_day_uses_the_shadow_source_without_the_compare_runner(self):
        calls = []
        runner = stub.make_compare_runner({}, (stub.Profile(2.0), stub.Profile(2.0)), calls)
        out, err = io.StringIO(), io.StringIO()
        argv = [str(self.incoming), "--out", str(self.out), "--layout", str(LAYOUT), "--no-lab-import"]
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = efd.main(argv, replay_runner=stub.stub_replay_runner, compare_runner=runner)
        self.assertEqual(calls, [], err.getvalue())
        report = (self.out / "BERICHT.md").read_text(encoding="utf-8")
        self.assertIn("Quelle des Vergleichs: Schattenbetrieb", report)
        self.assertIn(code, (0, 2))  # Probelauf: Regel entscheidet, hier zaehlt nur die Kette

    def test_exploration_role_is_valid_but_never_counts(self):
        session = line(type="session", t=0, schema="indooro-recording/2", app="1.0 (1)", deviceModel="iPhone15,3",
                       os="iOS 18.1", role="exploration", shadowMode=True)
        self.assertEqual(chk.check_lines([session]), [])
        path = self.root / "rehearsal-eval-1-comparison.json"
        data = cp.shadow_comparison_data(self.incoming / "rehearsal-eval-1.jsonl")
        data["session"]["role"] = "exploration"
        path.write_text(json.dumps(data), encoding="utf-8")
        run, reason = pv.qualify(path, allow_rehearsal=True)
        self.assertIsNone(run)
        self.assertIn("exploration", reason)

    def test_verdict_accepts_shadow_origin_but_not_synthetic(self):
        path = self.root / "rehearsal-eval-1-comparison.json"
        data = cp.shadow_comparison_data(self.incoming / "rehearsal-eval-1.jsonl")
        path.write_text(json.dumps(data), encoding="utf-8")
        run, reason = pv.qualify(path, allow_rehearsal=True)
        self.assertIsNotNone(run, reason)
        data["origin"] = "synthetic"
        path.write_text(json.dumps(data), encoding="utf-8")
        self.assertIsNone(pv.qualify(path, allow_rehearsal=True)[0])


if __name__ == "__main__":
    unittest.main()
