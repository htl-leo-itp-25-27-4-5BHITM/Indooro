"""Tests fuer evaluate_field_day.py (Generalprobe des Feldtags).

Die beiden Swift-Schritte (Replay `swift test`, Vergleich `swift run compare-positioning`) sind durch `stub_swift.py`
ersetzt: Getestet werden Anonymisierung, Pruefung, Regel, Bericht, Kommentar, Lab-Uebergabe und Exit-Codes auf Linux
und macOS. Was nur auf macOS laeuft (echter Replay und Vergleich), deckt `scripts/field/README.md`
("Auswertung mit einem Befehl", Probelauf) ab und nicht dieser Test.
"""

import contextlib
import hashlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

import evaluate_field_day as efd  # noqa: E402
import make_synthetic_recordings as msr  # noqa: E402
import stub_swift as stub  # noqa: E402

LAYOUT = msr.LAYOUT_FIXTURE
EVAL = ("rehearsal-eval-1", "rehearsal-eval-2", "rehearsal-eval-3")
P = stub.Profile


def profiles(current, engines):
    """Je Bewertungslauf ein Profilpaar; `engines` ist eine Liste je Lauf."""
    return {name: (current, engine) for name, engine in zip(EVAL, engines)}


class FieldDayCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.incoming = self.root / "incoming"
        self.out = self.root / "out"
        msr.write_all(self.incoming)
        self.compare_calls = []

    def run_day(self, by_run, *, extra=None, shadow=None, default=(P(2.0), P(2.0)), lab=False):
        runner = stub.make_compare_runner(by_run, default, self.compare_calls)
        argv = [str(self.incoming), "--out", str(self.out), "--layout", str(LAYOUT)] + ([] if lab else ["--no-lab-import"]) + (extra or [])
        out, err = io.StringIO(), io.StringIO()
        kwargs = {"shadow": shadow} if shadow else {}
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = efd.main(argv, replay_runner=stub.stub_replay_runner, compare_runner=runner, **kwargs)
        return code, out.getvalue(), err.getvalue()

    def report(self):
        return (self.out / "BERICHT.md").read_text(encoding="utf-8")

    def comment(self):
        return (self.out / "KOMMENTAR_195.md").read_text(encoding="utf-8")


class VerdictCases(FieldDayCase):
    def test_engine_clearly_better_in_all_three_runs_is_better(self):
        code, out, _ = self.run_day(profiles(P(2.0), [P(1.4)] * 3))
        self.assertEqual(code, 0)
        self.assertIn("ERGEBNIS: BESSER", out)
        report = self.report()
        self.assertIn("**BESSER", report)
        self.assertIn("Bewertungsläufe gezählt: **3**", report)
        for number in range(1, 6):
            self.assertIn(f"Bedingung {number}: **erfüllt**", report)
        self.assertIn("PROBELAUF", report)
        self.assertIn("Ergebnis: BESSER", self.comment())
        self.assertIn("PROBELAUF", self.comment())

    def test_identical_pipelines_are_equivalent(self):
        code, out, _ = self.run_day(profiles(P(2.0), [P(2.0)] * 3))
        self.assertEqual(code, 0)
        self.assertIn("ERGEBNIS: GLEICHWERTIG", out)
        self.assertIn("Das Flag bleibt aus", self.report())
        self.assertIn("NICHT erfüllt", self.report())

    def test_fewer_than_three_evaluation_runs_is_exploratory_even_if_the_engine_is_better(self):
        (self.incoming / "rehearsal-eval-3.jsonl").unlink()
        code, out, _ = self.run_day(profiles(P(2.0), [P(1.0)] * 3))
        self.assertEqual(code, 0)
        self.assertIn("ERGEBNIS: EXPLORATIV", out)
        self.assertIn("EXPLORATIV – noch nicht entscheiden", self.report())
        self.assertIn("Bedingung 1: **NICHT erfüllt**", self.report())

    def test_a_worse_engine_is_a_valid_result_and_exits_zero(self):
        code, out, _ = self.run_day(profiles(P(2.0), [P(2.8)] * 3))
        self.assertEqual(code, 0)
        self.assertIn("ERGEBNIS: SCHLECHTER", out)
        self.assertIn("SCHLECHTER – Flag bleibt aus", self.report())

    def test_one_run_with_a_clearly_worse_engine_blocks_better_and_is_flagged(self):
        code, out, _ = self.run_day(profiles(P(2.0), [P(1.0), P(1.0), P(2.6)]))
        self.assertEqual(code, 0)
        self.assertIn("ERGEBNIS: GEMISCHT", out)
        report = self.report()
        self.assertIn("### Auffällige Läufe", report)
        self.assertIn("`rehearsal-eval-3.jsonl`: Engine klar schlechter", report)
        self.assertIn("Bedingung 2: **NICHT erfüllt**", report)


