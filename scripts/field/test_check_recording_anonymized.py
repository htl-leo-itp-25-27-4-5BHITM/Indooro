"""Tests fuer check_recording_anonymized.py (Task 4.5). Synthetische Zeilen, keine Felddaten."""

import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import check_recording_anonymized as checker  # noqa: E402

BEACON_UUID = "B5CAA23B-BB89-4040-99D2-FCED3EA4A62B"
FOREIGN_UUID = "1A2B3C4D-1111-2222-3333-444455556666"

CLEAN = [
    '{"beacon":"Indooro1","rssi":-60,"source":"rssi","t":1000001.5,"type":"measurement"}',
    '{"accuracy":2.5,"beacon":"TEST-3","proximity":"near","rssi":-71,"source":"ranging","t":1000002,"type":"measurement"}',
    '{"revision":1,"t":1000000,"type":"layout"}',
    '{"layoutId":"3F2504E0-4F89-11D3-9A0C-0305E82C3301","revision":2,"t":1000000,"type":"layout"}',
    '{"kind":"startTour","optimize":true,"plan":[{"id":"shelf-3","title":"stop-shelf-3","x":30.5,"y":9.5}],"t":1000002,"type":"event"}',
    '{"kind":"stopDone","t":1000002.5,"type":"event"}',
    '{"t":1000003,"type":"truth","x":10.5,"y":9.5}',
    '{"distance":0.7,"source":"pedometer","steps":4,"t":1000004,"type":"step"}',
    '{"accuracy":10,"degrees":181.5,"source":"compass","t":1000005,"type":"heading"}',
]


def messages(lines, **options):
    return [(violation.line, violation.reason) for violation in checker.check_lines(lines, **options)]


def reasons(lines, **options):
    return [violation.reason for violation in checker.check_lines(lines, **options)]


class CleanRecordingTests(unittest.TestCase):
    def test_clean_recording_passes(self):
        self.assertEqual(checker.check_lines(CLEAN), [])

    def test_step_and_heading_lines_are_accepted(self):
        self.assertEqual(checker.check_lines([CLEAN[7], CLEAN[8]]), [])

    def test_blank_lines_are_ignored(self):
        self.assertEqual(checker.check_lines(["", "   ", CLEAN[0]]), [])

    def test_beacon_uuid_in_default_list_passes_in_any_case_and_form(self):
        lines = [
            '{"beacon":"b5caa23b-bb89-4040-99d2-fced3ea4a62b","rssi":-60,"source":"rssi","t":1,"type":"measurement"}',
            '{"beacon":"B5CAA23BBB89404099D2FCED3EA4A62B","rssi":-60,"source":"rssi","t":1,"type":"measurement"}',
        ]
        self.assertEqual(checker.check_lines(lines), [])

    def test_layout_id_uuid_is_allowed(self):
        line = '{"layoutId":"9C1E4B2A-0000-4F00-8A11-ABCDEF012345","revision":1,"t":1,"type":"layout"}'
        self.assertEqual(checker.check_lines([line]), [])


class SyntaxAndTypeTests(unittest.TestCase):
    def test_invalid_json_reports_line_number(self):
        found = messages([CLEAN[0], "{not json"])
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0][0], 2)
        self.assertIn("kein gueltiges JSON", found[0][1])

    def test_non_object_line_fails(self):
        self.assertIn("kein JSON-Objekt", reasons(["[1,2,3]"])[0])

    def test_missing_type_fails(self):
        self.assertIn("'type' fehlt", reasons(['{"t":1}'])[0])

    def test_unknown_line_type_fails(self):
        self.assertIn("unbekannter Zeilentyp 'gps'", reasons(['{"t":1,"type":"gps"}'])[0])

    def test_nan_is_not_a_finite_number(self):
        found = reasons(['{"t":NaN,"type":"truth","x":1,"y":1}'])
        self.assertTrue(any("keine endliche Zahl" in reason for reason in found))

    def test_bool_is_not_accepted_as_number(self):
        found = reasons(['{"t":true,"type":"truth","x":1,"y":1}'])
        self.assertTrue(any("'t' ist keine endliche Zahl" in reason for reason in found))

    def test_wrong_value_types_fail(self):
        self.assertTrue(reasons(['{"rssi":1.5,"source":"rssi","beacon":"A","t":1,"type":"measurement"}']))
        self.assertTrue(reasons(['{"optimize":"yes","kind":"startTour","t":1,"type":"event"}']))
        self.assertTrue(reasons(['{"t":1,"type":"truth","x":null,"y":1}']))

    def test_invalid_enum_values_fail(self):
        self.assertTrue(reasons(['{"beacon":"A","rssi":-60,"source":"bluetooth","t":1,"type":"measurement"}']))
        self.assertTrue(reasons(['{"kind":"startTrip","t":1,"type":"event"}']))
        self.assertTrue(reasons(['{"beacon":"A","proximity":"close","rssi":-60,"source":"rssi","t":1,"type":"measurement"}']))
        self.assertTrue(reasons(['{"distance":1,"source":"gps","steps":1,"t":1,"type":"step"}']))

    def test_missing_required_key_fails(self):
        found = reasons(['{"rssi":-60,"source":"rssi","t":1,"type":"measurement"}'])
        self.assertIn("Schluessel 'beacon' fehlt", found[0])


