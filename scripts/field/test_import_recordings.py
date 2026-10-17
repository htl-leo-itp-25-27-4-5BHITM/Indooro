"""Tests fuer import_recordings.py (Task 4.5 / 5.2). Arbeitet nur in temporaeren Ordnern."""

import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import import_recordings as importer  # noqa: E402

SITE = "testraum"
DATE = "2026-10-20"

GOOD_WITH_SHOP = "\n".join([
    '{"revision":1,"shopName":"Mein Laden","t":1000000,"type":"layout"}',
    '{"beacon":"Indooro1","rssi":-60,"source":"rssi","t":1000001,"type":"measurement"}',
    '{"kind":"startTour","plan":[{"id":"shelf-3","title":"Brot","x":30.5,"y":9.5}],"t":1000002,"type":"event"}',
    '{"t":1000003,"type":"truth","x":10.5,"y":9.5}',
]) + "\n"

GOOD_PLAIN = "\n".join([
    '{"revision":1,"t":1000000,"type":"layout"}',
    '{"beacon":"TEST-3","rssi":-71,"source":"ranging","accuracy":2.5,"t":1000001,"type":"measurement"}',
]) + "\n"

BAD_DEVICE = '{"deviceName":"Erik iPhone","t":1000000,"type":"layout","revision":1}\n'


class ImportTestCase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.incoming = root / "incoming"
        self.recordings = root / "recordings"
        self.incoming.mkdir()

    def tearDown(self):
        self._tmp.cleanup()

    def write_incoming(self, name, text):
        path = self.incoming / name
        path.write_text(text, encoding="utf-8")
        return path

    def run_import(self, *extra, site=SITE, date=DATE):
        argv = ["--site", site, "--date", date, "--incoming", str(self.incoming),
                "--recordings", str(self.recordings), *extra]
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = importer.main(argv)
        return code, out.getvalue(), err.getvalue()

    def recorded_names(self):
        if not self.recordings.is_dir():
            return []
        return sorted(entry.name for entry in self.recordings.iterdir())


class ImportAcceptanceTests(ImportTestCase):
    def test_two_good_and_one_bad_writes_two_and_rejects_one(self):
        self.write_incoming("a.jsonl", GOOD_WITH_SHOP)
        self.write_incoming("b.jsonl", GOOD_PLAIN)
        self.write_incoming("c.jsonl", BAD_DEVICE)

        code, out, _ = self.run_import()

        self.assertEqual(code, 1)
        self.assertEqual(self.recorded_names(), [f"{SITE}-{DATE}-1.jsonl", f"{SITE}-{DATE}-2.jsonl"])
        self.assertIn("2 uebernommen, 1 abgelehnt", out)
        self.assertIn("abgelehnt: c.jsonl", out)
        self.assertIn("deviceName", out)
        self.assertEqual(sorted(p.name for p in self.incoming.iterdir()), ["a.jsonl", "b.jsonl", "c.jsonl"])

    def test_written_file_is_anonymized(self):
        self.write_incoming("a.jsonl", GOOD_WITH_SHOP)
        self.run_import()
        written = (self.recordings / f"{SITE}-{DATE}-1.jsonl").read_text(encoding="utf-8")
        self.assertNotIn("Mein Laden", written)
        self.assertIn('"title":"stop-shelf-3"', written)
        self.assertTrue(written.endswith("\n"))

    def test_all_good_returns_zero(self):
        self.write_incoming("a.jsonl", GOOD_PLAIN)
        code, out, _ = self.run_import()
        self.assertEqual(code, 0)
        self.assertIn("1 uebernommen, 0 abgelehnt", out)

    def test_without_move_originals_are_kept(self):
        self.write_incoming("a.jsonl", GOOD_PLAIN)
        code, out, _ = self.run_import()
        self.assertEqual(code, 0)
        self.assertTrue((self.incoming / "a.jsonl").exists())
        self.assertIn("Original behalten", out)

    def test_move_removes_only_accepted_originals(self):
        self.write_incoming("a.jsonl", GOOD_WITH_SHOP)
        self.write_incoming("b.jsonl", GOOD_PLAIN)
        self.write_incoming("c.jsonl", BAD_DEVICE)

        code, out, _ = self.run_import("--move")

        self.assertEqual(code, 1)
        self.assertEqual(sorted(p.name for p in self.incoming.iterdir()), ["c.jsonl"])
        self.assertEqual(len(self.recorded_names()), 2)
        self.assertIn("Original verschoben", out)