class InvalidRuns(FieldDayCase):
    def test_bad_and_calibration_runs_are_listed_with_reasons_and_do_not_count(self):
        code, out, _ = self.run_day(profiles(P(2.0), [P(1.4)] * 3))
        self.assertEqual(code, 0)
        report = self.report()
        self.assertIn("`rehearsal-eval-bad-beacon4.jsonl`: Beacons des Layouts nie gehört: Indooro4", report)
        self.assertIn("`rehearsal-calibration-1.jsonl`: Rolle ist calibration, nicht evaluation", report)
        self.assertIn("Bewertungsläufe gezählt: **3** (Minimum 3) von 5 Aufnahmen", report)
        self.assertIn("`rehearsal-calibration-1.jsonl`: Rolle ist calibration", self.comment())

    def test_the_same_recording_twice_counts_once(self):
        (self.incoming / "rehearsal-eval-3.jsonl").write_bytes((self.incoming / "rehearsal-eval-1.jsonl").read_bytes())
        code, out, _ = self.run_day(profiles(P(2.0), [P(1.0)] * 3))
        self.assertEqual(code, 0)
        self.assertIn("ERGEBNIS: EXPLORATIV", out)
        self.assertIn("Datenleck", self.report())

    def test_recording_without_truth_markers_is_listed_and_is_not_an_error(self):
        path = self.incoming / "rehearsal-eval-3.jsonl"
        lines = [l for l in path.read_text(encoding="utf-8").splitlines() if '"type":"truth"' not in l]
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        code, _, _ = self.run_day(profiles(P(2.0), [P(1.0)] * 3))
        self.assertEqual(code, 0)
        self.assertIn("`rehearsal-eval-3.jsonl`: keine Epoche mit Referenz", self.report())

    def test_a_recording_that_never_calls_itself_evaluation_is_not_counted(self):
        path = self.incoming / "rehearsal-eval-2.jsonl"
        lines = path.read_text(encoding="utf-8").splitlines()
        lines = [l for l in lines if '"type":"session"' not in l]
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        code, out, _ = self.run_day(profiles(P(2.0), [P(1.0)] * 3))
        self.assertEqual(code, 0)
        self.assertIn("ERGEBNIS: EXPLORATIV", out)
        self.assertIn("Rolle ist unbekannt", self.report())


class Safety(FieldDayCase):
    def test_anonymization_failure_aborts_before_anything_is_evaluated(self):
        path = self.incoming / "rehearsal-eval-2.jsonl"
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps({"type": "measurement", "t": 1.0, "source": "ranging", "beacon": "Indooro1", "rssi": -60, "deviceName": "Max iPhone"}) + "\n")
        code, _, err = self.run_day(profiles(P(2.0), [P(1.0)] * 3))
        self.assertEqual(code, 1)
        self.assertIn("rehearsal-eval-2.jsonl", err)
        self.assertEqual(self.compare_calls, [])
        self.assertFalse((self.out / "BERICHT.md").exists())

    def test_stale_anonymized_and_lab_files_from_an_earlier_run_are_cleared(self):
        for folder in ("anonymized", "lab-import/recordings"):
            (self.out / folder).mkdir(parents=True)
            (self.out / folder / "alt.jsonl").write_text("{}\n", encoding="utf-8")
        keep = self.out / "mein-notizen.txt"
        keep.write_text("bleibt", encoding="utf-8")
        self.run_day(profiles(P(2.0), [P(1.4)] * 3))
        self.assertFalse((self.out / "anonymized" / "alt.jsonl").exists())
        self.assertFalse((self.out / "lab-import").exists())
        self.assertTrue(keep.exists())

    def test_originals_are_never_modified(self):
        before = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in self.incoming.glob("*.jsonl")}
        self.run_day(profiles(P(2.0), [P(1.4)] * 3))
        after = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in self.incoming.glob("*.jsonl")}
        self.assertEqual(before, after)

    def test_a_failing_tool_exits_one_but_still_writes_the_report(self):
        def broken(recording, layout, out_dir, name, warmup):
            return 7

        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = efd.main([str(self.incoming), "--out", str(self.out), "--layout", str(LAYOUT), "--no-lab-import"],
                            replay_runner=stub.stub_replay_runner, compare_runner=broken)
        self.assertEqual(code, 1)
        self.assertIn("Fehler in rehearsal-eval-1.jsonl", err.getvalue())
        self.assertIn("EXPLORATIV", self.report())
        self.assertIn("Fehler und Hinweise der Werkzeuge", self.report())

    def test_missing_directory_and_empty_directory_are_input_errors(self):
        for target in (self.root / "nope", self.root / "empty"):
            (self.root / "empty").mkdir(exist_ok=True)
            err = io.StringIO()
            with contextlib.redirect_stderr(err):
                code = efd.main([str(target), "--out", str(self.out), "--layout", str(LAYOUT)],
                                replay_runner=stub.stub_replay_runner, compare_runner=stub.make_compare_runner({}, (P(1), P(1))))
            self.assertEqual(code, 2, target)

    def test_without_swift_the_real_run_stops_with_a_clear_message(self):
        err = io.StringIO()
        with mock.patch.object(efd, "swift_available", return_value=(False, "`swift` nicht gefunden.")), contextlib.redirect_stderr(err):
            code = efd.main([str(self.incoming), "--out", str(self.out), "--layout", str(LAYOUT)])
        self.assertEqual(code, 2)
        self.assertIn("swift", err.getvalue())


