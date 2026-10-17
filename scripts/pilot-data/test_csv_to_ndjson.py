"""Tests for csv_to_ndjson.py.

Run from the repository root with:
    python -I -m unittest discover scripts/pilot-data
All fixtures are synthetic. Nothing here reads real store data.
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import csv_to_ndjson  # noqa: E402

SCRIPT = os.path.join(HERE, "csv_to_ndjson.py")
FIXTURES = os.path.join(HERE, "fixtures")
LAYOUT_MINI = os.path.join(FIXTURES, "layout-mini.json")
HEADER = "id;name;marke;menge;regal_label;kategorie;meter;fach;reihe;preis"
MILCH = "Gang 1 · links · Milchprodukte"
OBST = "Gang 2 · rechts · Obst & Gemüse"


def shelf(category, meter, label, **extra):
    element = {"type": "shelf", "category": category, "meter": meter, "label": label}
    element.update(extra)
    return element


def layout_document(elements):
    return {"shopName": "Testmarkt", "gridSize": {"width": 10, "height": 10}, "elements": elements}


class PilotDataTestCase(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.dir = temp.name
        self.out = os.path.join(self.dir, "out.ndjson")

    # helpers -------------------------------------------------------------

    def path(self, name):
        return os.path.join(self.dir, name)

    def write_bytes(self, name, data):
        with open(self.path(name), "wb") as handle:
            handle.write(data)
        return self.path(name)

    def write_csv(self, lines, name="in.csv"):
        text = "\r\n".join(lines) + "\r\n"
        return self.write_bytes(name, text.encode("utf-8"))

    def write_layout(self, elements, name="layout.json"):
        with open(self.path(name), "w", encoding="utf-8") as handle:
            json.dump(layout_document(elements), handle, ensure_ascii=False)
        return self.path(name)

    def cli(self, csv_path, layout=LAYOUT_MINI, *extra):
        command = [
            sys.executable, "-I", SCRIPT, csv_path, layout,
            "--store-id", "STORE-T1", "--store-code", "SPAR-TEST-001", "--out", self.out, *extra,
        ]
        completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8")
        return completed.returncode, completed.stdout, completed.stderr

    def read_lines(self, path=None):
        with open(path or self.out, encoding="utf-8") as handle:
            return [line for line in handle.read().split("\n") if line]

    def read_ndjson(self, path=None):
        """Default format: one product object per line, no action lines."""
        documents = []
        for line in self.read_lines(path):
            document = json.loads(line)
            self.assertNotIn("index", document, "ndjson output must not contain action lines")
            documents.append(document)
        return documents

    def read_bulk_pairs(self, path=None):
        """Legacy format: action line followed by document line, like demoproducts.ndjson."""
        lines = self.read_lines(path)
        self.assertEqual(len(lines) % 2, 0, "bulk-pairs output must be index/document pairs")
        documents = []
        for index in range(0, len(lines), 2):
            self.assertEqual(json.loads(lines[index]), {"index": {"_index": "products"}})
            documents.append(json.loads(lines[index + 1]))
        return documents


# ---------------------------------------------------------------------------
# Valid input
# ---------------------------------------------------------------------------

class ValidConversionTests(PilotDataTestCase):

    def test_valid_fixture_exits_zero_and_writes_products(self):
        code, stdout, stderr = self.cli(os.path.join(FIXTURES, "valid.csv"))
        self.assertEqual(code, 0, stderr)
        self.assertEqual(len(self.read_ndjson()), 5)
        self.assertIn("Produkte (Zeilen): 5", stdout)

    def test_generated_150_rows_produce_150_products(self):
        rows = [HEADER]
        for index in range(150):
            if index % 3 == 0:
                rows.append(f";Produkt {index};Marke;1 Stk;{MILCH};520;1;{index % 5 + 1};1;1,29")
            elif index % 3 == 1:
                rows.append(f";Produkt {index};Marke;1 Stk;{MILCH};520;2;1;{index % 4 + 1};0.99")
            else:
                rows.append(f";Produkt {index};Marke;1 Stk;{OBST};310;1;{index % 2 + 1};1;2,49")
        code, _stdout, stderr = self.cli(self.write_csv(rows, "big.csv"))
        self.assertEqual(code, 0, stderr)
        documents = self.read_ndjson()
        self.assertEqual(len(documents), 150)
        self.assertEqual(sorted(doc["id"] for doc in documents), list(range(1, 151)))

    def test_layout_code_is_kategorie_meter_fach_reihe(self):
        rows = [HEADER, f"7;Vollmilch;Bergbauer;1 l;{MILCH};520;2;3;4;1,29"]
        code, _stdout, stderr = self.cli(self.write_csv(rows))
        self.assertEqual(code, 0, stderr)
        self.assertEqual(self.read_ndjson()[0]["layoutCode"], "520/2/3/4")

    def test_name_is_marke_name_menge_with_collapsed_spaces(self):
        rows = [HEADER, f"  ;  Vollmilch  ;  Bergbauer ;1   l ;{MILCH};520;1;1;1;1,29"]
        code, _stdout, stderr = self.cli(self.write_csv(rows))
        self.assertEqual(code, 0, stderr)
        self.assertEqual(self.read_ndjson()[0]["name"], "Bergbauer Vollmilch 1 l")

    def test_bulk_documents_carry_store_fields_and_price(self):
        rows = [HEADER, f"1;Vollmilch;Bergbauer;1 l;{MILCH};520;1;1;1;1,29"]
        code, _stdout, stderr = self.cli(self.write_csv(rows))
        self.assertEqual(code, 0, stderr)
        document = self.read_ndjson()[0]
        self.assertEqual(document, {
            "id": 1,
            "name": "Bergbauer Vollmilch 1 l",
            "price": 1.29,
            "layoutCode": "520/1/1/1",
            "storeId": "STORE-T1",
            "storeCode": "SPAR-TEST-001",
        })

    def test_ndjson_is_default_format_one_object_per_line(self):
        code, _stdout, stderr = self.cli(os.path.join(FIXTURES, "valid.csv"))
        self.assertEqual(code, 0, stderr)
        lines = self.read_lines()
        self.assertEqual(len(lines), 5)
        self.assertEqual(json.loads(lines[0])["name"], "Bergbauer Vollmilch 1 l")

    def test_bulk_pairs_format_matches_demoproducts_style(self):
        code, _stdout, stderr = self.cli(os.path.join(FIXTURES, "valid.csv"), LAYOUT_MINI, "--format", "bulk-pairs")
        self.assertEqual(code, 0, stderr)
        documents = self.read_bulk_pairs()
        self.assertEqual(len(documents), 5)
        self.assertEqual(documents[0]["layoutCode"], "520/1/1/1")
        self.assertEqual(documents[0]["storeId"], "STORE-T1")

    def test_array_format_option_writes_json_array(self):
        code, _stdout, stderr = self.cli(os.path.join(FIXTURES, "valid.csv"), LAYOUT_MINI, "--format", "array")
        self.assertEqual(code, 0, stderr)
        with open(self.out, encoding="utf-8") as handle:
            data = json.load(handle)
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 5)
        self.assertNotIn("index", data[0])

    def test_prices_accept_comma_and_decimal_point(self):
        layout = csv_to_ndjson.load_layout(LAYOUT_MINI)
        raw = (HEADER + f"\n1;A;;1;{MILCH};520;1;1;1;1,29\n2;B;;1;{MILCH};520;1;2;1;0.79\n").encode("utf-8")
        result = csv_to_ndjson.convert(raw, layout, "S", "C")
        self.assertEqual(result.errors, [])
        self.assertEqual([doc["price"] for doc in result.products], [1.29, 0.79])

    def test_auto_ids_skip_explicit_ids_and_start_at_id_start(self):
        layout = csv_to_ndjson.load_layout(LAYOUT_MINI)
        raw = (
            HEADER + "\n"
            f"1;A;;1;{MILCH};520;1;1;1;1,00\n"
            f";B;;1;{MILCH};520;1;2;1;1,00\n"
            f"2;C;;1;{MILCH};520;1;3;1;1,00\n"
            f";D;;1;{MILCH};520;1;4;1;1,00\n"
        ).encode("utf-8")
        result = csv_to_ndjson.convert(raw, layout, "S", "C", id_start=1)
        self.assertEqual(result.errors, [])
        self.assertEqual([doc["id"] for doc in result.products], [1, 3, 2, 4])
        self.assertEqual(result.auto_ids, 2)

    def test_auto_ids_respect_custom_id_start(self):
        layout = csv_to_ndjson.load_layout(LAYOUT_MINI)
        raw = (HEADER + f"\n;A;;1;{MILCH};520;1;1;1;1,00\n;B;;1;{MILCH};520;1;2;1;1,00\n").encode("utf-8")
        result = csv_to_ndjson.convert(raw, layout, "S", "C", id_start=100)
        self.assertEqual([doc["id"] for doc in result.products], [100, 101])

    def test_comma_delimited_file_is_detected_and_converted(self):
        code, _stdout, stderr = self.cli(os.path.join(FIXTURES, "comma-delimited.csv"))
        self.assertEqual(code, 0, stderr)
        self.assertIn("Trennzeichen ','", stderr)
        self.assertEqual(len(self.read_ndjson()), 3)

    def test_excel_bom_file_keeps_umlauts(self):
        code, _stdout, stderr = self.cli(os.path.join(FIXTURES, "excel-bom.csv"))
        self.assertEqual(code, 0, stderr)
        self.assertIn("mit BOM", stderr)
        names = [doc["name"] for doc in self.read_ndjson()]
        self.assertIn("Almhof Käse Gouda jung 200 g", names)
        self.assertIn("Waldkorn Müsli Früchte Crunch 500 g", names)
        self.assertIn("Sonnenhof Joghurt Erdbeer 150 g", names)

    def test_crlf_line_endings_are_accepted(self):
        rows = [HEADER, f"1;Vollmilch;Bergbauer;1 l;{MILCH};520;1;1;1;1,29"]
        code, _stdout, stderr = self.cli(self.write_csv(rows))
        self.assertEqual(code, 0, stderr)


# ---------------------------------------------------------------------------
# Validation errors: nothing is written
# ---------------------------------------------------------------------------

class ValidationErrorTests(PilotDataTestCase):

    def assert_rejected(self, csv_path, expected_fragment):
        code, _stdout, stderr = self.cli(csv_path)
        self.assertEqual(code, 1, stderr)
        self.assertIn(expected_fragment, stderr)
        self.assertFalse(os.path.exists(self.out), "no output file may be written on validation errors")
        return stderr

    def test_unknown_shelf_reports_row_and_writes_nothing(self):
        stderr = self.assert_rejected(os.path.join(FIXTURES, "unknown-shelf.csv"), "Zeile 3: kein Regal")
        self.assertIn("kategorie 812, meter 3", stderr)

    def test_duplicate_id_is_reported_with_both_rows(self):
        self.assert_rejected(
            os.path.join(FIXTURES, "duplicate-id.csv"),
            "Zeile 3: id 1001 ist doppelt (auch in Zeile 2)",
        )

    def test_empty_name_is_reported(self):
        self.assert_rejected(os.path.join(FIXTURES, "empty-name.csv"), "Zeile 3: name ist leer")

    def test_non_numeric_fach_is_reported(self):
        self.assert_rejected(os.path.join(FIXTURES, "bad-fach.csv"), "Zeile 3: fach 'eins'")

    def test_non_numeric_reihe_is_reported(self):
        self.assert_rejected(os.path.join(FIXTURES, "bad-reihe.csv"), "Zeile 3: reihe '1a'")

    def test_non_numeric_meter_is_reported(self):
        rows = [HEADER, f"1;A;;1;{MILCH};520;eins;1;1;1,00"]
        self.assert_rejected(self.write_csv(rows), "Zeile 2: meter 'eins'")

    def test_invalid_prices_are_reported(self):
        rows = [
            HEADER,
            f"1;A;;1;{MILCH};520;1;1;1;abc",
            f"2;B;;1;{MILCH};520;1;2;1;1.234,50",
            f"3;C;;1;{MILCH};520;1;3;1;0",
            f"4;D;;1;{MILCH};520;1;4;1;",
        ]
        stderr = self.assert_rejected(self.write_csv(rows), "Zeile 2: preis 'abc'")
        for line in ("Zeile 3:", "Zeile 4:", "Zeile 5:"):
            self.assertIn(line, stderr)

    def test_all_errors_are_reported_not_only_the_first(self):
        rows = [
            HEADER,
            f"1;;;1;{MILCH};520;1;1;1;1,00",
            f"1;B;;1;{MILCH};812;3;1;1;1,00",
            f"2;C;;1;{MILCH};520;1;x;1;1,00",
        ]
        code, _stdout, stderr = self.cli(self.write_csv(rows))
        self.assertEqual(code, 1)
        self.assertIn("Zeile 2: name ist leer", stderr)
        self.assertIn("Zeile 3: id 1 ist doppelt", stderr)
        self.assertIn("Zeile 3: kein Regal", stderr)
        self.assertIn("Zeile 4: fach 'x'", stderr)

    def test_missing_column_is_reported_once(self):
        header = "id;name;marke;menge;regal_label;kategorie;meter;fach;reihe"
        rows = [header, f"1;A;;1;{MILCH};520;1;1;1"]
        stderr = self.assert_rejected(self.write_csv(rows), "Pflichtspalte(n) fehlen: preis")
        self.assertEqual(stderr.count("Pflichtspalte"), 1)

    def test_unknown_column_is_reported_once(self):
        header = HEADER + ";notiz;bemerkung"
        rows = [header, f"1;A;;1;{MILCH};520;1;1;1;1,00;x;y"]
        stderr = self.assert_rejected(self.write_csv(rows), "unbekannte Spalte(n): bemerkung, notiz")
        self.assertEqual(stderr.count("unbekannte Spalte"), 1)

    def test_empty_file_is_rejected(self):
        path = self.write_bytes("leer.csv", b"")
        self.assert_rejected(path, "leer, keine Kopfzeile")

    def test_header_only_file_is_rejected(self):
        self.assert_rejected(self.write_csv([HEADER]), "keine Produktzeilen")

    def test_non_utf8_file_is_rejected(self):
        raw = (HEADER + f"\n1;Müsli;;1;{MILCH};520;1;1;1;1,00\n").encode("latin-1")
        path = self.write_bytes("latin1.csv", raw)
        self.assert_rejected(path, "nicht UTF-8-kodiert")

    def test_ambiguous_shelf_requires_regal_label(self):
        layout = self.write_layout([
            shelf("520/1", 1, "Gang 1 · links · Milchprodukte"),
            shelf("520/1", 1, "Gang 1 · links · Käse"),
        ])
        rows = [HEADER, f"1;A;;1;;520;1;1;1;1,00"]
        self.assert_rejected_with_layout(self.write_csv(rows), layout, "mehrdeutig: 2 Regale")

    def test_regal_label_selects_one_of_two_shelves(self):
        layout = self.write_layout([
            shelf("520/1", 1, "Gang 1 · links · Milchprodukte"),
            shelf("520/1", 1, "Gang 1 · links · Käse"),
        ])
        rows = [HEADER, "1;A;;1;Gang 1 · links · Käse;520;1;1;1;1,00"]
        code, _stdout, stderr = self.cli(self.write_csv(rows), layout)
        self.assertEqual(code, 0, stderr)

    def test_wrong_regal_label_is_rejected(self):
        rows = [HEADER, "1;A;;1;Gang 9 · links · Gibt es nicht;520;1;1;1;1,00"]
        self.assert_rejected(self.write_csv(rows), "Zeile 2: kein Regal im Layout")

    def assert_rejected_with_layout(self, csv_path, layout, expected_fragment):
        code, _stdout, stderr = self.cli(csv_path, layout)
        self.assertEqual(code, 1, stderr)
        self.assertIn(expected_fragment, stderr)
        self.assertFalse(os.path.exists(self.out))


# ---------------------------------------------------------------------------
# Output file safety
# ---------------------------------------------------------------------------

class OutputSafetyTests(PilotDataTestCase):

    def test_existing_out_file_untouched_on_failure(self):
        with open(self.out, "w", encoding="utf-8") as handle:
            handle.write("ALT\n")
        code, _stdout, _stderr = self.cli(os.path.join(FIXTURES, "unknown-shelf.csv"))
        self.assertEqual(code, 1)
        with open(self.out, encoding="utf-8") as handle:
            self.assertEqual(handle.read(), "ALT\n")

    def test_no_temp_files_left_behind_on_failure(self):
        self.cli(os.path.join(FIXTURES, "duplicate-id.csv"))
        self.assertEqual(sorted(os.listdir(self.dir)), [])

    def test_existing_out_file_replaced_on_success(self):
        with open(self.out, "w", encoding="utf-8") as handle:
            handle.write("ALT\n")
        code, _stdout, stderr = self.cli(os.path.join(FIXTURES, "valid.csv"))
        self.assertEqual(code, 0, stderr)
        self.assertEqual(len(self.read_ndjson()), 5)

    def test_missing_output_directory_exits_two(self):
        command = [
            sys.executable, "-I", SCRIPT, os.path.join(FIXTURES, "valid.csv"), LAYOUT_MINI,
            "--store-id", "S", "--store-code", "C", "--out", self.path("fehlt/out.ndjson"),
        ]
        completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(completed.returncode, 2)


# ---------------------------------------------------------------------------
# Summary and layout checks
# ---------------------------------------------------------------------------

class SummaryAndLayoutTests(PilotDataTestCase):

    def test_shelves_without_products_are_listed_by_label(self):
        code, stdout, stderr = self.cli(os.path.join(FIXTURES, "valid.csv"))
        self.assertEqual(code, 0, stderr)
        self.assertIn("Regale verwendet: 3 von 4", stdout)
        self.assertIn("Regale ohne Produkte: 1", stdout)
        self.assertIn("Gang 2 · rechts · Getränke", stdout)

    def test_missing_layout_file_exits_two(self):
        code, _stdout, stderr = self.cli(os.path.join(FIXTURES, "valid.csv"), self.path("gibt-es-nicht.json"))
        self.assertEqual(code, 2)
        self.assertIn("Layout nicht lesbar", stderr)
        self.assertFalse(os.path.exists(self.out))

    def test_invalid_layout_json_exits_two(self):
        path = self.write_bytes("kaputt.json", b"{ nicht json")
        code, _stdout, stderr = self.cli(os.path.join(FIXTURES, "valid.csv"), path)
        self.assertEqual(code, 2)
        self.assertIn("kein gueltiges JSON", stderr)

    def test_layout_without_elements_list_exits_two(self):
        path = self.write_bytes("ohne.json", json.dumps({"shopName": "X"}).encode("utf-8"))
        code, _stdout, _stderr = self.cli(os.path.join(FIXTURES, "valid.csv"), path)
        self.assertEqual(code, 2)

    def test_missing_entrance_only_warns(self):
        layout = self.write_layout([shelf("520/1", 1, MILCH)])
        rows = [HEADER, f"1;A;;1;{MILCH};520;1;1;1;1,00"]
        code, _stdout, stderr = self.cli(self.write_csv(rows), layout)
        self.assertEqual(code, 0, stderr)
        self.assertIn("keinen Eingang", stderr)

    def test_multiple_entrances_only_warn(self):
        layout = self.write_layout([
            {"type": "entrance", "label": "Eingang A"},
            {"type": "entrance", "label": "Eingang B"},
            shelf("520/1", 1, MILCH),
        ])
        rows = [HEADER, f"1;A;;1;{MILCH};520;1;1;1;1,00"]
        code, _stdout, stderr = self.cli(self.write_csv(rows), layout)
        self.assertEqual(code, 0, stderr)
        self.assertIn("2 Eingaenge", stderr)

    def test_meter_falls_back_to_category_suffix(self):
        layout = self.write_layout([{"type": "shelf", "category": "520/2", "label": MILCH}])
        rows = [HEADER, f"1;A;;1;{MILCH};520;2;1;1;1,00"]
        code, stdout, stderr = self.cli(self.write_csv(rows), layout)
        self.assertEqual(code, 0, stderr)
        self.assertIn("Regale verwendet: 1 von 1", stdout)

    def test_missing_meter_and_category_error_is_row_specific(self):
        rows = [HEADER, f"1;A;;1;;520;;1;1;1,00"]
        code, _stdout, stderr = self.cli(self.write_csv(rows))
        self.assertEqual(code, 1)
        self.assertIn("Zeile 2: meter '' ist keine positive ganze Zahl", stderr)

    def test_explicit_non_numeric_id_is_reported(self):
        rows = [HEADER, f"abc;A;;1;{MILCH};520;1;1;1;1,00"]
        code, _stdout, stderr = self.cli(self.write_csv(rows))
        self.assertEqual(code, 1)
        self.assertIn("Zeile 2: id 'abc' ist keine positive ganze Zahl", stderr)


if __name__ == "__main__":
    unittest.main()
