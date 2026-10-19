"""Tests fuer load_store_catalog.py. Kein Netzwerk, kein kubectl: send, ask und run sind Fakes."""

import contextlib
import io
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

import load_store_catalog as lc

NOW = datetime(2026, 10, 19, 9, 30, 15, tzinfo=timezone.utc)
BASE = "https://example.test"
CODE = "SPAR-Leonding-002"
STORE_ID = "b0308337"
STORES = [{"id": "ad61389a", "storeCode": "SPAR-Leonding-001", "name": "A"},
          {"id": STORE_ID, "storeCode": CODE, "name": "Spar HTL Leonding"}]
LAYOUT = {"source": "ACTIVE", "fallback": False,
          "layout": {"elements": [{"type": "shelf", "category": "310/1"},
                                  {"type": "shelf", "category": "520/2"},
                                  {"type": "checkout", "category": None}]}}
LEGACY = [
    {"id": 1, "name": "Gala Äpfel lose", "price": 2.99, "layoutCode": "310/1/1/1", "storeId": None, "storeCode": None},
    {"id": 2, "name": "Bio-Milch 1L", "price": 1.79, "layoutCode": "520/2/1/1", "storeId": None, "storeCode": None},
    {"id": 3, "name": "Brot", "price": 1, "layoutCode": "999/1/1/1", "storeId": None, "storeCode": None},
]


def reply(data, status=200):
    return lc.FetchResult(status, json.dumps(data))


class FakeBackend:
    """Liefert Markt, Layout und Produkte. imported steuert, was nach dem Import live steht."""

    def __init__(self, imported=None, default_search=None):
        self.imported = imported or []
        self.default_search = default_search
        self.urls = []

    def __call__(self, url):
        self.urls.append(url)
        if url == f"{BASE}/api/mobile/stores":
            return reply(STORES)
        if url == f"{BASE}/api/mobile/stores/{STORE_ID}/layout/current":
            return reply(LAYOUT)
        if url.startswith(f"{BASE}/api/products/search"):
            if "storeCode=" in url:
                return reply([p for p in self.imported])
            return reply(self.default_search if self.default_search is not None else self.imported)
        if url.startswith(f"{BASE}/api/products?"):
            if "storeCode=" in url:
                return reply(self.imported)
            return reply(LEGACY)
        return lc.FetchResult(404, "")


def in_store(*ids):
    return [dict(p, storeCode=CODE) for p in LEGACY if p["id"] in ids]


def answers(*values):
    queue = list(values)
    return lambda _prompt: queue.pop(0)


class RunCommands:
    def __init__(self, fail_on=None):
        self.calls = []
        self.fail_on = fail_on

    def __call__(self, command):
        self.calls.append(list(command))
        if self.fail_on and self.fail_on in command:
            return 1, "kaputt"
        return 0, ""


def run(argv, send, ask, run_cmd=None):
    out, err = io.StringIO(), io.StringIO()
    with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = lc.main(["--base-url", BASE, "--out-dir", tmp, *argv], send=send, ask=ask,
                       run_cmd=run_cmd or RunCommands(), now=NOW)
        files = {path.name: path.read_text(encoding="utf-8") for path in Path(tmp).iterdir()}
    return code, out.getvalue(), err.getvalue(), files


