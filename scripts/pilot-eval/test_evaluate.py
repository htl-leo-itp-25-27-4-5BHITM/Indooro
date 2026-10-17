"""Tests für evaluate.py: CLI-Aufrufe per Subprozess mit python -I und Exitcodes."""

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
EVALUATE = HERE / "evaluate.py"
SAMPLES = HERE / "samples"
REPORT_FILES = ("report.md", "report-markt.md", "charts/success.svg", "charts/times.svg")


def _run(*args):
    return subprocess.run(
        [sys.executable, "-I", str(EVALUATE), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )


def _sample_args(out):
    return [
        "--study", str(SAMPLES / "study"),
        "--survey", str(SAMPLES / "survey.csv"),
        "--field", str(SAMPLES / "field-summary.csv"),
        "--out", str(out),
    ]


class EvaluateCliTest(unittest.TestCase):
    def test_sample_data_writes_four_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "bericht"
            result = _run(*_sample_args(out), "--staff-hours", "1.5")
            self.assertEqual(result.returncode, 0, result.stderr)
            for name in REPORT_FILES:
                self.assertTrue((out / name).is_file(), name)
            self.assertIn("Berichte geschrieben nach", result.stdout)

    def test_sample_run_is_deterministic(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "bericht"
            first = _run(*_sample_args(out))
            self.assertEqual(first.returncode, 0, first.stderr)
            first_files = {name: (out / name).read_bytes() for name in REPORT_FILES}
            second = _run(*_sample_args(out))
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertEqual(first.stdout, second.stdout)
            for name in REPORT_FILES:
                self.assertEqual(first_files[name], (out / name).read_bytes(), name)
                self.assertNotIn(b"\r\n", first_files[name], name)

    def test_invalid_test_id_stops_and_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            lines = (SAMPLES / "survey.csv").read_text(encoding="utf-8").split("\n")
            self.assertTrue(lines[1].startswith("T01,"))
            lines[1] = lines[1].replace("T01", "Max", 1)
            bad_survey = tmp_path / "survey.csv"
            with open(bad_survey, "w", encoding="utf-8", newline="\n") as fh:
                fh.write("\n".join(lines))
            out = tmp_path / "bericht"
            result = _run(
                "--study", str(SAMPLES / "study"),
                "--survey", str(bad_survey),
                "--field", str(SAMPLES / "field-summary.csv"),
                "--out", str(out),
            )
            self.assertEqual(result.returncode, 1)
            self.assertIn("survey.csv", result.stderr)
            self.assertIn("Zeile 2", result.stderr)
            self.assertIn("Max", result.stderr)
            self.assertIn("Keine Berichte geschrieben.", result.stderr)
            self.assertFalse(out.exists() and any(out.iterdir()))

    def test_missing_study_is_usage_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = _run("--out", str(Path(tmp) / "bericht"))
            self.assertEqual(result.returncode, 2)
            self.assertIn("--study", result.stderr)

    def test_missing_input_file_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "bericht"
            result = _run(
                "--study", str(SAMPLES / "study"),
                "--survey", str(Path(tmp) / "fehlt.csv"),
                "--out", str(out),
            )
            self.assertEqual(result.returncode, 1)
            self.assertIn("fehlt.csv", result.stderr)
            self.assertFalse(out.exists())

    def test_optional_inputs_give_no_data_verdicts(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "bericht"
            result = _run("--study", str(SAMPLES / "study"), "--out", str(out))
            self.assertEqual(result.returncode, 0, result.stderr)
            text = (out / "report.md").read_text(encoding="utf-8")
            self.assertIn("zu wenig Daten", text)
            self.assertIn("Fragebogen: fehlt", text)

    def test_staff_hours_within_criterion(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "bericht"
            result = _run(*_sample_args(out), "--staff-hours", "1.5")
            self.assertEqual(result.returncode, 0, result.stderr)
            text = (out / "report.md").read_text(encoding="utf-8")
            rows = [line for line in text.splitlines() if line.startswith("| Aufwand Marktpersonal gesamt")]
            self.assertEqual(len(rows), 1)
            self.assertIn("1,5 Stunden gesamt", rows[0])
            self.assertTrue(rows[0].endswith("| erfüllt |"), rows[0])

    def test_staff_hours_with_comma_is_usage_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = _run(*_sample_args(Path(tmp) / "bericht"), "--staff-hours", "1,5")
            self.assertEqual(result.returncode, 2)


if __name__ == "__main__":
    unittest.main()
