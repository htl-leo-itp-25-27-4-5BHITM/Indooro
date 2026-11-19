"""Tests fuer make_synthetic_recordings.py (Generalprobe des Feldtags)."""

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import check_recording_anonymized as checker  # noqa: E402
import make_synthetic_recordings as msr  # noqa: E402


def read(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


class GeneratorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.out = Path(self.tmp.name)

    def test_output_is_deterministic(self):
        first = msr.write_all(self.out / "a")
        second = msr.write_all(self.out / "b")
        for a, b in zip(first, second):
            self.assertEqual(a.read_bytes(), b.read_bytes(), a.name)

    def test_committed_layout_fixture_matches_the_generator(self):
        self.assertEqual(msr.LAYOUT_FIXTURE.read_text(encoding="utf-8"), msr.dump_layout(msr.build_layout()))

    def test_layout_is_the_test_room(self):
        layout = msr.build_layout()
        kinds = [e["type"] for e in layout["elements"]]
        self.assertEqual(layout["gridSize"], {"width": 5, "height": 9})
        self.assertEqual(kinds.count("shelf"), 8)
        self.assertEqual(kinds.count("beacon"), 4)

    def test_every_file_passes_the_anonymization_check(self):
        for path in msr.write_all(self.out):
            lines = checker.split_lines(path.read_text(encoding="utf-8"))
            self.assertEqual(checker.check_lines(lines), [], path.name)

    def test_files_are_rehearsal_not_synthetic_and_carry_a_session(self):
        for spec, path in zip(msr.RUN_SPECS, msr.write_all(self.out)):
            self.assertTrue(path.name.startswith(msr.REHEARSAL_PREFIX))
            first = read(path)[0]
            self.assertEqual(first["type"], "session")
            self.assertEqual(first["schema"], "indooro-recording/2")
            self.assertEqual(first["role"], spec.role)

    def test_three_good_evaluation_runs_have_enough_epochs_and_all_beacons(self):
        good = [s for s in msr.RUN_SPECS if s.role == "evaluation" and not s.silent_beacons]
        self.assertEqual(len(good), 3)
        paths = {p.name: p for p in msr.write_all(self.out)}
        for spec in good:
            records = read(paths[spec.name])
            truths = [r["t"] for r in records if r["type"] == "truth"]
            epochs = (max(truths) - min(truths)) / msr.TICK_S
            self.assertGreaterEqual(epochs, 150, spec.name)
            heard = {r["beacon"] for r in records if r["type"] == "measurement"}
            self.assertEqual(heard, {b[0] for b in msr.BEACONS})
            self.assertTrue(all("marker" in r for r in records if r["type"] == "truth"))

    def test_the_bad_run_never_hears_beacon_4_and_the_calibration_run_is_marked(self):
        paths = {p.name: p for p in msr.write_all(self.out)}
        bad = read(paths["rehearsal-eval-bad-beacon4.jsonl"])
        self.assertNotIn("Indooro4", {r.get("beacon") for r in bad})
        self.assertEqual(read(paths["rehearsal-calibration-1.jsonl"])[0]["role"], "calibration")


if __name__ == "__main__":
    unittest.main()
