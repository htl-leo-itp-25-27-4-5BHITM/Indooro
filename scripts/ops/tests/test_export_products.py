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
