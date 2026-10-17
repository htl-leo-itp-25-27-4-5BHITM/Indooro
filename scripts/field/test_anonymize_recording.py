"""Tests fuer anonymize_recording.py (Task 4.5). Synthetische Zeilen, keine Felddaten."""

import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import anonymize_recording as anonymizer  # noqa: E402
import check_recording_anonymized as checker  # noqa: E402

CANONICAL_MEASUREMENT = '{"beacon":"Indooro1","rssi":-60,"source":"rssi","t":1000001.5,"type":"measurement"}'
LAYOUT_WITH_SHOP = '{"revision":1,"shopName":"Mein Laden","t":1000000,"type":"layout"}'
EVENT_WITH_TITLE = '{"kind":"startTour","plan":[{"id":"shelf-3","title":"Brot","x":30.5,"y":9.5}],"t":1000002,"type":"event"}'


class AnonymizeLinesTests(unittest.TestCase):
    def test_shop_name_is_removed(self):
        (line,) = anonymizer.anonymize_lines([LAYOUT_WITH_SHOP])
        self.assertNotIn("shopName", json.loads(line))
        self.assertEqual(json.loads(line)["revision"], 1)

    def test_plan_title_is_replaced_by_stop_id(self):
        (line,) = anonymizer.anonymize_lines([EVENT_WITH_TITLE])
        stop = json.loads(line)["plan"][0]
        self.assertEqual(stop["title"], "stop-shelf-3")
        self.assertEqual((stop["x"], stop["y"]), (30.5, 9.5))

    def test_canonical_line_stays_byte_identical(self):
        self.assertEqual(anonymizer.anonymize_lines([CANONICAL_MEASUREMENT]), [CANONICAL_MEASUREMENT])

    def test_output_is_sorted_compact_json(self):
        unsorted = '{ "type": "truth", "t": 1, "x": 2.5, "y": 3 }'
        (line,) = anonymizer.anonymize_lines([unsorted])
        self.assertEqual(line, '{"t":1,"type":"truth","x":2.5,"y":3}')

    def test_invalid_json_passes_through_unchanged(self):
        self.assertEqual(anonymizer.anonymize_lines(["{broken"]), ["{broken"])

    def test_device_name_is_not_hidden_by_anonymization(self):
        lines = [LAYOUT_WITH_SHOP, '{"deviceName":"Erik","t":1,"type":"truth","x":1,"y":1}']
        self.assertTrue(checker.check_lines(anonymizer.anonymize_lines(lines)))

    def test_anonymized_recording_passes_the_check(self):
        lines = [CANONICAL_MEASUREMENT, LAYOUT_WITH_SHOP, EVENT_WITH_TITLE]
        raw_violations = checker.check_lines(lines)
        self.assertEqual([violation.line for violation in raw_violations], [2, 3])
        self.assertEqual(checker.check_lines(anonymizer.anonymize_lines(lines)), [])


class CommandLineTests(unittest.TestCase):
    def _run(self, argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = anonymizer.main(argv)
        return code, out.getvalue(), err.getvalue()

    def test_writes_output_and_never_overwrites(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "in.jsonl"
            target = Path(directory) / "out.jsonl"
            source.write_text(LAYOUT_WITH_SHOP + "\n" + EVENT_WITH_TITLE + "\n", encoding="utf-8")

            code, _, _ = self._run([str(source), str(target)])
            self.assertEqual(code, 0)
            written = target.read_text(encoding="utf-8")
            self.assertNotIn("Mein Laden", written)
            self.assertIn("stop-shelf-3", written)
            self.assertTrue(written.endswith("\n"))

            target.write_text("keep me\n", encoding="utf-8")
            code, _, err = self._run([str(source), str(target)])
            self.assertEqual(code, 2)
            self.assertIn("nicht ueberschrieben", err)
            self.assertEqual(target.read_text(encoding="utf-8"), "keep me\n")

    def test_does_not_write_when_check_still_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "in.jsonl"
            target = Path(directory) / "out.jsonl"
            source.write_text('{"deviceName":"Erik","t":1,"type":"truth","x":1,"y":1}\n', encoding="utf-8")
            code, out, _ = self._run([str(source), str(target)])
            self.assertEqual(code, 1)
            self.assertIn("verbotener Schluessel 'deviceName'", out)
            self.assertFalse(target.exists())


if __name__ == "__main__":
    unittest.main()