class PureLogicTest(unittest.TestCase):

    def test_select_splits_by_shelf_and_skips_store_products(self):
        rows = LEGACY + [dict(LEGACY[0], id=9, storeCode="X")]
        selection = lc.select_products(rows, {"310/1", "520/2"})
        self.assertEqual([p["id"] for p in selection.placeable], [1, 2])
        self.assertEqual([p["id"] for p in selection.no_shelf], [3])
        self.assertEqual(selection.problems, [])

    def test_select_reports_bad_rows(self):
        rows = [dict(LEGACY[0]), dict(LEGACY[0]), dict(LEGACY[1], layoutCode="520/0/1/1"),
                dict(LEGACY[1], id=5, name=" "), dict(LEGACY[1], id=6, price="x"), dict(LEGACY[1], id=True)]
        problems = lc.select_products(rows, {"310/1"}).problems
        self.assertEqual(len(problems), 5, problems)

    def test_csv_matches_admin_import_columns(self):
        text = lc.to_csv(LEGACY[:2])
        self.assertEqual(text.splitlines()[0], "id;name;kategorie;meter;fach;reihe;preis")
        self.assertEqual(text.splitlines()[1], "1;Gala Äpfel lose;310;1;1;1;2.99")

    def test_csv_quotes_separator_in_name(self):
        text = lc.to_csv([dict(LEGACY[0], name="Äpfel; rot")])
        self.assertIn('"Äpfel; rot"', text)

    def test_fallback_layout_aborts(self):
        with self.assertRaises(lc.Abort):
            lc.shelf_codes(dict(LAYOUT, fallback=True))

    def test_unknown_store_code_aborts(self):
        with self.assertRaises(lc.Abort) as ctx:
            lc.find_store(STORES, "j")
        self.assertIn("SPAR-Leonding-001", str(ctx.exception))


class FlowTest(unittest.TestCase):

    def test_happy_path_writes_csv_and_verifies(self):
        backend = FakeBackend(imported=in_store(1, 2))
        code, out, err, files = run(["--store-code", CODE], backend, answers("fertig"))
        self.assertEqual(code, 0, err)
        self.assertIn("OK: alle 2 Produkte", out)
        self.assertIn("2026-10-19-catalog-SPAR-Leonding-002.csv", files)
        self.assertIn("2026-10-19-catalog-SPAR-Leonding-002-ohne-regal.ndjson", files)

    def test_store_code_typo_aborts_before_any_file(self):
        code, _, err, files = run([], FakeBackend(), answers("j"))
        self.assertEqual(code, 1)
        self.assertIn("existiert nicht", err)
        self.assertEqual(files, {})

    def test_not_typing_fertig_stops_before_verification(self):
        backend = FakeBackend()
        code, _, err, _ = run(["--store-code", CODE], backend, answers("y"))
        self.assertEqual(code, 1)
        self.assertIn("Gestoppt", err)

    def test_missing_products_after_import_abort(self):
        code, _, err, _ = run(["--store-code", CODE], FakeBackend(imported=in_store(1)), answers("fertig"))
        self.assertEqual(code, 1)
        self.assertIn("1 von 2 Produkten fehlen", err)

    def test_set_default_needs_exact_code_and_changes_nothing_otherwise(self):
        commands = RunCommands()
        code, _, err, _ = run(["--store-code", CODE, "--set-default"], FakeBackend(imported=in_store(1, 2)),
                              answers("fertig", "j"), commands)
        self.assertEqual(code, 1)
        self.assertTrue(all("set" not in call for call in commands.calls), commands.calls)

    def test_set_default_success(self):
        commands = RunCommands()
        code, out, err, _ = run(["--store-code", CODE, "--set-default"], FakeBackend(imported=in_store(1, 2)),
                                answers("fertig", CODE), commands)
        self.assertEqual(code, 0, err)
        self.assertIn(f"CATALOG_DEFAULT_STORE_CODE={CODE}", commands.calls[1])
        self.assertIn("Default-Markt SPAR-Leonding-002 aktiv", out)

    def test_set_default_rolls_back_when_search_is_wrong(self):
        commands = RunCommands()
        backend = FakeBackend(imported=in_store(1, 2), default_search=[])
        code, _, err, _ = run(["--store-code", CODE, "--set-default"], backend, answers("fertig", CODE), commands)
        self.assertEqual(code, 1)
        self.assertIn("CATALOG_DEFAULT_STORE_CODE-", commands.calls[3])
        self.assertIn("Zurueckgenommen", err)


if __name__ == "__main__":
    unittest.main()