class IdentityTests(unittest.TestCase):
    def test_device_name_key_fails(self):
        found = reasons(['{"deviceName":"Erik","t":1,"type":"truth","x":1,"y":1}'])
        self.assertIn("verbotener Schluessel 'deviceName'", found[0])

    def test_model_key_in_measurement_fails(self):
        line = '{"beacon":"A","model":"iPhone15,2","rssi":-60,"source":"rssi","t":1,"type":"measurement"}'
        self.assertIn("verbotener Schluessel 'model'", reasons([line])[0])

    def test_device_key_nested_in_plan_fails(self):
        line = '{"kind":"startTour","plan":[{"device":"x","id":"shelf-1","title":"stop-shelf-1","x":1,"y":2}],"t":1,"type":"event"}'
        found = reasons([line])
        self.assertTrue(any("plan[1]" in reason and "'device'" in reason for reason in found))

    def test_unknown_key_fails_generally(self):
        found = reasons(['{"extra":1,"t":1,"type":"truth","x":1,"y":1}'])
        self.assertIn("unbekannter Schluessel 'extra'", found[0])

    def test_foreign_uuid_in_beacon_fails(self):
        line = f'{{"beacon":"{FOREIGN_UUID}","rssi":-60,"source":"rssi","t":1,"type":"measurement"}}'
        self.assertIn("UUID-aehnlicher Wert in 'beacon'", reasons([line])[0])

    def test_bare_32_hex_uuid_not_in_list_fails(self):
        line = '{"beacon":"1a2b3c4d111122223333444455556666","rssi":-60,"source":"rssi","t":1,"type":"measurement"}'
        self.assertIn("UUID-aehnlicher Wert", reasons([line])[0])

    def test_allow_uuid_option_extends_list(self):
        line = f'{{"beacon":"{FOREIGN_UUID}","rssi":-60,"source":"rssi","t":1,"type":"measurement"}}'
        allowed = [checker.DEFAULT_ALLOWED_UUIDS[0], FOREIGN_UUID]
        self.assertEqual(checker.check_lines([line], allowed_uuids=allowed), [])

    def test_uuid_inside_free_text_fails_even_with_flag(self):
        line = f'{{"layoutId":"L1","revision":1,"shopName":"Shop {FOREIGN_UUID}","t":1,"type":"layout"}}'
        found = reasons([line], allow_free_text=True)
        self.assertEqual(len(found), 1)
        self.assertIn("UUID-aehnlicher Wert in 'shopName'", found[0])


class FreeTextTests(unittest.TestCase):
    def test_shop_name_fails_without_flag(self):
        line = '{"revision":1,"shopName":"Mein Laden","t":1,"type":"layout"}'
        self.assertIn("Freitext in 'shopName'", reasons([line])[0])

    def test_shop_name_passes_with_flag(self):
        line = '{"revision":1,"shopName":"Mein Laden","t":1,"type":"layout"}'
        self.assertEqual(checker.check_lines([line], allow_free_text=True), [])

    def test_plain_plan_title_fails_without_flag(self):
        line = '{"kind":"startTour","plan":[{"id":"shelf-3","title":"Brot","x":1,"y":2}],"t":1,"type":"event"}'
        self.assertIn("Freitext in 'title'", reasons([line])[0])

    def test_anonymized_stop_title_passes(self):
        line = '{"kind":"startTour","plan":[{"id":"shelf-3","title":"stop-shelf-3","x":1,"y":2}],"t":1,"type":"event"}'
        self.assertEqual(checker.check_lines([line]), [])

    def test_stop_id_must_be_identifier_shaped(self):
        line = '{"kind":"startTour","plan":[{"id":"shelf 3","title":"stop-x","x":1,"y":2}],"t":1,"type":"event"}'
        self.assertIn("kein Bezeichner", reasons([line])[0])

    def test_beacon_with_whitespace_fails(self):
        line = '{"beacon":"Eriks iPhone","rssi":-60,"source":"rssi","t":1,"type":"measurement"}'
        self.assertIn("kein Bezeichner", reasons([line])[0])


class LineReportingTests(unittest.TestCase):
    def test_violations_carry_one_based_line_numbers(self):
        bad_device = '{"deviceName":"x","t":1,"type":"truth","x":1,"y":1}'
        lines = [CLEAN[0], CLEAN[6], bad_device, CLEAN[7], "garbage"]
        found = messages(lines)
        self.assertEqual([line for line, _ in found], [3, 5])


class CommandLineTests(unittest.TestCase):
    def _run(self, argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = checker.main(argv)
        return code, out.getvalue(), err.getvalue()

    def test_exit_codes_and_report_format(self):
        with tempfile.TemporaryDirectory() as directory:
            good = Path(directory) / "good.jsonl"
            bad = Path(directory) / "bad.jsonl"
            good.write_text("\n".join(CLEAN) + "\n", encoding="utf-8")
            bad.write_text(CLEAN[0] + '\n{"deviceName":"x","t":1,"type":"truth","x":1,"y":1}\n', encoding="utf-8")

            code, out, _ = self._run([str(good)])
            self.assertEqual(code, 0)
            self.assertIn("in Ordnung", out)

            code, out, _ = self._run([str(bad)])
            self.assertEqual(code, 1)
            self.assertIn(f"{bad}:2: verbotener Schluessel 'deviceName'", out)

            code, _, err = self._run([str(Path(directory) / "missing.jsonl")])
            self.assertEqual(code, 2)
            self.assertIn("nicht lesbar", err)

    def test_violation_wins_over_unreadable_file(self):
        with tempfile.TemporaryDirectory() as directory:
            bad = Path(directory) / "bad.jsonl"
            bad.write_text('{"t":1,"type":"gps"}\n', encoding="utf-8")
            code, _, _ = self._run([str(bad), str(Path(directory) / "missing.jsonl")])
            self.assertEqual(code, 1)

    def test_invalid_allow_uuid_argument_is_usage_error(self):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            with self.assertRaises(SystemExit) as raised:
                checker.main(["--allow-uuid", "keine-uuid", "x.jsonl"])
        self.assertEqual(raised.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
