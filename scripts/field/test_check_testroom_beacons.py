"""Tests fuer check_testroom_beacons.py. Kein Netz: der Abruf ist ein Stub."""

import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import check_testroom_beacons as c  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
TEMPLATE = REPO / "docs/pilot-readiness/hardware/TESTRAUM_BEACON_WERTE.md"
PREFIX = "6f1a7f7e1c444d8f9a7e8b9a4a2d1c"


def beacon(i, name, uuid_tail, x, y, major, minor):
    return {"id": i, "type": "beacon", "x": x, "y": y, "beaconId": name, "uuid": PREFIX + uuid_tail,
            "major": major, "minor": minor}


def layout(beacons, entrances=0, **meta):
    elements = list(beacons) + [{"id": 100 + n, "type": "entrance", "x": 2, "y": 0} for n in range(entrances)]
    elements.append({"id": 99, "type": "shelf", "x": 1, "y": 1})
    return {"storeId": "x", "source": "ACTIVE", "fallback": False, **meta,
            "layout": {"elements": elements, "gridSize": {"width": 5, "height": 9}}}


# Stand der Live-Daten vom 2026-11-19.
LIVE_BEACONS = [
    beacon(1, "Indooro4", "17", 0, 9, 1, 1),
    beacon(2, "Indooro1", "16", 5, 9, 1, 1),
    beacon(3, "Indooro3", "15", 0, 0, None, None),
    beacon(4, "Indooro2", "11", 5, 0, 1, 2),
]
LIVE_LAYOUT = layout(LIVE_BEACONS)
LIVE_IDENTITIES = {"uuids": ["0" * 32] + [PREFIX + t for t in ("11", "13", "14", "15", "16")]}

GOOD_BEACONS = [
    beacon(1, "Indooro1", "16", 5, 9, 1, 1),
    beacon(2, "Indooro2", "11", 5, 0, 1, 2),
    beacon(3, "Indooro3", "15", 0, 0, 1, 3),
    beacon(4, "Indooro4", "17", 0, 9, 1, 4),
]
GOOD_LAYOUT = layout(GOOD_BEACONS, entrances=1)
GOOD_IDENTITIES = {"uuids": [PREFIX + t for t in ("11", "15", "16", "17")]}


def analyse(layout_response, identities, readiness=None, values=None):
    report = c.Report()
    beacons = c.check_layout_and_registry(report, layout_response, identities)
    if readiness is not None:
        c.check_readiness(report, readiness)
    if values is not None:
        c.check_values(report, c.parse_values(values), beacons)
    return report


def has(lines, *needles):
    return any(all(n in line for n in needles) for line in lines)


class LiveSituation(unittest.TestCase):
    def setUp(self):
        self.report = analyse(LIVE_LAYOUT, LIVE_IDENTITIES)

    def test_reports_all_known_blockers(self):
        b = self.report.blockers
        self.assertTrue(has(b, "Eingang"))
        self.assertTrue(has(b, "Nullen", "Platzhalter"))
        self.assertTrue(has(b, "Indooro4", "1c17", "nicht registriert"))
        self.assertTrue(has(b, "Indooro3", "Major und Minor fehlen"))
        self.assertTrue(has(b, "Mehrdeutig", "Indooro1", "Indooro4"))
        self.assertEqual(len(b), 5)

    def test_registered_but_not_placed_is_a_hint(self):
        self.assertTrue(has(self.report.warnings, "1c13", "nicht platziert"))
        self.assertTrue(has(self.report.warnings, "1c14", "nicht platziert"))

    def test_exit_code_one_and_german_output(self):
        out = io.StringIO()
        with tempfile.TemporaryDirectory() as tmp:
            lp, ip = Path(tmp, "l.json"), Path(tmp, "i.json")
            lp.write_text(json.dumps(LIVE_LAYOUT))
            ip.write_text(json.dumps(LIVE_IDENTITIES))
            code = c.main(["--layout-json", str(lp), "--identities-json", str(ip)], env={}, out=out)
        self.assertEqual(code, 1)
        self.assertIn("NICHT BEREIT", out.getvalue())
        self.assertIn("5 Blocker", out.getvalue())


class CleanSituation(unittest.TestCase):
    def test_no_blockers(self):
        self.assertEqual(analyse(GOOD_LAYOUT, GOOD_IDENTITIES).blockers, [])

    def test_uuid_dashes_and_case_are_ignored(self):
        identities = {"uuids": ["6F1A7F7E-1C44-4D8F-9A7E-8B9A4A2D1C" + t for t in ("11", "15", "16", "17")]}
        self.assertEqual(analyse(GOOD_LAYOUT, identities).blockers, [])

    def test_two_entrances_blocked(self):
        report = analyse(layout(GOOD_BEACONS, entrances=2), GOOD_IDENTITIES)
        self.assertTrue(has(report.blockers, "2 Eingaenge"))

    def test_fallback_layout_blocked(self):
        report = analyse(layout(GOOD_BEACONS, entrances=1, fallback=True, source="FALLBACK"), GOOD_IDENTITIES)
        self.assertTrue(has(report.blockers, "kein aktives Filiallayout"))

    def test_duplicate_identity(self):
        beacons = [dict(b) for b in GOOD_BEACONS]
        beacons[1].update(uuid=beacons[0]["uuid"], major=1, minor=1)
        report = analyse(layout(beacons, entrances=1), GOOD_IDENTITIES)
        self.assertTrue(has(report.blockers, "Doppelte Identitaet"))

    def test_too_few_beacons(self):
        report = analyse(layout(GOOD_BEACONS[:2], entrances=1), GOOD_IDENTITIES)
        self.assertTrue(has(report.blockers, "nur 2 Beacons"))


