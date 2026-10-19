"""Tests fuer scripts/ops/smoke_check.sh gegen einen lokalen Stub-Server (ohne Cluster)."""

import json
import re
import shutil
import subprocess
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "smoke_check.sh"


def make_handler(routes, seen):
    class Handler(BaseHTTPRequestHandler):
        def _respond(self):
            seen.append((self.command, self.path, self.headers.get("Authorization")))
            path = self.path.split("?", 1)[0]
            # exact path+query wins (lets a test make one store empty), else path only
            status, body = routes.get(self.path) or routes.get(path, (404, b""))
            self.send_response(status)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        do_GET = do_POST = do_PUT = do_DELETE = do_PATCH = do_HEAD = _respond

        def log_message(self, *args):
            pass

    return Handler


def healthy_routes():
    stores = json.dumps([{"storeCode": "LEO-1"}]).encode()
    return {
        "/api/mobile/stores": (200, stores),
        "/api/categories": (200, b"[]"),
        "/api/products": (200, json.dumps([{"id": 1, "name": "Milch"}]).encode()),
        "/api/products/search": (200, json.dumps([{"id": 1, "name": "Milch"}]).encode()),
        "/customer/": (200, b"<html></html>"),
        "/admin/": (302, b""),
        "/admin/next/": (302, b""),
        "/admin/next/stores/readiness/": (302, b""),
        "/admin/next/stores/anchors/": (302, b""),
        "/api/admin/me": (401, b""),
        "/api/admin/products": (401, b""),
        "/api/admin/logs": (401, b""),
        "/api/admin/index": (401, b""),
    }


