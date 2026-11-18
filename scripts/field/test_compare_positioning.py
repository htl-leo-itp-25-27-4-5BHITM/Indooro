"""Tests fuer compare_positioning.py. Der Swift-Vergleich und der Netzzugriff sind Stubs."""

import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import compare_positioning as cp  # noqa: E402
import make_synthetic_walk as msw  # noqa: E402

SYNTHETIC_RECORDING = msw.DEFAULT_OUT_DIR / msw.RECORDING_NAME
SYNTHETIC_LAYOUT = msw.DEFAULT_OUT_DIR / msw.LAYOUT_NAME


def run_main(argv, runner, fetcher=None):
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = cp.main(argv, runner=runner, fetcher=fetcher or (lambda args: 99))
    return code, out.getvalue(), err.getvalue()


class CompareTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.work = Path(self.tmp.name) / "work"
        self.calls = []

    def runner(self, code=0):
        def run(recording, layout, out_dir, name, warmup):
            self.calls.append((recording, layout, out_dir, name, warmup))
            return code
        return run

    def test_synthetic_recording_finds_its_layout_and_passes_an_anonymized_copy(self):
        code, _, err = run_main([str(SYNTHETIC_RECORDING), "--work-dir", str(self.work)], self.runner())
        self.assertEqual(code, 0)
        recording, layout, out_dir, name, warmup = self.calls[0]
        self.assertEqual(layout, SYNTHETIC_LAYOUT)
        self.assertEqual(recording, self.work / f"{name}.anon.jsonl")
        self.assertTrue(recording.is_file())
        self.assertTrue(name.startswith("synthetic-"), "the name keeps the synthetic prefix so the tool labels the result")
        self.assertIsNone(warmup)
        self.assertIn("synthetische Aufnahme", err)

    def test_store_uses_a_cached_layout_without_network(self):
        layouts = Path(self.tmp.name) / "layouts"
        layouts.mkdir()
        cached = layouts / "spar-leonding-002.json"
        cached.write_text(SYNTHETIC_LAYOUT.read_text(encoding="utf-8"), encoding="utf-8")
        fetched = []
        result = cp.compare(
            SYNTHETIC_RECORDING, store="SPAR-Leonding-002", layout=None, site="testraum", work_dir=self.work,
            runner=self.runner(), fetcher=lambda args: fetched.append(args) or 0, layouts_dir=layouts,
        )
        self.assertEqual(result, 0)
        self.assertEqual(fetched, [])
        self.assertEqual(self.calls[0][1], cached)

    def test_store_without_cached_layout_fetches_read_only_and_uses_the_file(self):
        layouts = Path(self.tmp.name) / "layouts"
        fetched = []

        def fetcher(args):
            fetched.append(args)
            Path(args[args.index("--out") + 1]).parent.mkdir(parents=True, exist_ok=True)
            Path(args[args.index("--out") + 1]).write_text(SYNTHETIC_LAYOUT.read_text(encoding="utf-8"), encoding="utf-8")
            return 0

        result = cp.compare(
            SYNTHETIC_RECORDING, store="SPAR-Leonding-002", layout=None, site="testraum", work_dir=self.work,
            runner=self.runner(), fetcher=fetcher, layouts_dir=layouts,
        )
        self.assertEqual(result, 0)
        self.assertEqual(len(fetched), 1)
        self.assertEqual(fetched[0][:2], ["--store", "SPAR-Leonding-002"])
        self.assertEqual(self.calls[0][1], layouts / "spar-leonding-002.json")

    def test_failed_fetch_is_an_input_error_and_never_reaches_the_comparison(self):
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(cp.AnalysisError) as raised:
                cp.compare(
                    SYNTHETIC_RECORDING, store="SPAR-Leonding-002", layout=None, site="testraum", work_dir=self.work,
                    runner=self.runner(), fetcher=lambda args: 2, layouts_dir=Path(self.tmp.name) / "layouts",
                )
        self.assertEqual(raised.exception.code, 2)
        self.assertIn("nicht geholt", str(raised.exception))
        self.assertEqual(self.calls, [])

    def test_invalid_store_code_is_rejected(self):
        code, _, err = run_main([str(SYNTHETIC_RECORDING), "--store", "../evil", "--work-dir", str(self.work)], self.runner())
        self.assertEqual(code, 2)
        self.assertIn("Ungueltiger Markt-Code", err)
        self.assertEqual(self.calls, [])

    def test_store_and_layout_exclude_each_other(self):
        with self.assertRaises(SystemExit):
            run_main([str(SYNTHETIC_RECORDING), "--store", "X", "--layout", str(SYNTHETIC_LAYOUT)], self.runner())

    def test_missing_recording_and_layout_are_input_errors(self):
        code, _, err = run_main([str(Path(self.tmp.name) / "fehlt.jsonl"), "--layout", str(SYNTHETIC_LAYOUT)], self.runner())
        self.assertEqual(code, 2)
        self.assertIn("Aufnahme nicht gefunden", err)
        code, _, err = run_main([str(SYNTHETIC_RECORDING), "--layout", str(Path(self.tmp.name) / "fehlt.json")], self.runner())
        self.assertEqual(code, 2)
        self.assertIn("Layout nicht gefunden", err)

    def test_recording_that_violates_anonymization_is_not_compared(self):
        bad = Path(self.tmp.name) / "unsafe.jsonl"
        bad.write_text('{"type":"layout","t":1.0,"revision":1,"shopName":"Mein Markt"}\n{"type":"mystery","t":2.0,"name":"Max"}\n', encoding="utf-8")
        code, _, err = run_main([str(bad), "--layout", str(SYNTHETIC_LAYOUT), "--work-dir", str(self.work)], self.runner())
        self.assertEqual(code, 1)
        self.assertEqual(self.calls, [])
        self.assertIn("Anonymisierungspruefung fehlgeschlagen", err)

    def test_exit_codes_of_the_tool_are_mapped(self):
        args = [str(SYNTHETIC_RECORDING), "--layout", str(SYNTHETIC_LAYOUT), "--work-dir", str(self.work)]
        self.assertEqual(run_main(args, self.runner(3))[0], 3)
        code, _, err = run_main(args, self.runner(2))
        self.assertEqual(code, 1)
        self.assertIn("Vergleich fehlgeschlagen", err)

    def test_warmup_is_passed_on(self):
        run_main([str(SYNTHETIC_RECORDING), "--layout", str(SYNTHETIC_LAYOUT), "--warmup", "0", "--work-dir", str(self.work)], self.runner())
        self.assertEqual(self.calls[0][4], 0.0)


if __name__ == "__main__":
    unittest.main()
