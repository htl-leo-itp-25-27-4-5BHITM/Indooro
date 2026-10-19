"""Tests fuer walk_report.py. Synthetische Zeilen, keine Felddaten."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import walk_report as wr  # noqa: E402

BEACONS = {"A": (0.0, 0.0), "B": (10.0, 0.0), "C": (5.0, 8.0)}


def measurement(t, beacon, rssi):
    return {"type": "measurement", "t": t, "source": "ranging", "beacon": beacon, "rssi": rssi}


def truth(t, x, y):
    return {"type": "truth", "t": t, "x": x, "y": y}


class ParseTests(unittest.TestCase):
    def test_parse_recording_skips_blank_and_reports_line(self):
        records = wr.parse_recording('{"type":"truth","t":1,"x":1,"y":2}\n\n{"type":"scan","t":2,"major":1,"minor":2,"rssi":-70}\n')
        self.assertEqual([r["type"] for r in records], ["truth", "scan"])
        with self.assertRaises(wr.ReportInputError) as context:
            wr.parse_recording('{"type":"truth"}\nnot json\n')
        self.assertIn("Zeile 2", str(context.exception))

    def test_summary_counts_and_duration(self):
        records = [measurement(10, "A", -60), measurement(12, "B", -70), truth(11, 1, 1),
                   {"type": "scan", "t": 20, "major": 1, "minor": 2, "rssi": -80}]
        summary = wr.summarize_recording(records)
        self.assertEqual((summary.measurements, summary.truths, summary.scans), (2, 1, 1))
        self.assertEqual(summary.duration_s, 10)
        self.assertEqual(summary.beacons, ["A", "B"])

    def test_layout_beacons_reads_beacon_id_and_coordinates(self):
        layout = {"elements": [{"type": "beacon", "beaconId": "X", "x": 1, "y": 2.5}, {"type": "shelf", "x": 0, "y": 0}]}
        self.assertEqual(wr.layout_beacons(layout), {"X": (1.0, 2.5)})
        with self.assertRaises(wr.ReportInputError):
            wr.layout_beacons({})


class VisitTests(unittest.TestCase):
    def test_two_presses_at_same_point_form_a_stand_visit(self):
        visits = wr.truth_visits([truth(0, 1, 1), truth(30, 1.1, 1), truth(40, 5, 5)])
        self.assertEqual([v.presses for v in visits], [2, 1])
        self.assertEqual((visits[0].t_start, visits[0].t_end), (0, 30))
        self.assertAlmostEqual(visits[0].point[0], 1.05)

    def test_far_apart_in_time_are_separate_visits(self):
        visits = wr.truth_visits([truth(0, 1, 1), truth(400, 1, 1)])
        self.assertEqual(len(visits), 2)

    def test_visit_report_counts_visible_beacons_and_strongest(self):
        records = [truth(0, 0.5, 0.2), truth(30, 0.5, 0.2)]
        for t in range(0, 31, 5):
            records.append(measurement(t, "A", -50))
            records.append(measurement(t, "B", -75))
        records.append(measurement(10, "C", -90))  # nur ein Sample: hoerbar, aber nicht stabil
        records.append(measurement(100, "C", -40))  # ausserhalb des Fensters
        report = wr.visit_reports(records, wr.truth_visits(records), BEACONS)[0]
        self.assertEqual((report.visible, report.stable), (3, 2))
        self.assertEqual(report.strongest.name, "A")
        self.assertEqual(report.nearest_layout_beacon, "A")
        self.assertAlmostEqual(report.beacons[0].distance_m, (0.5**2 + 0.2**2) ** 0.5)

    def test_single_press_uses_half_window(self):
        records = [truth(100, 5, 8), measurement(98, "C", -50), measurement(103, "C", -50), measurement(110, "C", -50)]
        report = wr.visit_reports(records, wr.truth_visits(records), BEACONS)[0]
        self.assertEqual(report.beacons[0].samples, 1)

    def test_rssi_127_and_0_are_ignored(self):
        records = [truth(0, 0, 0), truth(10, 0, 0), measurement(5, "A", 127), measurement(6, "A", 0)]
        report = wr.visit_reports(records, wr.truth_visits(records), BEACONS)[0]
        self.assertEqual(report.visible, 0)

    def test_solver_beacons_from_ticks(self):
        records = [truth(0, 0, 0), truth(10, 0, 0)]
        ticks = [{"t": 2.0, "beacons_used": 3.0}, {"t": 4.0, "beacons_used": 1.0}, {"t": 50.0, "beacons_used": 9.0}]
        report = wr.visit_reports(records, wr.truth_visits(records), BEACONS, ticks)[0]
        self.assertEqual((report.solver_beacons_mean, report.solver_beacons_min), (2.0, 1))

    def test_unmatched_beacons_are_grouped(self):
        records = [{"type": "scan", "t": 1, "major": 1, "minor": 7, "rssi": -70},
                   {"type": "scan", "t": 2, "major": 1, "minor": 7, "rssi": -80},
                   {"type": "scan", "t": 3, "major": 2, "minor": 1, "rssi": -60}]
        items = wr.unmatched_beacons(records)
        self.assertEqual([(i.key, i.samples, i.median_rssi) for i in items], [("1-7", 2, -75.0), ("2-1", 1, -60.0)])


HEADER = ",".join(wr.EXPECTED_TICK_HEADER)


class TickTests(unittest.TestCase):
    def test_parse_ticks_and_jumps(self):
        text = HEADER + "\n" + "\n".join([
            "0.0,,,1.0,1.0,1.0,1.0,0.9,3,0,0",
            "0.35,,,1.1,1.0,1.1,1.0,0.9,3,0,0",
            "0.70,,,9.0,1.0,5.0,1.0,0.9,2,0,0",   # Sprung 3.9 m > Gate 1.725 m
            "1.05,,,9.0,1.0,,,0.9,0,0,0",         # ohne Projektion: uebersprungen
        ]) + "\n"
        ticks = wr.parse_ticks(text)
        self.assertEqual(len(ticks), 4)
        jumps, largest = wr.find_jumps(ticks)
        self.assertEqual(len(jumps), 1)
        self.assertAlmostEqual(jumps[0].step_m, 3.9)
        self.assertAlmostEqual(jumps[0].gate_m, 2.5 * 0.35 + 0.85)
        self.assertAlmostEqual(largest, 3.9)

    def test_parse_ticks_rejects_bad_header_and_shape(self):
        with self.assertRaises(wr.ReportInputError):
            wr.parse_ticks("a,b\n1,2\n")
        with self.assertRaises(wr.ReportInputError):
            wr.parse_ticks(HEADER + "\n1,2\n")
        with self.assertRaises(wr.ReportInputError):
            wr.parse_ticks("")

    def test_jump_constants_match_config(self):
        config = (Path(__file__).resolve().parents[2] / "swift/indooro-EinkaeuferFinal/indooroApp/Utilities/StabilizedNavigationConfig.swift").read_text(encoding="utf-8")
        self.assertIn(f"var maxPlausibleSpeed: Float = {wr.JUMP_SPEED_MPS}", config)
        self.assertIn(f"var jumpMargin: Float = {wr.JUMP_MARGIN_M}", config)


class RenderTests(unittest.TestCase):
    def test_empty_visits_message(self):
        self.assertIn("Keine `truth`-Zeilen", wr.render_visit_table([], 0)[0])

    def test_table_marks_strongest_not_nearest(self):
        records = [truth(0, 0.5, 0.2), truth(30, 0.5, 0.2), measurement(5, "B", -50), measurement(6, "A", -70)]
        reports = wr.visit_reports(records, wr.truth_visits(records), BEACONS)
        text = "\n".join(wr.render_visit_table(reports, 0))
        self.assertIn("B (-50 dBm) ≠ nächster A", text)

    def test_unmatched_empty_message(self):
        self.assertIn("Keine layout-fremden", wr.render_unmatched([])[0])


if __name__ == "__main__":
    unittest.main()