@unittest.skipUnless(shutil.which("bash") and shutil.which("curl"), "bash und curl noetig")
class SmokeCheckTest(unittest.TestCase):

    def run_script(self, routes, *args):
        seen = []
        server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(routes, seen))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            base = f"http://127.0.0.1:{server.server_address[1]}"
            result = subprocess.run(["bash", str(SCRIPT), base, *args], capture_output=True,
                                    text=True, timeout=60)
        finally:
            server.shutdown()
            server.server_close()
        return result, seen

    def test_healthy_stack_passes(self):
        result, _ = self.run_script(healthy_routes())
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("0 FAIL", result.stdout)

    def test_store_code_is_taken_from_store_list(self):
        result, seen = self.run_script(healthy_routes())
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertTrue(any("storeCode=LEO-1" in path for _, path, _ in seen), seen)

    def test_empty_store_product_list_fails_despite_200(self):
        routes = healthy_routes()
        routes["/api/products?size=5&storeCode=LEO-1"] = (200, b"[]")
        result, _ = self.run_script(routes, "LEO-1")
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertRegex(result.stdout, r"FAIL\s+200\s+Produkte je Markt.*0 Eintraege")
        self.assertRegex(result.stdout, r"OK\s+200\s+Suche je Markt")

    def test_empty_store_search_fails_despite_200(self):
        routes = healthy_routes()
        routes["/api/products/search?q=milch&storeCode=LEO-1"] = (200, b"[]")
        result, _ = self.run_script(routes, "LEO-1")
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertRegex(result.stdout, r"FAIL\s+200\s+Suche je Markt.*0 Eintraege")

    def test_explicit_store_code_and_query_are_used_and_must_have_items(self):
        routes = healthy_routes()
        routes["/api/products/search?q=brot&storeCode=SPAR-X"] = (200, b"[]")
        result, seen = self.run_script(routes, "SPAR-X", "brot")
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertTrue(any("q=brot&storeCode=SPAR-X" in path for _, path, _ in seen), seen)
        self.assertRegex(result.stdout, r"FAIL\s+200\s+Suche je Markt")
        self.assertRegex(result.stdout, r"OK\s+200\s+Produkte je Markt\s+.*1 Eintraege")

    def auto_routes(self, stores, filled):
        routes = healthy_routes()
        routes["/api/mobile/stores"] = (200, json.dumps([{"storeCode": code} for code in stores]).encode())
        item = json.dumps([{"id": 1, "name": "Milch"}]).encode()
        for code in stores:
            body = item if code in filled else b"[]"
            routes[f"/api/products?size=5&storeCode={code}"] = (200, body)
            routes[f"/api/products/search?q=milch&storeCode={code}"] = (200, body)
        return routes

    def test_auto_mode_passes_when_first_store_is_empty_and_another_has_items(self):
        routes = self.auto_routes(["SPAR-1", "SPAR-2", "HA-01"], filled={"SPAR-2"})
        result, seen = self.run_script(routes)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertRegex(result.stdout, r"INFO\s+Produkte je Markt\s+storeCode=SPAR-1: 0 Eintraege")
        self.assertRegex(result.stdout, r"INFO\s+Produkte je Markt\s+storeCode=SPAR-2: 1 Eintraege")
        self.assertRegex(result.stdout, r"OK\s+200\s+Produkte je Markt\s+\(storeCode=SPAR-2 hat Produkte\)")
        self.assertTrue(any("q=milch&storeCode=SPAR-2" in path for _, path, _ in seen), seen)
        self.assertFalse(any("q=milch&storeCode=SPAR-1" in path for _, path, _ in seen), seen)

    def test_auto_mode_fails_when_all_stores_are_empty(self):
        routes = self.auto_routes(["SPAR-1", "SPAR-2"], filled=set())
        result, _ = self.run_script(routes)
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertRegex(result.stdout, r"FAIL\s+---\s+Produkte je Markt\s+kein Markt hat Produkte")

    def test_explicit_empty_store_stays_strict_even_if_others_have_items(self):
        routes = self.auto_routes(["SPAR-1", "SPAR-2"], filled={"SPAR-2"})
        result, _ = self.run_script(routes, "SPAR-1")
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertRegex(result.stdout, r"FAIL\s+200\s+Produkte je Markt.*0 Eintraege")

    def test_non_list_store_response_fails(self):
        routes = healthy_routes()
        routes["/api/products?size=5&storeCode=LEO-1"] = (200, b"<html></html>")
        result, _ = self.run_script(routes, "LEO-1")
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertRegex(result.stdout, r"FAIL\s+200\s+Produkte je Markt.*keine JSON-Liste")

    def test_store_list_server_error_fails(self):
        routes = healthy_routes()
        routes["/api/products?size=5&storeCode=LEO-1"] = (500, b"")
        result, _ = self.run_script(routes, "LEO-1")
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertRegex(result.stdout, r"FAIL\s+500\s+Produkte je Markt")

    def test_only_get_and_no_credentials(self):
        _, seen = self.run_script(healthy_routes())
        self.assertTrue(seen)
        self.assertEqual({method for method, _, _ in seen}, {"GET"})
        self.assertEqual({auth for _, _, auth in seen}, {None})

    def test_protected_endpoint_answering_200_fails(self):
        routes = healthy_routes()
        routes["/api/admin/me"] = (200, b"{}")
        result, _ = self.run_script(routes)
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertRegex(result.stdout, r"FAIL\s+200\s+API admin/me")

    def test_admin_api_login_redirect_passes(self):
        # quarkus.oidc.application-type=hybrid redirects /api/admin/* without a token to the login.
        routes = healthy_routes()
        for path in ("/api/admin/me", "/api/admin/products", "/api/admin/logs", "/api/admin/index"):
            routes[path] = (302, b"")
        result, _ = self.run_script(routes)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertRegex(result.stdout, r"OK\s+302\s+API admin/me")

    def test_server_error_on_public_endpoint_fails(self):
        routes = healthy_routes()
        routes["/api/products/search"] = (500, b"")
        result, _ = self.run_script(routes)
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertRegex(result.stdout, r"FAIL\s+500\s+Produktsuche")

    def test_missing_health_is_only_info(self):
        result, _ = self.run_script(healthy_routes())
        self.assertEqual(result.returncode, 0)
        self.assertRegex(result.stdout, r"INFO\s+404\s+Quarkus ready")

    def test_unreachable_server_fails(self):
        result = subprocess.run(["bash", str(SCRIPT), "http://127.0.0.1:1"], capture_output=True,
                                text=True, timeout=120)
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertIn("000", result.stdout)

    def test_rejects_missing_and_invalid_base_url(self):
        for args in ([], ["ftp://example.org"], ["https://example.org/path"]):
            with self.subTest(args=args):
                result = subprocess.run(["bash", str(SCRIPT), *args], capture_output=True,
                                        text=True, timeout=30)
                self.assertEqual(result.returncode, 2, result.stdout + result.stderr)


class SmokeCheckSourceTest(unittest.TestCase):

    def test_script_is_read_only_and_credential_free(self):
        text = SCRIPT.read_text(encoding="utf-8")
        self.assertNotRegex(text, r"-X\s+(POST|PUT|PATCH|DELETE)")
        self.assertNotRegex(text, r"(?i)authorization|bearer|--user|curl[^\n]*\s-u\s|--data|curl[^\n]*\s-d\s")
        self.assertNotIn("kubectl", text)
        self.assertTrue(re.search(r"^set -u", text, re.M))


if __name__ == "__main__":
    unittest.main()