class Hooks(FieldDayCase):
    def test_shadow_hook_replaces_the_replay_comparison(self):
        def shadow(recording, anonymized, out_dir, name):
            records = stub.read_records(anonymized)
            if not any(r["type"] == "session" and r.get("role") == "evaluation" for r in records):
                return None
            document = stub.comparison_document(anonymized, name, P(2.0), P(1.0), records)
            target = out_dir / f"{name}-comparison.json"
            target.write_text(json.dumps(document), encoding="utf-8")
            return target

        code, out, _ = self.run_day({}, shadow=shadow)
        self.assertEqual(code, 0)
        self.assertIn("ERGEBNIS: BESSER", out)
        self.assertIn("Quelle des Vergleichs: Schattenbetrieb", self.report())
        # Replay-Vergleich lief nur fuer die Kalibrierungsaufnahme, bei der der Hook None lieferte.
        self.assertEqual(self.compare_calls, ["rehearsal-calibration-1"])

    def test_default_shadow_hook_does_nothing(self):
        self.assertIsNone(efd.shadow_comparison(Path("a.jsonl"), Path("b.jsonl"), Path("."), "a"))

    def test_a_crashing_shadow_hook_does_not_stop_the_day(self):
        def shadow(recording, anonymized, out_dir, name):
            raise RuntimeError("kaputt")

        code, out, err = self.run_day(profiles(P(2.0), [P(1.4)] * 3), shadow=shadow)
        self.assertEqual(code, 1)
        self.assertIn("Schatten-Hook fehlgeschlagen", err)
        self.assertTrue((self.out / "BERICHT.md").exists())

    def test_lab_import_copies_recordings_and_comparisons(self):
        code, _, _ = self.run_day(profiles(P(2.0), [P(1.4)] * 3), lab=True)
        self.assertEqual(code, 0)
        lab = self.out / "lab-import"
        names = sorted(p.name for p in (lab / "recordings").glob("*.jsonl"))
        self.assertEqual(len(names), 5)
        self.assertTrue(all(n.startswith("rehearsal-testraum-") for n in names), names)
        self.assertEqual(len(list((lab / "comparisons").glob("*-comparison.json"))), 5)
        self.assertIn("lab-import", self.report())

    def test_lab_import_can_be_skipped_and_skips_gracefully_without_the_lab(self):
        self.run_day(profiles(P(2.0), [P(1.4)] * 3))
        self.assertFalse((self.out / "lab-import").exists())
        self.assertIn("Übersprungen (--no-lab-import)", self.report())
        with mock.patch.object(efd, "LAB_DIR", self.root / "fehlt"):
            code, _, _ = self.run_day(profiles(P(2.0), [P(1.4)] * 3), lab=True)
        self.assertEqual(code, 0)
        self.assertFalse((self.out / "lab-import").exists())
        self.assertIn("nicht vorhanden", self.report())

    def test_test_resources_are_found_in_either_layout(self):
        old, new = self.root / "old", self.root / "new"
        with mock.patch.object(efd, "TEST_RESOURCE_CANDIDATES", (old, new)):
            self.assertIsNone(efd.existing_test_resources())
            new.mkdir()
            self.assertEqual(efd.existing_test_resources(), new)
            old.mkdir()
            self.assertEqual(efd.existing_test_resources(), old)


class ReportContent(FieldDayCase):
    def test_per_run_table_has_the_requested_columns_and_german_numbers(self):
        self.run_day(profiles(P(2.0), [P(1.4)] * 3))
        report = self.report()
        for header in ("Epochen mit Referenz", "Median (m)", "P90 (m)", "Ausfall (%)", "Sprung (%)", "Δ Median (m)", "Mittel über die Läufe"):
            self.assertIn(header, report)
        self.assertRegex(report, r"\d,\d\d / \d,\d\d")  # Dezimalkomma
        self.assertNotIn("nan", report.lower())

    def test_comment_is_ready_to_paste(self):
        self.run_day(profiles(P(2.0), [P(1.4)] * 3))
        comment = self.comment()
        self.assertTrue(comment.startswith("## Auswertung Feldtag Testraum"))
        self.assertIn("Es wird nichts eingeschaltet", comment)
        self.assertIn("| Lauf |", comment)

    def test_probe_runs_are_marked_at_the_top_of_verdict_and_stdout(self):
        code, out, _ = self.run_day(profiles(P(2.0), [P(1.4)] * 3))
        self.assertTrue(out.startswith("PROBELAUF"), out[:80])
        self.assertTrue((self.out / "VERDICT.txt").read_text(encoding="utf-8").startswith("PROBELAUF"))

    def test_per_run_reports_and_verdict_text_are_written(self):
        self.run_day(profiles(P(2.0), [P(1.4)] * 3))
        for name in EVAL:
            self.assertTrue((self.out / "reports" / f"{name}-report.md").is_file(), name)
        self.assertIn("ERGEBNIS:", (self.out / "VERDICT.txt").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