class Readiness(unittest.TestCase):
    def test_blocking_findings_become_blockers(self):
        readiness = {"status": "RED", "blockingCount": 1, "warningCount": 0,
                     "findings": [{"severity": "BLOCKING", "code": "ENTRANCE_COUNT",
                                   "message": "Genau ein Eingang ist erforderlich"}]}
        report = analyse(GOOD_LAYOUT, GOOD_IDENTITIES, readiness=readiness)
        self.assertTrue(has(report.blockers, "ENTRANCE_COUNT"))

    def test_green_readiness_adds_nothing(self):
        readiness = {"status": "GREEN", "blockingCount": 0, "warningCount": 0, "findings": []}
        self.assertEqual(analyse(GOOD_LAYOUT, GOOD_IDENTITIES, readiness=readiness).blockers, [])

    def test_unexpected_format_is_usage_error(self):
        with self.assertRaises(c.CheckError):
            c.check_readiness(c.Report(), {"foo": 1})


def values_text(rows):
    return "x\n```beacon-werte\n" + "\n".join(rows) + "\n```\n"


def good_rows():
    return [f"IND-1-{b['minor']};{b['x']},{b['y']};{b['uuid']};{b['major']};{b['minor']};{b['beaconId']};-12;Erik"
            for b in GOOD_BEACONS]


class Values(unittest.TestCase):
    def test_shipped_template_is_empty_and_parses(self):
        text = TEMPLATE.read_text(encoding="utf-8")
        self.assertEqual(len(c.parse_values(text)), 4)
        report = analyse(GOOD_LAYOUT, GOOD_IDENTITIES, values=text)
        self.assertTrue(has(report.blockers, "noch leer"))

    def test_matching_values_pass(self):
        report = analyse(GOOD_LAYOUT, GOOD_IDENTITIES, values=values_text(good_rows()))
        self.assertEqual(report.blockers, [])

    def test_mismatch_is_reported(self):
        rows = good_rows()
        rows[2] = f"IND-1-3;0,0;{GOOD_BEACONS[2]['uuid']};1;7;Indooro3;-12;Erik"
        report = analyse(GOOD_LAYOUT, GOOD_IDENTITIES, values=values_text(rows))
        self.assertTrue(has(report.blockers, "Indooro3", "Minor im Layout 3 statt 7"))

    def test_partially_filled_rows_block(self):
        rows = good_rows()[:1] + [";5,0;;;;Indooro2;;"]
        report = analyse(GOOD_LAYOUT, GOOD_IDENTITIES, values=values_text(rows))
        self.assertTrue(has(report.blockers, "Indooro2", "noch nicht abgelesen"))
        self.assertTrue(has(report.blockers, "Indooro3", "nicht abgelesen"))

    def test_missing_block_is_error(self):
        with self.assertRaises(c.CheckError):
            c.parse_values("kein Block")


class Cli(unittest.TestCase):
    def test_network_error_is_exit_two(self):
        def fetch(url, headers):
            raise c.CheckError("kein Netz")
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            code = c.main([], fetch=fetch, env={}, out=io.StringIO())
        self.assertEqual(code, 2)
        self.assertIn("kein Netz", err.getvalue())

    def test_unknown_flag_is_exit_two(self):
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(c.main(["--nope"], env={}, out=io.StringIO()), 2)

    def test_only_get_urls_and_token_only_for_readiness(self):
        calls = []

        def fetch(url, headers):
            calls.append((url, dict(headers)))
            if url.endswith("/layout/current"):
                return json.dumps(GOOD_LAYOUT).encode()
            if url.endswith("/beacon-identities"):
                return json.dumps(GOOD_IDENTITIES).encode()
            return json.dumps({"status": "GREEN", "blockingCount": 0, "warningCount": 0, "findings": []}).encode()

        out = io.StringIO()
        code = c.main([], fetch=fetch, env={"INDOORO_ADMIN_TOKEN": "geheim"}, out=out)
        self.assertEqual(code, 0)
        self.assertEqual(len(calls), 3)
        self.assertTrue(all("Authorization" not in h for u, h in calls if "readiness" not in u))
        self.assertIn("/api/mobile/stores/b0308337-1d4b-4096-b022-200e6118e86c/layout/current", calls[0][0])
        self.assertNotIn("geheim", out.getvalue())


if __name__ == "__main__":
    unittest.main()
