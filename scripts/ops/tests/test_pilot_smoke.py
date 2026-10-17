"""Tests fuer pilot_smoke.py. Kein Netzwerk: fetch wird durch Fakes ersetzt."""

import argparse
import contextlib
import io
import json
import unittest
import urllib.error
from unittest import mock

import pilot_smoke as ps

STORE_ID = "7b1e2c3d-4a5f-4b6c-8d9e-0f1a2b3c4d5e"
OTHER_STORE_ID = "11111111-2222-4333-8444-555555555555"

STORES_OK = json.dumps([
    {"id": STORE_ID, "storeCode": "PILOT", "name": "Pilot Store", "city": "Leonding"},
    {"id": OTHER_STORE_ID, "storeCode": "DEMO", "name": "Demo", "city": "Linz"},
])

LAYOUT_OK = json.dumps({
    "storeId": STORE_ID,
    "layoutId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    "source": "ACTIVE",
    "fallback": False,
    "layout": {
        "elements": [
            {"type": "shelf", "id": "s1"},
            {"type": "shelf", "id": "s2"},
            {"type": "shelf", "id": "s3"},
            {"type": "beacon", "id": "b1"},
            {"type": "beacon", "id": "b2"},
            {"type": "anchor", "id": "a1"},
        ]
    },
})

SEARCH_OK = json.dumps([
    {"id": "p1", "name": "Apfel rot"},
    {"id": "p2", "name": "Apfelsaft"},
])

CATEGORIES_OK = json.dumps([{"id": "c1"}, {"id": "c2"}, {"id": "c3"}])


class FakeFetch:
    """Liefert je URL-Teil eine feste Antwort und merkt sich die Aufrufe."""

    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    def __call__(self, url, timeout):
        self.calls.append(url)
        for fragment, response in self.responses.items():
            if fragment in url:
                return response
        raise AssertionError(f"unerwartete URL: {url}")


def ok(body):
    return ps.FetchResult(status=200, body=body)


def healthy_responses():
    return {
        "/api/mobile/stores/": ok(LAYOUT_OK),
        "/api/mobile/stores": ok(STORES_OK),
        "/api/products/search": ok(SEARCH_OK),
        "/api/categories": ok(CATEGORIES_OK),
    }


class EvaluateStoresTest(unittest.TestCase):

    def test_ok_with_target_store(self):
        result = ps.evaluate_stores(200, STORES_OK, STORE_ID)
        self.assertTrue(result.ok)
        self.assertEqual(result.numbers["stores"], 2)
        self.assertEqual(result.numbers["target_found"], 1)

    def test_store_id_match_ignores_case(self):
        result = ps.evaluate_stores(200, STORES_OK, STORE_ID.upper())
        self.assertTrue(result.ok)

    def test_status_500_fails(self):
        result = ps.evaluate_stores(500, '{"error": "boom"}', STORE_ID)
        self.assertFalse(result.ok)
        self.assertEqual(result.status, 500)

    def test_empty_list_fails(self):
        result = ps.evaluate_stores(200, "[]", STORE_ID)
        self.assertFalse(result.ok)
        self.assertEqual(result.numbers["stores"], 0)

    def test_store_id_not_contained_fails(self):
        result = ps.evaluate_stores(200, STORES_OK, "00000000-0000-4000-8000-000000000000")
        self.assertFalse(result.ok)
        self.assertEqual(result.numbers["stores"], 2)
        self.assertEqual(result.numbers["target_found"], 0)

    def test_broken_json_fails_without_traceback(self):
        result = ps.evaluate_stores(200, "[{", STORE_ID)
        self.assertFalse(result.ok)
        self.assertIn("JSON", result.message)

    def test_empty_body_fails(self):
        result = ps.evaluate_stores(200, "   ", STORE_ID)
        self.assertFalse(result.ok)

    def test_non_list_fails(self):
        result = ps.evaluate_stores(200, '{"id": "x"}', STORE_ID)
        self.assertFalse(result.ok)


class EvaluateLayoutTest(unittest.TestCase):

    def test_counts_shelves_beacons_anchors(self):
        result = ps.evaluate_layout(200, LAYOUT_OK)
        self.assertTrue(result.ok)
        self.assertEqual(result.numbers, {"shelves": 3, "beacons": 2, "anchors": 1})

    def test_layout_without_shelves_fails(self):
        body = json.dumps({"layout": {"elements": [{"type": "beacon"}, {"type": "anchor"}]}})
        result = ps.evaluate_layout(200, body)
        self.assertFalse(result.ok)
        self.assertEqual(result.numbers["shelves"], 0)

    def test_empty_elements_fails(self):
        result = ps.evaluate_layout(200, json.dumps({"layout": {"elements": []}}))
        self.assertFalse(result.ok)

    def test_status_500_fails(self):
        result = ps.evaluate_layout(500, LAYOUT_OK)
        self.assertFalse(result.ok)

    def test_missing_layout_key_fails(self):
        result = ps.evaluate_layout(200, json.dumps({"storeId": STORE_ID}))
        self.assertFalse(result.ok)

    def test_broken_json_fails(self):
        result = ps.evaluate_layout(200, "{nope")
        self.assertFalse(result.ok)


class EvaluateSearchTest(unittest.TestCase):

    def test_two_hits_ok(self):
        result = ps.evaluate_search(200, SEARCH_OK)
        self.assertTrue(result.ok)
        self.assertEqual(result.numbers["products"], 2)

    def test_empty_result_fails(self):
        result = ps.evaluate_search(200, "[]")
        self.assertFalse(result.ok)
        self.assertEqual(result.numbers["products"], 0)

    def test_status_500_fails(self):
        self.assertFalse(ps.evaluate_search(500, SEARCH_OK).ok)

    def test_broken_json_fails(self):
        self.assertFalse(ps.evaluate_search(200, "[1,").ok)


