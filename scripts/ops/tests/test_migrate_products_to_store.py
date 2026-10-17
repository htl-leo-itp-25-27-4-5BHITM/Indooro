"""Tests fuer migrate_products_to_store.py. Kein Netzwerk: send und sleep sind Fakes."""

import argparse
import contextlib
import io
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

import migrate_products_to_store as mp

NOW = datetime(2026, 10, 17, 9, 30, 15, tzinfo=timezone.utc)
CODE = "SPAR-Leonding-001"
TOKEN = "geheim-TEST-token-123"
ENV = {"INDOORO_ADMIN_TOKEN": TOKEN}
OUT_NAME = "2026-10-17-products-SPAR-Leonding-001.ndjson"

PRODUCTS = [
    {"id": 1, "name": "Apfel", "price": 1.5, "storeId": None, "storeCode": None, "tags": ["obst"]},
    {"id": 2, "name": "Milch", "price": 1.2, "storeId": None, "storeCode": None, "ean": "9001"},
]


def product(pid, name="Ware", store_code=None, store_id=None, **extra):
    data = {"id": pid, "name": name, "storeId": store_id, "storeCode": store_code}
    data.update(extra)
    return data


def bulk_ok(method, url, body):
    """Fake-Backend: Bulk-Aufruf speichert alle Zeilen, andere Aufrufe bekommen 404."""
    if "/api/products/bulk" not in url:
        return mp.FetchResult(status=404, body="{}")
    items = json.loads(body)
    rows = [{"row": i + 1, "id": str(p["id"]), "status": "saved", "reason": None}
            for i, p in enumerate(items)]
    payload = {"message": "All rows indexed", "count": len(rows), "saved": len(rows),
               "failed": 0, "unknown": 0, "rows": rows}
    return mp.FetchResult(status=200, body=json.dumps(payload))


class RecordingSend:
    """Zeichnet alle Aufrufe auf und antwortet ueber einen Responder."""

    def __init__(self, responder=bulk_ok):
        self.responder = responder
        self.calls = []

    def __call__(self, method, url, body, headers, timeout):
        self.calls.append({"method": method, "url": url, "body": body, "headers": dict(headers)})
        return self.responder(method, url, body)

    def urls(self, method=None):
        return [c["url"] for c in self.calls if method is None or c["method"] == method]


class FakeSleep:
    def __init__(self):
        self.calls = []

    def __call__(self, seconds):
        self.calls.append(seconds)


def run(argv, send=None, environ=None):
    """Fuehrt main aus und gibt (Exit-Code, stdout, stderr). argparse-Fehler zaehlen als Exit 2."""
    out, err = io.StringIO(), io.StringIO()
    send = send or RecordingSend()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        try:
            code = mp.main(argv, send=send, sleep=FakeSleep(), now=NOW,
                           environ=ENV if environ is None else environ)
        except SystemExit as exc:
            code = exc.code
    return code, out.getvalue(), err.getvalue(), send


def write_input(directory, products, as_array=False):
    path = Path(directory) / "input.ndjson"
    if as_array:
        path.write_text(json.dumps(products), encoding="utf-8")
    else:
        path.write_text("\n".join(json.dumps(p) for p in products) + "\n", encoding="utf-8")
    return str(path)


class ParseTest(unittest.TestCase):

    def test_ndjson_und_array_ergeben_dieselben_produkte(self):
        ndjson, p1 = mp.parse_products_text("\n".join(json.dumps(p) for p in PRODUCTS))
        array, p2 = mp.parse_products_text(json.dumps(PRODUCTS))
        self.assertEqual((p1, p2), ("", ""))
        self.assertEqual(ndjson, PRODUCTS)
        self.assertEqual(array, PRODUCTS)

    def test_leere_eingabe_ist_fehler(self):
        _, problem = mp.parse_products_text("  \n")
        self.assertIn("leer", problem)

    def test_kaputte_zeile_nennt_zeilennummer(self):
        _, problem = mp.parse_products_text('{"id": 1, "name": "a"}\n{kaputt\n')
        self.assertIn("Zeile 2", problem)

    def test_array_ist_kein_array_ist_fehler(self):
        _, problem = mp.parse_products_text("[1, 2")
        self.assertTrue(problem)


