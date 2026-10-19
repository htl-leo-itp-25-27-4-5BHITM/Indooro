"""Tests fuer analyze_walk.py und make_synthetic_walk.py. Der Replay ist ein Stub (kein swift test)."""

import contextlib
import io
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import analyze_walk as aw  # noqa: E402
import make_synthetic_walk as msw  # noqa: E402
import walk_report as wr  # noqa: E402
import check_recording_anonymized as checker  # noqa: E402

SYNTHETIC_DIR = msw.DEFAULT_OUT_DIR
SYNTHETIC_RECORDING = SYNTHETIC_DIR / msw.RECORDING_NAME
SYNTHETIC_LAYOUT = SYNTHETIC_DIR / msw.LAYOUT_NAME
HEADER = ",".join(wr.EXPECTED_TICK_HEADER)
REPLAY_LINE = "REPLAY stub ticks=3 duration=1.0s reroutes=0 reroutesPerMin=0.00 stopChanges=0 jumps=0 maxStep=0.10 lagMean=1.00 lagP95=2.00 offRouteDelays=[] lowConfToggles=0 planning=0x\n"


def stub_runner(calls):
    """Schreibt eine Tick-CSV mit zwei Truth-Gruppen an einer Stelle (Standzeit 40 s) und eine REPLAY-Zeile."""
    def run(recording, layout, work_dir, name):
        calls.append((recording, layout, name))
        rows = []
        t = 1_792_000_000.0
        for index in range(120):
            truth = "5.000,5.000" if index in (0, 1, 118, 119) else ","
            rows.append(f"{t + 0.35 * index:.3f},{truth},6.000,5.000,6.000,5.000,0.900,3,0,0")
        ticks = work_dir / f"{name}-ticks.csv"
        ticks.write_text(HEADER + "\n" + "\n".join(rows) + "\n", encoding="utf-8")
        replay = work_dir / f"{name}-replay.txt"
        replay.write_text(REPLAY_LINE, encoding="utf-8")
        return ticks, replay
    return run


class SyntheticFixtureTests(unittest.TestCase):
    def test_generator_is_deterministic_and_matches_committed_files(self):
        self.assertEqual(msw.dump_lines(msw.build_recording()), SYNTHETIC_RECORDING.read_text(encoding="utf-8"))
        self.assertEqual(msw.dump_layout(msw.build_layout()), SYNTHETIC_LAYOUT.read_text(encoding="utf-8"))
        self.assertEqual(msw.dump_lines(msw.build_recording()), msw.dump_lines(msw.build_recording()))

    def test_fixture_is_labelled_synthetic_and_passes_the_anonymization_check(self):
        self.assertTrue(aw.is_synthetic(SYNTHETIC_RECORDING))
        self.assertIn("SYNTHETISCH", SYNTHETIC_LAYOUT.read_text(encoding="utf-8"))
        text = SYNTHETIC_RECORDING.read_text(encoding="utf-8")
        self.assertEqual(checker.check_lines(checker.split_lines(text), allow_free_text=False), [])

    def test_fixture_has_the_walks_of_the_checklist(self):
        records = wr.parse_recording(SYNTHETIC_RECORDING.read_text(encoding="utf-8"))
        layout = aw.load_layout(SYNTHETIC_LAYOUT)
        self.assertEqual(len(wr.layout_beacons(layout)), 4)
        self.assertEqual(sum(1 for e in layout["elements"] if e["type"] == "shelf"), 8)
        visits = wr.truth_visits(records)
        standing = [v for v in visits if v.presses >= 2 and v.t_end - v.t_start >= 29]
        self.assertEqual(len(standing), 4, "30 s Stand an jedem der vier Beacons")
        self.assertGreaterEqual(len([v for v in visits if v.presses == 1]), 5, "Durchgaenge der Runde")
        self.assertTrue(any(r["type"] == "scan" for r in records), "fremder iBeacon als scan-Zeile")


class AnalyzeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def analyze(self, recording, runner=None, **options):
        calls = []
        defaults = dict(site="testraum", layout=SYNTHETIC_LAYOUT, markers=None, out=None, work_dir=self.tmp / "work",
                        min_window=20.0, position_source="est", runner=runner or stub_runner(calls))
        defaults.update(options)
        return aw.analyze(recording, **defaults), calls

    def test_synthetic_recording_report_is_labelled_and_complete(self):
        (path, report), calls = self.analyze(SYNTHETIC_RECORDING)
        self.assertEqual(path, self.tmp / "work" / "synthetic-testraum-2026-10-19-1-report.md")
        self.assertIn("SYNTHETISCH – keine Messung", report)
        self.assertIn("dürfen nicht als Feldergebnis", report)
        self.assertNotIn("echte Feldaufnahme", report)
        for heading in ("## Replay-Kennzahlen", "## Sprünge", "## Sichtbare Beacons je Position",
                        "## Beacons ohne Layout-Treffer", "## Auffälligkeiten", "## Positionsfehler und Gang (field_stats.py)"):
            self.assertIn(heading, report)
        self.assertIn(REPLAY_LINE.strip(), report)
        self.assertIn("Indooro1", report)
        self.assertIn("7-99", report)
        self.assertEqual(len(calls), 1)

    def test_replay_runs_on_the_anonymized_copy_not_the_original(self):
        _, calls = self.analyze(SYNTHETIC_RECORDING)
        replayed = calls[0][0]
        self.assertEqual(replayed, self.tmp / "work" / "synthetic-testraum-2026-10-19-1.anon.jsonl")
        self.assertTrue(replayed.is_file())

    def test_device_recording_is_not_labelled_synthetic_and_loses_shop_name(self):
        original = self.tmp / "2026-10-20T08-12-33Z.jsonl"
        lines = SYNTHETIC_RECORDING.read_text(encoding="utf-8").splitlines()
        lines[0] = '{"revision":1,"shopName":"Mein Markt","t":1792000000,"type":"layout"}'
        original.write_text("\n".join(lines) + "\n", encoding="utf-8")
        (path, report), calls = self.analyze(original)
        self.assertNotIn("SYNTHETISCH", report.split("\n", 1)[0])
        self.assertIn("echte Feldaufnahme", report)
        self.assertIn("- Datum: 2026-10-20", report)
        self.assertNotIn("Mein Markt", calls[0][0].read_text(encoding="utf-8"))
        self.assertIn("Mein Markt", original.read_text(encoding="utf-8"), "Original bleibt unveraendert")

    def test_recording_with_device_identifier_is_rejected_before_replay(self):
        bad = self.tmp / "bad.jsonl"
        bad.write_text('{"deviceName":"Annas iPhone","t":1,"type":"truth","x":1,"y":1}\n', encoding="utf-8")
        calls = []
        with self.assertRaises(aw.AnalysisError) as context:
            aw.analyze(bad, site="testraum", layout=SYNTHETIC_LAYOUT, markers=None, out=None, work_dir=self.tmp / "work",
                       min_window=20.0, position_source="est", runner=stub_runner(calls))
        self.assertEqual(context.exception.code, 1)
        self.assertIn("deviceName", str(context.exception))
        self.assertEqual(calls, [])
        self.assertFalse((self.tmp / "work" / "bad.anon.jsonl").exists())

    def test_missing_layout_gives_fetch_hint(self):
        original = self.tmp / "2026-10-20T08-12-33Z.jsonl"
        original.write_text(SYNTHETIC_RECORDING.read_text(encoding="utf-8"), encoding="utf-8")
        with self.assertRaises(aw.AnalysisError) as context:
            aw.analyze(original, site="no-such-site", layout=None, markers=None, out=None, work_dir=self.tmp / "work",
                       min_window=20.0, position_source="est", runner=stub_runner([]))
        self.assertEqual(context.exception.code, 2)
        self.assertIn("fetch_layout.py", str(context.exception))

    def test_layout_in_mobile_envelope_is_unwrapped_for_the_replay(self):
        import json
        envelope = self.tmp / "envelope.json"
        envelope.write_text(json.dumps({"layoutId": "L", "fallback": False, "layout": json.loads(SYNTHETIC_LAYOUT.read_text(encoding="utf-8"))}), encoding="utf-8")
        _, calls = self.analyze(SYNTHETIC_RECORDING, layout=envelope)
        replay_layout = json.loads(calls[0][1].read_text(encoding="utf-8"))
        self.assertIn("elements", replay_layout)
        self.assertNotIn("layout", replay_layout)

    def test_markers_file_names_the_stand_positions(self):
        markers = self.tmp / "site.md"
        markers.write_text("| Marker | x_m | y_m | Beschreibung |\n| --- | --- | --- | --- |\n| M1 | 5.0 | 5.0 | Mitte |\n", encoding="utf-8")
        (_, report), _ = self.analyze(SYNTHETIC_RECORDING, markers=markers)
        self.assertIn("| M1 | Mitte |", report)

    def test_silent_layout_beacon_and_wrong_strongest_are_flagged(self):
        text = SYNTHETIC_RECORDING.read_text(encoding="utf-8").replace('"beacon":"Indooro2"', '"beacon":"Indooro9"')
        original = self.tmp / "2026-10-20T08-12-33Z.jsonl"
        original.write_text(text, encoding="utf-8")
        (_, report), _ = self.analyze(original)
        self.assertIn("Layout-Beacons ohne eine einzige Messung: Indooro2", report)

    def test_newest_incoming(self):
        incoming = self.tmp / "incoming"
        with self.assertRaises(aw.AnalysisError) as context:
            aw.newest_incoming(incoming)
        self.assertEqual(context.exception.code, 2)
        incoming.mkdir()
        older, newer = incoming / "a.jsonl", incoming / "b.jsonl"
        older.write_text("x", encoding="utf-8")
        newer.write_text("y", encoding="utf-8")
        os.utime(older, (1, 1))
        os.utime(newer, (2, 2))
        self.assertEqual(aw.newest_incoming(incoming), newer)

    def test_main_prints_summary_and_exit_codes(self):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = aw.main([str(SYNTHETIC_RECORDING), "--layout", str(SYNTHETIC_LAYOUT), "--work-dir", str(self.tmp / "w"),
                            "--out", str(self.tmp / "r.md")], runner=stub_runner([]))
        self.assertEqual(code, 0)
        self.assertIn("Report geschrieben", out.getvalue())
        self.assertIn("REPLAY stub", out.getvalue())
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(err):
            self.assertEqual(aw.main([str(self.tmp / "missing.jsonl")], runner=stub_runner([])), 2)

    def test_wrapper_script_is_executable_and_calls_the_python_module(self):
        wrapper = Path(aw.__file__).with_name("analyze_walk.sh")
        self.assertTrue(os.access(wrapper, os.X_OK))
        self.assertIn("analyze_walk.py", wrapper.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