class CategoriesTest(unittest.TestCase):

    def test_counts_categories(self):
        result = ps.evaluate_categories(200, CATEGORIES_OK)
        self.assertTrue(result.ok)
        self.assertEqual(result.numbers["categories"], 3)
        self.assertFalse(result.required)

    def test_500_is_blocking(self):
        result = ps.evaluate_categories(500, "")
        self.assertFalse(result.ok)
        self.assertTrue(ps.is_blocking(result))

    def test_404_is_information_only(self):
        result = ps.evaluate_categories(404, "")
        self.assertFalse(result.ok)
        self.assertFalse(ps.is_blocking(result))
        self.assertTrue(ps.format_result(result).startswith("INFO"))


class UrlAndFormatTest(unittest.TestCase):

    def test_build_urls_encodes_query_and_store(self):
        urls = ps.build_urls("https://example.test/", "a b", "Apfel Saft&x")
        self.assertEqual(urls["stores"], "https://example.test/api/mobile/stores")
        self.assertEqual(urls["layout"],
                         "https://example.test/api/mobile/stores/a%20b/layout/current")
        self.assertIn("q=Apfel+Saft%26x", urls["search"])
        self.assertEqual(urls["categories"], "https://example.test/api/categories")

    def test_parse_base_url_accepts_https_and_strips_slash(self):
        self.assertEqual(ps.parse_base_url("https://it220209.example.test/"),
                         "https://it220209.example.test")

    def test_parse_base_url_rejects_other_schemes(self):
        for value in ("ftp://example.test", "file:///etc/passwd", "example.test"):
            with self.subTest(value=value), self.assertRaises(argparse.ArgumentTypeError):
                ps.parse_base_url(value)

    def test_format_and_summary(self):
        results = ps.run_checks(FakeFetch(healthy_responses()), "https://x.test", STORE_ID,
                                "apfel", 5)
        lines = [ps.format_result(r) for r in results]
        self.assertTrue(lines[0].startswith(f"OK stores status=200 stores=2 target_found=1"))
        self.assertTrue(lines[1].startswith("OK layout status=200 shelves=3 beacons=2"))
        self.assertTrue(lines[2].startswith("OK search status=200 products=2"))
        self.assertEqual(ps.summary_line(results),
                         "stores=2 shelves=3 beacons=2 products=2")


class RunChecksTest(unittest.TestCase):

    def test_all_ok_with_correct_numbers(self):
        fetch = FakeFetch(healthy_responses())
        results = ps.run_checks(fetch, "https://x.test", STORE_ID, "apfel", 5)
        self.assertTrue(all(r.ok for r in results))
        self.assertEqual(len(fetch.calls), 4)

    def test_network_error_is_fail_not_exception(self):
        def fetch(url, timeout):
            if "layout" in url:
                return ps.FetchResult(status=None, error="timed out")
            return healthy_responses()[next(k for k in healthy_responses() if k in url)]

        results = ps.run_checks(fetch, "https://x.test", STORE_ID, "apfel", 5)
        layout = next(r for r in results if r.name == "layout")
        self.assertFalse(layout.ok)
        self.assertIsNone(layout.status)
        self.assertIn("timed out", layout.message)


class MainTest(unittest.TestCase):

    def run_main(self, argv, fetch):
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            code = ps.main(argv, fetch=fetch)
        return code, buffer.getvalue()

    def test_main_all_ok_returns_0(self):
        code, out = self.run_main(["https://x.test", STORE_ID, "apfel"],
                                  FakeFetch(healthy_responses()))
        self.assertEqual(code, 0)
        self.assertIn("stores=2 shelves=3 beacons=2 products=2", out)
        self.assertIn("Ergebnis: OK", out)

    def test_main_layout_500_returns_1(self):
        responses = healthy_responses()
        responses["/api/mobile/stores/"] = ps.FetchResult(status=500, body="{}")
        code, out = self.run_main(["https://x.test", STORE_ID, "apfel"], FakeFetch(responses))
        self.assertEqual(code, 1)
        self.assertIn("FAIL layout status=500", out)

    def test_main_network_error_returns_1_without_traceback(self):
        def fetch(url, timeout):
            return ps.FetchResult(status=None, error="connection refused")

        code, out = self.run_main(["https://x.test", STORE_ID, "apfel"], fetch)
        self.assertEqual(code, 1)
        self.assertIn("FAIL stores status=-", out)

    def test_main_categories_404_alone_still_returns_0(self):
        responses = healthy_responses()
        responses["/api/categories"] = ps.FetchResult(status=404, body="")
        code, _ = self.run_main(["https://x.test", STORE_ID, "apfel"], FakeFetch(responses))
        self.assertEqual(code, 0)

    def test_main_rejects_non_http_url(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as cm:
            ps.main(["ftp://x.test", STORE_ID, "apfel"], fetch=FakeFetch({}))
        self.assertEqual(cm.exception.code, 2)


class HttpGetTest(unittest.TestCase):

    def test_url_error_becomes_fetch_result(self):
        error = urllib.error.URLError("no route to host")
        with mock.patch("urllib.request.urlopen", side_effect=error):
            result = ps.http_get("https://x.test/api/mobile/stores", 5)
        self.assertIsNone(result.status)
        self.assertIn("no route", result.error)

    def test_http_error_keeps_status(self):
        error = urllib.error.HTTPError("https://x.test", 503, "unavailable", {}, io.BytesIO(b"down"))
        with mock.patch("urllib.request.urlopen", side_effect=error):
            result = ps.http_get("https://x.test/api/mobile/stores", 5)
        self.assertEqual(result.status, 503)


if __name__ == "__main__":
    unittest.main()