class EvaluateTest(unittest.TestCase):

    def test_zaehlt_ohne_schon_im_ziel_und_fremde_maerkte(self):
        items = [
            product(1, store_code=None),
            product(2, store_code="   "),
            product(3, store_code=CODE),
            product(4, store_code="ANDERER-002"),
            product(5, store_id="uuid-ohne-code"),
        ]
        plan = mp.evaluate_products(items, CODE)
        self.assertEqual(plan.total, 5)
        self.assertEqual([p["id"] for p in plan.to_migrate], [1, 2])
        self.assertEqual(plan.already_in_target, 1)
        self.assertEqual(plan.other_market, 2)
        self.assertEqual(plan.problems, [])

    def test_fehlende_id_und_name_sind_probleme(self):
        plan = mp.evaluate_products([{"name": "ohne id"}, {"id": 7, "name": ""}], CODE)
        self.assertTrue(any("id fehlt" in p for p in plan.problems))
        self.assertTrue(any("name fehlt" in p for p in plan.problems))

    def test_doppelte_ids_sind_probleme(self):
        plan = mp.evaluate_products([product(1), product(2), {"id": "1", "name": "Dublette"}], CODE)
        self.assertEqual(len(plan.problems), 1)
        self.assertIn("doppelte id 1", plan.problems[0])
        self.assertIn("Zeilen 1 und 3", plan.problems[0])

    def test_umschreiben_behaelt_alle_felder(self):
        original = dict(PRODUCTS[0])
        rewritten = mp.rewrite_product(original, CODE)
        self.assertEqual(rewritten["storeCode"], CODE)
        self.assertEqual(rewritten["tags"], ["obst"])
        self.assertEqual(rewritten["price"], 1.5)
        self.assertEqual(rewritten["name"], "Apfel")
        self.assertIsNone(original["storeCode"], "Original darf nicht veraendert werden")

    def test_blockbildung_100(self):
        self.assertEqual([len(b) for b in mp.chunk(list(range(250)), 100)], [100, 100, 50])
        self.assertEqual(mp.chunk([], 100), [])


class BulkResponseTest(unittest.TestCase):

    def test_alles_gespeichert(self):
        body = json.dumps({"saved": 2, "failed": 0, "unknown": 0, "rows": []})
        self.assertEqual(mp.evaluate_bulk_response(mp.FetchResult(200, body), 2), (2, []))

    def test_failed_zeile_wird_gemeldet(self):
        body = json.dumps({"saved": 1, "failed": 1, "unknown": 0, "rows": [
            {"row": 1, "id": "1", "status": "saved", "reason": None},
            {"row": 2, "id": "2", "status": "failed", "reason": "Name ungueltig"},
        ]})
        saved, problems = mp.evaluate_bulk_response(mp.FetchResult(200, body), 2)
        self.assertEqual(saved, 1)
        self.assertEqual(len(problems), 1)
        self.assertIn("Zeile 2 (id 2): failed - Name ungueltig", problems[0])

    def test_transportfehler_ist_problem(self):
        _, problems = mp.evaluate_bulk_response(mp.FetchResult(None, error="timeout"), 1)
        self.assertTrue(problems)

    def test_401_ohne_json_gibt_hinweis(self):
        _, problems = mp.evaluate_bulk_response(mp.FetchResult(401, "<html>"), 1)
        self.assertIn("Admin-Rolle", problems[0])


