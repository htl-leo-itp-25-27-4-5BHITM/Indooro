"""Tests fuer export_products.py. Kein Netzwerk: fetch und sleep sind Fakes."""

import argparse
import contextlib
import io
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

import export_products as ep

NOW = datetime(2026, 10, 17, 9, 30, 15, tzinfo=timezone.utc)
PRODUCTS = [
    {"id": "p1", "name": "Apfel", "price": 1.5},
    {"id": "p2", "name": "Käse", "price": 3.2},
]


class SequenceFetch:
    """Gibt der Reihe nach die vorbereiteten Antworten zurueck."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def __call__(self, url, timeout):
        self.calls.append((url, timeout))
        return self.responses.pop(0)


class FakeSleep:
    def __init__(self):
        self.calls = []

    def __call__(self, seconds):
        self.calls.append(seconds)


def ok_products(items=PRODUCTS):
    return ep.FetchResult(status=200, body=json.dumps(items))


class ArgumentTest(unittest.TestCase):

    def test_parse_base_url_accepts_http_and_https(self):
        self.assertEqual(ep.parse_base_url("http://localhost:8080/"), "http://localhost:8080")
        self.assertEqual(ep.parse_base_url("https://it220209.example.test"),
                         "https://it220209.example.test")

    def test_parse_base_url_rejects_other_schemes_and_missing_host(self):
        for value in ("ftp://x.test", "file:///tmp/x", "x.test", "https://"):
            with self.subTest(value=value), self.assertRaises(argparse.ArgumentTypeError):
                ep.parse_base_url(value)

    def test_defaults(self):
        args = ep.build_parser().parse_args(["--base-url", "https://x.test"])
        self.assertEqual(args.size, 10000)
        self.assertEqual(args.out_dir, "backups")
        self.assertEqual(args.timeout, 30.0)
        self.assertEqual(args.retries, 2)

    def test_invalid_url_exits_with_2(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as cm:
            ep.main(["--base-url", "ftp://x.test"], fetch=SequenceFetch([]))
        self.assertEqual(cm.exception.code, 2)

    def test_products_url_contains_size(self):
        self.assertEqual(ep.products_url("https://x.test/", 500),
                         "https://x.test/api/products?size=500")


class WriteTest(unittest.TestCase):

    def run_main(self, argv, fetch, sleep=None):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
            code = ep.main(argv, fetch=fetch, sleep=sleep or FakeSleep(), now=NOW)
        return code, out.getvalue()

    def test_writes_ndjson_one_line_per_product(self):
        with tempfile.TemporaryDirectory() as tmp:
            fetch = SequenceFetch([ok_products()])
            code, out = self.run_main(
                ["--base-url", "https://x.test", "--out-dir", tmp, "--size", "50"], fetch)
            self.assertEqual(code, 0)
            target = Path(tmp) / "2026-10-17-products.ndjson"
            self.assertTrue(target.is_file())
            lines = target.read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(lines), 2)
            self.assertEqual([json.loads(line) for line in lines], PRODUCTS)
            self.assertIn("Käse", target.read_text(encoding="utf-8"))
            self.assertIn("2 Produkte", out)
            self.assertEqual(fetch.calls[0][0], "https://x.test/api/products?size=50")

    def test_existing_file_gets_time_suffix(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "2026-10-17-products.ndjson").write_text("alt\n", encoding="utf-8")
            code, _ = self.run_main(
                ["--base-url", "https://x.test", "--out-dir", tmp], SequenceFetch([ok_products()]))
            self.assertEqual(code, 0)
            self.assertTrue(Path(tmp, "2026-10-17-products-093015.ndjson").is_file())
            self.assertEqual(Path(tmp, "2026-10-17-products.ndjson").read_text(encoding="utf-8"),
                             "alt\n")

    def test_retry_503_twice_then_200(self):
        with tempfile.TemporaryDirectory() as tmp:
            fetch = SequenceFetch([
                ep.FetchResult(status=503), ep.FetchResult(status=503), ok_products(),
            ])
            sleep = FakeSleep()
            code, _ = self.run_main(["--base-url", "https://x.test", "--out-dir", tmp],
                                    fetch, sleep)
            self.assertEqual(code, 0)
            self.assertEqual(len(fetch.calls), 3)
            self.assertEqual(len(sleep.calls), 2)
            self.assertTrue(Path(tmp, "2026-10-17-products.ndjson").is_file())

    def test_retries_exhausted_returns_1_and_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            fetch = SequenceFetch([ep.FetchResult(status=500)] * 3)
            code, _ = self.run_main(["--base-url", "https://x.test", "--out-dir", tmp],
                                    fetch, FakeSleep())
            self.assertEqual(code, 1)
            self.assertEqual(len(fetch.calls), 3)
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_network_error_is_retried_then_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            fetch = SequenceFetch([ep.FetchResult(status=None, error="timeout")] * 3)
            code, _ = self.run_main(["--base-url", "https://x.test", "--out-dir", tmp,
                                     "--retries", "2"], fetch, FakeSleep())
            self.assertEqual(code, 1)
            self.assertEqual(len(fetch.calls), 3)

    def test_zero_products_returns_1(self):
        with tempfile.TemporaryDirectory() as tmp:
            out_err = io.StringIO()
            with contextlib.redirect_stderr(out_err), contextlib.redirect_stdout(io.StringIO()):
                code = ep.main(["--base-url", "https://x.test", "--out-dir", tmp],
                               fetch=SequenceFetch([ep.FetchResult(status=200, body="[]")]),
                               sleep=FakeSleep(), now=NOW)
            self.assertEqual(code, 1)
            self.assertIn("leerer Index", out_err.getvalue())
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_404_returns_1_without_retry(self):
        with tempfile.TemporaryDirectory() as tmp:
            fetch = SequenceFetch([ep.FetchResult(status=404, body="nope")])
            sleep = FakeSleep()
            code, _ = self.run_main(["--base-url", "https://x.test", "--out-dir", tmp],
                                    fetch, sleep)
            self.assertEqual(code, 1)
            self.assertEqual(len(fetch.calls), 1)
            self.assertEqual(sleep.calls, [])

    def test_non_array_returns_1(self):
        with tempfile.TemporaryDirectory() as tmp:
            fetch = SequenceFetch([ep.FetchResult(status=200, body='{"items": []}')])
            code, _ = self.run_main(["--base-url", "https://x.test", "--out-dir", tmp],
                                    fetch)
            self.assertEqual(code, 1)


OS_URL = "http://127.0.0.1:9200"
OS_DOCS = [
    ("SPAR-Leonding-002:7", {"id": 7, "name": "Hafermilch", "price": 1.9, "storeCode": "SPAR-Leonding-002"}),
    ("1", {"id": 1, "name": "Apfel", "price": 1.5, "storeCode": None}),
    ("SPAR-Leonding-002:8", {"id": 8, "name": "Käse", "price": 3.2, "storeCode": "SPAR-Leonding-002"}),
    ("2", {"id": 2, "name": "Milch", "price": 1.2}),
    ("SPAR-Leonding-001:3", {"id": 3, "name": "Brot", "price": 2.0, "storeCode": "SPAR-Leonding-001"}),
]


class RecordingSend:
    """Fake-OpenSearch: Alias, Scroll in Seiten zu 2 Treffern, _count. Zeichnet alle Aufrufe auf."""

    def __init__(self, docs=OS_DOCS, alias=("products_v1",), count=None, page=2, status=200,
                 start_status=200):
        self.docs = list(docs)
        self.alias = list(alias)
        self.count = len(docs) if count is None else count
        self.page = page
        self.status = status
        self.start_status = start_status
        self.calls = []

    def hits(self, start):
        return [{"_id": doc_id, "_source": source} for doc_id, source in self.docs[start:start + self.page]]

    def __call__(self, method, url, body, headers, timeout):
        self.calls.append({"method": method, "url": url, "body": body})
        if url.endswith("/_count"):
            return ep.FetchResult(status=self.status, body=json.dumps({"count": self.count}))
        if "/_search/scroll" in url:
            position = json.loads(body)["scroll_id"]
            start = int(position)
            return ep.FetchResult(status=200, body=json.dumps(
                {"_scroll_id": str(start + self.page), "hits": {"hits": self.hits(start)}}))
        if "_search?scroll=" in url:
            return ep.FetchResult(status=self.start_status, body=json.dumps(
                {"_scroll_id": str(self.page), "hits": {"hits": self.hits(0)}}))
        if method == "GET":
            if not self.alias:
                return ep.FetchResult(status=404, body="{}")
            return ep.FetchResult(status=200, body=json.dumps({name: {"aliases": {}} for name in self.alias}))
        return ep.FetchResult(status=404, body="{}")

    def methods(self):
        return {c["method"] for c in self.calls}


class OpenSearchExportTest(unittest.TestCase):

    def run_main(self, argv, send, fetch=None):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            try:
                code = ep.main(argv, fetch=fetch or SequenceFetch([]), sleep=FakeSleep(), now=NOW, send=send)
            except SystemExit as exc:
                code = exc.code
        return code, out.getvalue(), err.getvalue()

    def test_exports_legacy_and_all_stores_sorted_by_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            send = RecordingSend()
            code, out, err = self.run_main(["--opensearch-url", OS_URL, "--out-dir", tmp], send)
            self.assertEqual(code, 0, err)
            target = Path(tmp) / "2026-10-17-products-all.ndjson"
            rows = [json.loads(line) for line in target.read_text(encoding="utf-8").splitlines()]
            self.assertEqual([r["id"] for r in rows], [1, 2, 3, 7, 8])
            self.assertEqual(sum(1 for r in rows if not r.get("storeCode")), 2)
            self.assertIn("Käse", target.read_text(encoding="utf-8"))
            self.assertIn("5 Produkte", out)
            self.assertIn("Ohne storeCode: 2", out)
            self.assertIn("Markt SPAR-Leonding-002: 2", out)
            self.assertIn("Markt SPAR-Leonding-001: 1", out)
            self.assertIn("products_live -> products_v1", out)

    def test_default_index_is_alias_and_index_option_is_used(self):
        with tempfile.TemporaryDirectory() as tmp:
            send = RecordingSend()
            self.run_main(["--opensearch-url", OS_URL, "--out-dir", tmp], send)
            urls = [c["url"] for c in send.calls]
            self.assertEqual(urls[0], f"{OS_URL}/products_live")
            self.assertIn(f"{OS_URL}/products_live/_search?scroll=2m", urls)
            self.assertIn(f"{OS_URL}/products_live/_count", urls)
            send = RecordingSend()
            self.run_main(["--opensearch-url", OS_URL, "--index", "products_v1", "--out-dir", tmp], send)
            self.assertIn(f"{OS_URL}/products_v1/_count", [c["url"] for c in send.calls])

    def test_only_read_calls_are_made(self):
        with tempfile.TemporaryDirectory() as tmp:
            send = RecordingSend()
            self.run_main(["--opensearch-url", OS_URL, "--out-dir", tmp], send)
            for call in send.calls:
                self.assertIn(call["method"], ("GET", "POST"))
                if call["method"] == "POST":
                    self.assertTrue("_search" in call["url"], call["url"])
                    self.assertNotIn("_delete", call["url"])
                    self.assertNotIn("_update", call["url"])
                    self.assertNotIn("_bulk", call["url"])

    def test_count_mismatch_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            code, _, err = self.run_main(["--opensearch-url", OS_URL, "--out-dir", tmp],
                                         RecordingSend(count=6))
            self.assertEqual(code, 1)
            self.assertIn("_count meldet 6", err)
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_alias_with_two_indices_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            send = RecordingSend(alias=("products", "products_v1"))
            code, _, err = self.run_main(["--opensearch-url", OS_URL, "--out-dir", tmp], send)
            self.assertEqual(code, 1)
            self.assertIn("2 Indizes", err)
            self.assertEqual(len(send.calls), 1)

    def test_unknown_index_returns_1(self):
        with tempfile.TemporaryDirectory() as tmp:
            code, _, err = self.run_main(["--opensearch-url", OS_URL, "--out-dir", tmp],
                                         RecordingSend(alias=()))
            self.assertEqual(code, 1)
            self.assertIn("nicht gefunden", err)

    def test_empty_index_returns_1(self):
        with tempfile.TemporaryDirectory() as tmp:
            code, _, err = self.run_main(["--opensearch-url", OS_URL, "--out-dir", tmp],
                                         RecordingSend(docs=[]))
            self.assertEqual(code, 1)
            self.assertIn("leerer Index", err)
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_search_error_returns_1(self):
        with tempfile.TemporaryDirectory() as tmp:
            code, _, err = self.run_main(["--opensearch-url", OS_URL, "--out-dir", tmp],
                                         RecordingSend(start_status=500))
            self.assertEqual(code, 1)
            self.assertIn("HTTP 500", err)
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_network_error_returns_1(self):
        def broken(method, url, body, headers, timeout):
            return ep.FetchResult(status=None, error="refused")

        with tempfile.TemporaryDirectory() as tmp:
            code, _, err = self.run_main(["--opensearch-url", OS_URL, "--out-dir", tmp], broken)
            self.assertEqual(code, 1)
            self.assertIn("nicht erreichbar", err)

    def test_duplicate_document_ids_return_1(self):
        docs = OS_DOCS + [("1", {"id": 1, "name": "Apfel"})]
        with tempfile.TemporaryDirectory() as tmp:
            code, _, err = self.run_main(["--opensearch-url", OS_URL, "--out-dir", tmp],
                                         RecordingSend(docs=docs))
            self.assertEqual(code, 1)
            self.assertIn("mehrfach", err)

    def test_non_loopback_is_rejected_without_calls(self):
        for url in ("http://opensearch.example.test:9200", "https://10.0.0.5:9200",
                    "http://user@127.0.0.1:9200", "http://127.0.0.1:9200/products"):
            with self.subTest(url=url):
                send = RecordingSend()
                code, _, _ = self.run_main(["--opensearch-url", url], send)
                self.assertEqual(code, 2)
                self.assertEqual(send.calls, [])

    def test_one_source_is_required_and_exclusive(self):
        for argv in ([], ["--opensearch-url", OS_URL, "--base-url", "https://x.test"]):
            with self.subTest(argv=argv):
                code, _, _ = self.run_main(argv, RecordingSend())
                self.assertEqual(code, 2)

    def test_invalid_index_name_is_rejected(self):
        for name in ("*", "a,b", "../x", "Products", ""):
            with self.subTest(name=name):
                code, _, _ = self.run_main(["--opensearch-url", OS_URL, "--index", name], RecordingSend())
                self.assertEqual(code, 2)

    def test_base_url_mode_warns_about_partial_export(self):
        with tempfile.TemporaryDirectory() as tmp:
            send = RecordingSend()
            code, _, err = self.run_main(["--base-url", "https://x.test", "--out-dir", tmp], send,
                                         fetch=SequenceFetch([ok_products()]))
            self.assertEqual(code, 0)
            self.assertIn("Teilexport", err)
            self.assertEqual(send.calls, [])


class ValidateResponseTest(unittest.TestCase):

    def test_valid_array(self):
        items, problem = ep.validate_products_response(200, json.dumps(PRODUCTS))
        self.assertEqual(problem, "")
        self.assertEqual(len(items), 2)

    def test_invalid_json(self):
        _, problem = ep.validate_products_response(200, "<html>")
        self.assertIn("kein JSON", problem)

    def test_none_status(self):
        _, problem = ep.validate_products_response(None, "")
        self.assertTrue(problem)


if __name__ == "__main__":
    unittest.main()