class NumberingAndOverwriteTests(ImportTestCase):
    def test_existing_file_is_never_overwritten(self):
        self.recordings.mkdir()
        existing = self.recordings / f"{SITE}-{DATE}-1.jsonl"
        existing.write_text("OLD\n", encoding="utf-8")
        self.write_incoming("a.jsonl", GOOD_PLAIN)

        code, _, _ = self.run_import()

        self.assertEqual(code, 0)
        self.assertEqual(existing.read_text(encoding="utf-8"), "OLD\n")
        self.assertEqual(self.recorded_names(), [f"{SITE}-{DATE}-1.jsonl", f"{SITE}-{DATE}-2.jsonl"])

    def test_numbering_continues_after_existing_files(self):
        self.recordings.mkdir()
        (self.recordings / f"{SITE}-{DATE}-1.jsonl").write_text("x\n", encoding="utf-8")
        (self.recordings / f"{SITE}-{DATE}-2.jsonl").write_text("x\n", encoding="utf-8")
        self.write_incoming("a.jsonl", GOOD_PLAIN)

        self.run_import()

        self.assertIn(f"{SITE}-{DATE}-3.jsonl", self.recorded_names())

    def test_numbering_is_per_site_and_date(self):
        self.recordings.mkdir()
        (self.recordings / f"other-{DATE}-1.jsonl").write_text("x\n", encoding="utf-8")
        (self.recordings / f"{SITE}-2026-10-19-4.jsonl").write_text("x\n", encoding="utf-8")
        self.write_incoming("a.jsonl", GOOD_PLAIN)

        self.run_import()

        self.assertIn(f"{SITE}-{DATE}-1.jsonl", self.recorded_names())

    def test_next_free_name_pure_function(self):
        taken = {f"{SITE}-{DATE}-1.jsonl", f"{SITE}-{DATE}-4.jsonl", "unrelated.txt"}
        self.assertEqual(importer.next_free_name(SITE, DATE, taken), f"{SITE}-{DATE}-5.jsonl")
        self.assertEqual(importer.next_free_name(SITE, DATE, set()), f"{SITE}-{DATE}-1.jsonl")

    def test_dry_run_numbers_consecutively_and_writes_nothing(self):
        self.write_incoming("a.jsonl", GOOD_PLAIN)
        self.write_incoming("b.jsonl", GOOD_WITH_SHOP)

        code, out, _ = self.run_import("--dry-run", "--move")

        self.assertEqual(code, 0)
        self.assertFalse(self.recordings.exists())
        self.assertIn(f"a.jsonl -> {SITE}-{DATE}-1.jsonl", out)
        self.assertIn(f"b.jsonl -> {SITE}-{DATE}-2.jsonl", out)
        self.assertIn("Probelauf", out)
        self.assertEqual(sorted(p.name for p in self.incoming.iterdir()), ["a.jsonl", "b.jsonl"])


class RejectionTests(ImportTestCase):
    def test_empty_file_is_rejected(self):
        self.write_incoming("empty.jsonl", "")
        code, out, _ = self.run_import()
        self.assertEqual(code, 1)
        self.assertIn("Datei ist leer", out)
        self.assertEqual(self.recorded_names(), [])

    def test_invalid_json_is_rejected_with_line(self):
        self.write_incoming("broken.jsonl", GOOD_PLAIN + "{oops\n")
        code, out, _ = self.run_import()
        self.assertEqual(code, 1)
        self.assertIn("Zeile 3: kein gueltiges JSON", out)

    def test_non_utf8_file_is_rejected(self):
        (self.incoming / "latin.jsonl").write_bytes(b"\xff\xfe\x00bad")
        code, out, _ = self.run_import()
        self.assertEqual(code, 1)
        self.assertIn("keine UTF-8-Datei", out)

    def test_unknown_line_type_is_rejected(self):
        self.write_incoming("gps.jsonl", '{"lat":1,"t":1,"type":"gps"}\n')
        code, out, _ = self.run_import()
        self.assertEqual(code, 1)
        self.assertIn("unbekannter Zeilentyp 'gps'", out)


class ArgumentAndFolderTests(ImportTestCase):
    def test_no_jsonl_files_returns_zero(self):
        (self.incoming / "notes.txt").write_text("hallo\n", encoding="utf-8")
        code, out, _ = self.run_import()
        self.assertEqual(code, 0)
        self.assertIn("Keine .jsonl-Dateien", out)

    def test_missing_incoming_folder_returns_two(self):
        argv = ["--site", SITE, "--date", DATE, "--incoming", str(self.incoming / "missing"),
                "--recordings", str(self.recordings)]
        err = io.StringIO()
        with contextlib.redirect_stderr(err), contextlib.redirect_stdout(io.StringIO()):
            code = importer.main(argv)
        self.assertEqual(code, 2)
        self.assertIn("Eingangsordner nicht gefunden", err.getvalue())

    def test_site_name_is_validated(self):
        for bad in ["Test", "test raum", "-x", "test_raum", ""]:
            with self.subTest(site=bad), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as raised:
                    importer.main(["--site", bad, "--date", DATE])
                self.assertEqual(raised.exception.code, 2)

    def test_date_is_validated(self):
        for bad in ["2026-13-01", "20-10-2026", "2026-10-32", "2026/10/20"]:
            with self.subTest(date=bad), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as raised:
                    importer.main(["--site", SITE, "--date", bad])
                self.assertEqual(raised.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