class DryRunTest(unittest.TestCase):

    def test_dry_run_zaehlt_schreibt_datei_und_sendet_nichts(self):
        with tempfile.TemporaryDirectory() as tmp:
            items = [*PRODUCTS, product(3, store_code=CODE), product(4, store_code="ANDERER-002")]
            src = write_input(tmp, items)
            code, out, err, send = run(["--store-code", CODE, "--input", src, "--out-dir", tmp])
            self.assertEqual(code, 0, err)
            self.assertEqual(send.calls, [], "Dry-Run darf keine Anfrage senden")
            self.assertIn("Produkte gesamt: 4", out)
            self.assertIn("Ohne Markt (zu migrieren): 2", out)
            self.assertIn("Schon im Ziel-Markt SPAR-Leonding-001: 1", out)
            self.assertIn("In anderem Markt (uebersprungen): 1", out)
            target = Path(tmp, OUT_NAME)
            lines = target.read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(lines), 2, "nur die Produkte ohne Markt landen in der Datei")
            written = [json.loads(line) for line in lines]
            self.assertTrue(all(p["storeCode"] == CODE for p in written))
            self.assertEqual(written[1]["ean"], "9001")
            self.assertIn("DRY-RUN", out)

    def test_dry_run_ohne_zu_migrierende_schreibt_keine_datei(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = write_input(tmp, [product(1, store_code=CODE)])
            code, out, _, send = run(["--store-code", CODE, "--input", src, "--out-dir", tmp])
            self.assertEqual(code, 0)
            self.assertEqual(list(Path(tmp).glob("*.ndjson")), [Path(src)])
            self.assertIn("keine Datei geschrieben", out)
            self.assertEqual(send.calls, [])

    def test_array_eingabe_funktioniert(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = write_input(tmp, PRODUCTS, as_array=True)
            code, _, _, _ = run(["--store-code", CODE, "--input", src, "--out-dir", tmp])
            self.assertEqual(code, 0)
            self.assertTrue(Path(tmp, OUT_NAME).is_file())

    def test_doppelte_ids_exit_1_ohne_datei(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = write_input(tmp, [product(1), product(1, name="zwei")])
            code, _, err, send = run(["--store-code", CODE, "--input", src, "--out-dir", tmp])
            self.assertEqual(code, 1)
            self.assertIn("doppelte id 1", err)
            self.assertFalse(Path(tmp, OUT_NAME).exists())
            self.assertEqual(send.calls, [])

    def test_fehlende_id_oder_name_exit_1(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = write_input(tmp, [{"name": "ohne id"}, {"id": 2}])
            code, _, err, _ = run(["--store-code", CODE, "--input", src, "--out-dir", tmp])
            self.assertEqual(code, 1)
            self.assertIn("id fehlt", err)
            self.assertIn("name fehlt", err)

    def test_base_url_holt_ohne_store_mit_size_10000(self):
        with tempfile.TemporaryDirectory() as tmp:
            def responder(method, url, body):
                return mp.FetchResult(status=200, body=json.dumps(PRODUCTS))
            code, _, err, send = run(["--store-code", CODE, "--base-url", "https://x.test/",
                                      "--out-dir", tmp], send=RecordingSend(responder))
            self.assertEqual(code, 0, err)
            self.assertEqual(send.urls("GET"), ["https://x.test/api/products?size=10000"])
            self.assertEqual(send.urls("POST"), [])
            self.assertTrue(Path(tmp, OUT_NAME).is_file())

    def test_quelle_zusammen_ohne_apply_ist_aufruffehler(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = write_input(tmp, PRODUCTS)
            code, _, err, send = run(["--store-code", CODE, "--input", src,
                                      "--base-url", "https://x.test", "--out-dir", tmp])
            self.assertEqual(code, 2)
            self.assertEqual(send.calls, [])

    def test_ohne_quelle_ist_aufruffehler(self):
        code, _, _, _ = run(["--store-code", CODE])
        self.assertEqual(code, 2)

    def test_ungueltige_base_url_ist_aufruffehler(self):
        code, _, _, _ = run(["--store-code", CODE, "--base-url", "ftp://x.test"])
        self.assertEqual(code, 2)

    def test_store_code_mit_leerzeichen_ist_aufruffehler(self):
        code, _, _, _ = run(["--store-code", "SPAR Leonding", "--base-url", "https://x.test"])
        self.assertEqual(code, 2)


class ApplyTest(unittest.TestCase):

    def test_fehlendes_token_exit_1_ohne_anfrage(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = write_input(tmp, PRODUCTS)
            code, _, err, send = run(["--store-code", CODE, "--input", src, "--out-dir", tmp,
                                      "--apply", "--base-url", "https://x.test"], environ={})
            self.assertEqual(code, 1)
            self.assertIn("INDOORO_ADMIN_TOKEN", err)
            self.assertEqual(send.calls, [])

    def test_apply_ohne_base_url_ist_aufruffehler(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = write_input(tmp, PRODUCTS)
            code, _, _, send = run(["--store-code", CODE, "--input", src, "--out-dir", tmp,
                                    "--apply"])
            self.assertEqual(code, 2)
            self.assertEqual(send.calls, [])

    def test_250_produkte_ergeben_drei_bulk_requests(self):
        products = [product(i, name=f"Ware {i}") for i in range(1, 251)]
        with tempfile.TemporaryDirectory() as tmp:
            src = write_input(tmp, products)
            code, out, err, send = run(["--store-code", CODE, "--input", src, "--out-dir", tmp,
                                        "--apply", "--base-url", "https://x.test"])
            self.assertEqual(code, 0, err)
            posts = [c for c in send.calls if c["method"] == "POST"]
            self.assertEqual(len(posts), 3)
            self.assertEqual([len(json.loads(c["body"])) for c in posts], [100, 100, 50])
            for call in posts:
                self.assertEqual(call["url"],
                                 f"https://x.test/api/products/bulk?storeCode={CODE}")
                self.assertEqual(call["headers"]["Authorization"], f"Bearer {TOKEN}")
                self.assertNotIn(TOKEN, call["url"])
                self.assertNotIn(TOKEN, call["body"].decode("utf-8"))
                self.assertNotIn("storeCode", json.loads(call["body"])[0])
            self.assertNotIn(TOKEN, out)
            self.assertNotIn(TOKEN, err)
            self.assertIn("Fertig: 250", out)

    def test_failed_zeile_exit_1_und_keine_weiteren_bloecke(self):
        products = [product(i) for i in range(1, 251)]

        def responder(method, url, body):
            items = json.loads(body)
            rows = [{"row": i + 1, "id": str(p["id"]),
                     "status": "failed" if p["id"] == 5 else "saved",
                     "reason": "Name ungueltig" if p["id"] == 5 else None}
                    for i, p in enumerate(items)]
            saved = sum(1 for r in rows if r["status"] == "saved")
            failed = len(rows) - saved
            return mp.FetchResult(status=200, body=json.dumps(
                {"saved": saved, "failed": failed, "unknown": 0, "rows": rows}))

        with tempfile.TemporaryDirectory() as tmp:
            src = write_input(tmp, products)
            code, out, err, send = run(["--store-code", CODE, "--input", src, "--out-dir", tmp,
                                        "--apply", "--base-url", "https://x.test"],
                                       send=RecordingSend(responder))
            self.assertEqual(code, 1)
            self.assertEqual(len(send.urls("POST")), 1, "nach fehlerhaftem Block wird nicht weiter gesendet")
            self.assertIn("Zeile 5 (id 5): failed - Name ungueltig", err)
            self.assertNotIn(TOKEN, err)

    def test_transportfehler_exit_1(self):
        def responder(method, url, body):
            if method == "POST":
                return mp.FetchResult(status=503, body='{"saved":0,"failed":0,"unknown":1,"rows":[{"row":1,"id":"1","status":"unknown","reason":"Transport failed"}]}')
            return mp.FetchResult(status=200, body=json.dumps(PRODUCTS))

        with tempfile.TemporaryDirectory() as tmp:
            code, _, err, send = run(["--store-code", CODE, "--base-url", "https://x.test",
                                      "--out-dir", tmp, "--apply"],
                                     send=RecordingSend(responder))
            self.assertEqual(code, 1)
            self.assertIn("unknown", err)
            self.assertEqual(len(send.urls("POST")), 1, "POST wird nicht wiederholt")
            self.assertNotIn(TOKEN, err)

    def test_403_exit_1(self):
        def responder(method, url, body):
            if method == "POST":
                return mp.FetchResult(status=403, body="")
            return mp.FetchResult(status=200, body=json.dumps(PRODUCTS))

        with tempfile.TemporaryDirectory() as tmp:
            code, _, err, _ = run(["--store-code", CODE, "--base-url", "https://x.test",
                                   "--out-dir", tmp, "--apply"], send=RecordingSend(responder))
            self.assertEqual(code, 1)
            self.assertIn("HTTP 403", err)


class DeleteLegacyTest(unittest.TestCase):
    """Zustandsbehafteter OpenSearch-Fake: zaehlt Dokumente und loescht per _delete_by_query."""

    def make_os(self, legacy, migrated):
        state = {"legacy": legacy, "migrated": migrated, "deletes": 0}

        def responder(method, url, body):
            if url.endswith("/products/_count"):
                query = json.loads(body)
                if "must_not" in json.dumps(query):
                    return mp.FetchResult(status=200, body=json.dumps({"count": state["legacy"]}))
                return mp.FetchResult(status=200, body=json.dumps({"count": state["migrated"]}))
            if "_delete_by_query" in url:
                state["deletes"] += 1
                deleted = state["legacy"]
                state["legacy"] = 0
                return mp.FetchResult(status=200, body=json.dumps(
                    {"deleted": deleted, "failures": [], "timed_out": False}))
            return mp.FetchResult(status=404, body="{}")

        return RecordingSend(responder), state

    def test_sicherheitsabbruch_wenn_migriert_kleiner_als_legacy(self):
        send, state = self.make_os(legacy=3, migrated=2)
        code, _, err, _ = run(["--store-code", CODE, "--delete-legacy", "--yes",
                               "--opensearch-url", "http://127.0.0.1:9200"], send=send)
        self.assertEqual(code, 1)
        self.assertIn("Abbruch", err)
        self.assertEqual(state["deletes"], 0)
        self.assertEqual(send.urls("POST"), [])

    def test_keine_legacy_dokumente_ist_abbruch(self):
        send, state = self.make_os(legacy=0, migrated=5)
        code, _, _, _ = run(["--store-code", CODE, "--delete-legacy", "--yes",
                             "--opensearch-url", "http://localhost:9200"], send=send)
        self.assertEqual(code, 1)
        self.assertEqual(state["deletes"], 0)

    def test_dry_run_ohne_yes_loescht_nicht(self):
        send, state = self.make_os(legacy=153, migrated=153)
        code, out, err, _ = run(["--store-code", CODE, "--delete-legacy",
                                 "--opensearch-url", "http://127.0.0.1:9200"], send=send)
        self.assertEqual(code, 0, err)
        self.assertEqual(state["deletes"], 0)
        self.assertEqual(send.urls("POST"), [])
        self.assertIn("wuerde 153 Dokumente", out)

    def test_mit_yes_genau_ein_delete_by_query(self):
        send, state = self.make_os(legacy=153, migrated=153)
        code, out, err, _ = run(["--store-code", CODE, "--delete-legacy", "--yes",
                                 "--opensearch-url", "http://127.0.0.1:9200"], send=send)
        self.assertEqual(code, 0, err)
        deletes = [u for u in send.urls("POST") if "_delete_by_query" in u]
        self.assertEqual(deletes, ["http://127.0.0.1:9200/products/_delete_by_query?refresh=true"])
        body = json.loads(next(c["body"] for c in send.calls if c["method"] == "POST"))
        self.assertEqual(body, {"query": {"bool": {"must_not": {"exists": {"field": "storeCode"}}}}})
        self.assertIn("153 Dokumente ohne storeCode geloescht", out)

    def test_delete_mit_failures_exit_1(self):
        def responder(method, url, body):
            if "_delete_by_query" in url:
                return mp.FetchResult(status=200, body=json.dumps(
                    {"deleted": 1, "failures": [{"cause": "x"}], "timed_out": False}))
            return mp.FetchResult(status=200, body=json.dumps({"count": 2}))

        code, _, err, _ = run(["--store-code", CODE, "--delete-legacy", "--yes",
                               "--opensearch-url", "http://127.0.0.1:9200"],
                              send=RecordingSend(responder))
        self.assertEqual(code, 1)
        self.assertIn("Fehler", err)

    def test_nicht_loopback_wird_abgelehnt(self):
        for url in ("http://opensearch.example.test:9200", "https://10.0.0.5:9200",
                    "http://192.168.1.10", "http://user@127.0.0.1:9200/x"):
            with self.subTest(url=url):
                send, _ = self.make_os(legacy=1, migrated=1)
                code, _, _, _ = run(["--store-code", CODE, "--delete-legacy", "--yes",
                                     "--opensearch-url", url], send=send)
                self.assertEqual(code, 2)
                self.assertEqual(send.calls, [])

    def test_loopback_hosts_werden_akzeptiert(self):
        for url in ("http://127.0.0.1:9200", "http://localhost:9200/", "http://[::1]:9200"):
            with self.subTest(url=url):
                self.assertEqual(mp.parse_opensearch_url(url), url.rstrip("/"))

    def test_delete_legacy_braucht_opensearch_url(self):
        send, _ = self.make_os(legacy=1, migrated=1)
        code, _, _, _ = run(["--store-code", CODE, "--delete-legacy"], send=send)
        self.assertEqual(code, 2, "--opensearch-url fehlt")

    def test_delete_legacy_nicht_mit_apply_kombinierbar(self):
        send, _ = self.make_os(legacy=1, migrated=1)
        code, _, _, _ = run(["--store-code", CODE, "--delete-legacy", "--apply",
                             "--base-url", "https://x.test",
                             "--opensearch-url", "http://127.0.0.1:9200"], send=send)
        self.assertEqual(code, 2)
        self.assertEqual(send.calls, [])


class HelpTest(unittest.TestCase):

    def test_help_exit_0(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), self.assertRaises(SystemExit) as cm:
            mp.build_parser().parse_args(["--help"])
        self.assertEqual(cm.exception.code, 0)
        self.assertIn("--store-code", out.getvalue())

    def test_argument_problem_parser_types(self):
        parser = mp.build_parser()
        args = parser.parse_args(["--store-code", CODE, "--input", "x.ndjson"])
        self.assertEqual(mp.argument_problem(args), "")
        self.assertEqual(args.token_env, "INDOORO_ADMIN_TOKEN")
        self.assertIsInstance(args, argparse.Namespace)


if __name__ == "__main__":
    unittest.main()
