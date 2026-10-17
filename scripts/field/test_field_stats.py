"""Tests fuer field_stats.py (Task 4.4). Alle Tick-CSVs werden in-test mit synthetischen Werten gebaut."""

import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import field_stats as stats  # noqa: E402
from field_stats import Aisle, InputError, Marker  # noqa: E402

HEADER = "t,truth_x,truth_y,est_x,est_y,proj_x,proj_y,confidence,beacons_used,route_rebuild,stop_change"
MARKERS = [Marker("M1", 10.0, 10.0, "Flur"), Marker("M2", 20.0, 10.0, "Regal")]
# Synthetische Replay-Zeilen aus docs/pilot-readiness/hardware/reports/0000-synthetic-baseline.md
BASELINE_LINES = [
    "REPLAY determinism ticks=73 duration=25.3s reroutes=1 reroutesPerMin=2.37 stopChanges=0 jumps=1 "
    "maxStep=17.13 lagMean=2.41 lagP95=17.14 offRouteDelays=[6.90] lowConfToggles=2 planning=1x",
    "REPLAY wrongAisle ticks=101 duration=35.1s reroutes=1 reroutesPerMin=1.71 stopChanges=0 jumps=1 "
    "maxStep=17.16 lagMean=1.50 lagP95=17.14 offRouteDelays=[6.55] lowConfToggles=2 planning=1x",
]


def tick_line(t, truth=None, est=None, proj=None, rebuild=0, stop=0):
    def point(value):
        return ["", ""] if value is None else [f"{value[0]:.3f}", f"{value[1]:.3f}"]
    cells = [f"{t:.3f}", *point(truth), *point(est), *point(proj), "0.800", "3", str(rebuild), str(stop)]
    return ",".join(cells)


def csv_text(lines):
    return "\n".join([HEADER, *lines]) + "\n"


def standing_csv(count, est_at, point=(10.0, 10.0), dt=0.35):
    """Standzeit: Truth nur am ersten und letzten Tick (Start- und Ende-Press), Schaetzung je Index."""
    lines = []
    for index in range(count):
        truth = point if index in (0, count - 1) else None
        lines.append(tick_line(index * dt, truth=truth, est=est_at(index)))
    return csv_text(lines)


def analyze(text, name="rec", markers=MARKERS, aisles=None, source="est", min_window=20.0):
    ticks = stats.parse_ticks(text, name)
    return stats.analyze_recording(name, ticks, markers, aisles, source, min_window)


class PercentileTests(unittest.TestCase):
    def test_empty_input_is_none(self):
        self.assertIsNone(stats.percentile([], 50))
        self.assertIsNone(stats.median([]))

    def test_single_value_is_returned_for_every_percentile(self):
        self.assertEqual(stats.percentile([2.5], 0), 2.5)
        self.assertEqual(stats.percentile([2.5], 90), 2.5)

    def test_median_of_even_count_interpolates(self):
        self.assertEqual(stats.median([4, 1, 3, 2]), 2.5)

    def test_p90_uses_linear_interpolation(self):
        self.assertAlmostEqual(stats.percentile(list(range(1, 11)), 90), 9.1)

    def test_bounds_and_unsorted_input(self):
        values = [3, 1, 2]
        self.assertEqual(stats.percentile(values, 0), 1)
        self.assertEqual(stats.percentile(values, 100), 3)
        self.assertEqual(stats.percentile(values, 50), 2)

    def test_invalid_percentile_raises(self):
        with self.assertRaises(ValueError):
            stats.percentile([1, 2], 101)


class ParsingTests(unittest.TestCase):
    def test_header_only_yields_no_ticks(self):
        self.assertEqual(stats.parse_ticks(HEADER + "\n", "x"), [])

    def test_empty_file_is_input_error(self):
        with self.assertRaises(InputError):
            stats.parse_ticks("", "x")

    def test_wrong_header_is_input_error(self):
        with self.assertRaises(InputError):
            stats.parse_ticks("t,x,y\n1,2,3\n", "x")

    def test_bad_flag_and_column_count_are_input_errors(self):
        bad_flag = ",".join(["0.000", "", "", "", "", "", "", "0.800", "3", "2", "0"])
        with self.assertRaises(InputError):
            stats.parse_ticks(csv_text([bad_flag]), "x")
        with self.assertRaises(InputError):
            stats.parse_ticks(csv_text(["0.0,1,2"]), "x")

    def test_partial_coordinate_is_input_error(self):
        line = "0.000,10.000,,,,,,0.800,3,0,0"
        with self.assertRaises(InputError):
            stats.parse_ticks(csv_text([line]), "x")

    def test_recording_name_strips_ticks_suffix(self):
        self.assertEqual(stats.recording_name(Path("/tmp/synthetic-ticks.csv")), "synthetic")
        self.assertEqual(stats.recording_name(Path("plain.csv")), "plain")

    def test_site_markdown_skips_placeholders_and_reads_markers_and_aisles(self):
        text = "\n".join([
            "| Marker | x_m | y_m | Beschreibung |",
            "| --- | --- | --- | --- |",
            "| M1 | 10.0 | 10.0 | Flur S4-Paar A |",
            "| (Mensch: weitere Marker M5 bis Mn) | | | |",
            "| M2 | 20.5 | 3.25 | Regal 2 |",
            "",
            "| Gang | x_m | y_m | width_m | height_m |",
            "| --- | --- | --- | --- | --- |",
            "| Gang 1 | 0 | 0 | 10 | 2 |",
            "| (Mensch: Gangname) | (Mensch) | (Mensch) | (Mensch) | (Mensch) |",
        ])
        site = stats.parse_site_markdown(text)
        self.assertEqual([marker.name for marker in site.markers], ["M1", "M2"])
        self.assertEqual((site.markers[1].x, site.markers[1].y), (20.5, 3.25))
        self.assertEqual(len(site.aisles), 1)
        self.assertEqual((site.aisles[0].x0, site.aisles[0].y0, site.aisles[0].x1, site.aisles[0].y1), (0, 0, 10, 2))

    def test_template_only_placeholders_give_empty_site(self):
        text = "| Marker | x_m | y_m | Beschreibung |\n| --- | --- | --- | --- |\n| M1 | (Mensch: x_m) | (Mensch: y_m) | (Mensch) |\n"
        site = stats.parse_site_markdown(text)
        self.assertEqual(site.markers, [])
        self.assertEqual(site.aisles, [])

    def test_comma_decimal_in_marker_is_input_error(self):
        text = "| Marker | x_m | y_m | Beschreibung |\n| --- | --- | --- | --- |\n| M1 | 10,0 | 10.0 | Flur |\n"
        with self.assertRaises(InputError):
            stats.parse_site_markdown(text)

    def test_layout_aisles_are_read_from_aisle_elements(self):
        layout = {"elements": [
            {"id": 1, "type": "shelf", "x": 1, "y": 1, "width": 2, "height": 2},
            {"id": 2, "type": "aisle", "label": "Gang 1", "x": 0, "y": 0, "width": 10, "height": 2},
        ]}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "layout-x.json"
            path.write_text(json.dumps(layout), encoding="utf-8")
            aisles = stats.read_layout_aisles(path)
        self.assertEqual(len(aisles), 1)
        self.assertEqual(aisles[0].name, "Gang 1")
        self.assertEqual((aisles[0].x1, aisles[0].y1), (10, 2))

    def test_layout_aisle_without_width_is_input_error(self):
        layout = {"elements": [{"id": 2, "type": "aisle", "x": 0, "y": 0, "height": 2}]}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "layout.json"
            path.write_text(json.dumps(layout), encoding="utf-8")
            with self.assertRaises(InputError):
                stats.read_layout_aisles(path)

    def test_replay_lines_parse_baseline_values(self):
        rows = stats.parse_replay_lines("\n".join(["Some other output"] + BASELINE_LINES))
        self.assertEqual([name for name, _ in rows], ["determinism", "wrongAisle"])
        values = rows[0][1]
        self.assertEqual(values["ticks"], 73)
        self.assertEqual(values["duration"], 25.3)
        self.assertEqual(values["reroutes"], 1)
        self.assertEqual(values["offRouteDelays"], [6.9])
        self.assertEqual(values["planning"], 1)
        self.assertEqual(rows[1][1]["offRouteDelays"], [6.55])

    def test_empty_list_value_parses_to_empty_list(self):
        rows = stats.parse_replay_lines("REPLAY stationary60s ticks=171 offRouteDelays=[] lagMean=0.09")
        self.assertEqual(rows[0][1]["offRouteDelays"], [])
        self.assertEqual(rows[0][1]["lagMean"], 0.09)


class WindowTests(unittest.TestCase):
    def test_standing_window_is_matched_to_marker(self):
        recording = analyze(standing_csv(60, lambda i: (11.0, 10.0)))
        self.assertEqual(len(recording.windows), 1)
        window = recording.windows[0]
        self.assertEqual(window.marker_index, 0)
        self.assertEqual((window.first, window.last), (0, 59))
        self.assertAlmostEqual(window.duration_s, 20.65)
        self.assertEqual(len(window.errors), 60)

    def test_short_window_is_not_stationary(self):
        recording = analyze(standing_csv(10, lambda i: (11.0, 10.0)))
        self.assertEqual(recording.windows, [])

    def test_window_far_from_markers_is_labelled_by_coordinates(self):
        recording = analyze(standing_csv(60, lambda i: (30.0, 31.0), point=(30.0, 30.0)))
        window = recording.windows[0]
        self.assertIsNone(window.marker_index)
        entries = stats.pool_by_label([recording], MARKERS)
        unmatched = [entry for entry in entries if entry.marker is None]
        self.assertEqual(len(unmatched), 1)
        self.assertEqual(unmatched[0].label, "kein Marker (30.00 / 30.00)")
        self.assertEqual(unmatched[0].windows, 1)

    def test_visits_split_when_starts_are_more_than_180_seconds_apart(self):
        lines = [tick_line(i * 0.35, truth=(10.0, 10.0) if i in (0, 560) else None) for i in range(600)]
        groups = stats.build_truth_groups(stats.parse_ticks(csv_text(lines), "x"))
        self.assertEqual(len(groups), 2)
        self.assertEqual(len(stats.build_visits(groups)), 2)

    def test_visit_stays_together_within_180_seconds(self):
        lines = [tick_line(i * 0.35, truth=(10.0, 10.0) if i in (0, 400) else None) for i in range(500)]
        groups = stats.build_truth_groups(stats.parse_ticks(csv_text(lines), "x"))
        visits = stats.build_visits(groups)
        self.assertEqual(len(visits), 1)
        self.assertEqual(len(visits[0].groups), 2)

    def test_one_missing_tick_inside_a_group_is_tolerated(self):
        lines = [tick_line(0.0, truth=(5.0, 5.0)), tick_line(0.35), tick_line(0.7, truth=(5.0, 5.0))]
        groups = stats.build_truth_groups(stats.parse_ticks(csv_text(lines), "x"))
        self.assertEqual(len(groups), 1)
        self.assertEqual((groups[0].first, groups[0].last), (0, 2))

    def test_changed_truth_coordinate_starts_a_new_group(self):
        lines = [tick_line(0.0, truth=(5.0, 5.0)), tick_line(0.35, truth=(6.0, 5.0))]
        self.assertEqual(len(stats.build_truth_groups(stats.parse_ticks(csv_text(lines), "x"))), 2)

    def test_ticks_without_estimate_are_skipped(self):
        def estimate(index):
            return None if index % 6 == 0 else (11.0, 10.0)
        recording = analyze(standing_csv(60, estimate))
        self.assertEqual(len(recording.windows[0].errors), 50)

    def test_proj_source_uses_projected_column(self):
        lines = []
        for index in range(60):
            truth = (10.0, 10.0) if index in (0, 59) else None
            lines.append(tick_line(index * 0.35, truth=truth, proj=(12.0, 10.0)))
        text = csv_text(lines)
        self.assertEqual(analyze(text, source="est").windows[0].errors, [])
        self.assertEqual(analyze(text, source="proj").windows[0].errors[0], 2.0)


class KnownErrorTests(unittest.TestCase):
    def test_offset_of_exactly_one_metre(self):
        recording = analyze(standing_csv(60, lambda i: (11.0, 10.0)))
        errors = recording.windows[0].errors
        self.assertEqual(stats.median(errors), 1.0)
        self.assertEqual(stats.percentile(errors, 90), 1.0)

    def test_offset_of_exactly_two_metres(self):
        recording = analyze(standing_csv(60, lambda i: (12.0, 10.0)))
        errors = recording.windows[0].errors
        self.assertEqual(stats.median(errors), 2.0)
        self.assertEqual(stats.percentile(errors, 90), 2.0)

    def test_mixed_one_and_two_metre_offsets(self):
        recording = analyze(standing_csv(60, lambda i: (11.0, 10.0) if i < 30 else (12.0, 10.0)))
        errors = recording.windows[0].errors
        self.assertEqual(stats.median(errors), 1.5)
        self.assertEqual(stats.percentile(errors, 90), 2.0)

    def test_errors_are_measured_to_truth_not_to_marker(self):
        # Marker M1 liegt bei (10, 10); die Wahrheit beim Standzeit-Press ist (10.5, 10).
        recording = analyze(standing_csv(60, lambda i: (11.5, 10.0), point=(10.5, 10.0)))
        self.assertEqual(recording.windows[0].marker_index, 0)
        self.assertEqual(stats.median(recording.windows[0].errors), 1.0)


class PoolingTests(unittest.TestCase):
    def test_pooled_median_differs_from_each_recording(self):
        first = analyze(standing_csv(60, lambda i: (10.5, 10.0)), name="a")
        second = analyze(standing_csv(60, lambda i: (12.0, 10.0)), name="b")
        self.assertEqual(stats.median(first.windows[0].errors), 0.5)
        self.assertEqual(stats.median(second.windows[0].errors), 2.0)

        entries = stats.pool_by_label([first, second], MARKERS)
        marker = entries[0]
        self.assertEqual(marker.marker.name, "M1")
        self.assertEqual(marker.windows, 2)
        self.assertEqual(len(marker.errors), 120)
        self.assertEqual(stats.median(marker.errors), 1.25)
        self.assertEqual(stats.percentile(marker.errors, 90), 2.0)


class AisleShareTests(unittest.TestCase):
    AISLES = [Aisle("A", 0.0, 0.0, 10.0, 2.0), Aisle("B", 0.0, 4.0, 10.0, 6.0)]
    WRONG = {5, 10, 15, 20, 25, 30, 33, 35, 37, 38}

    def walk_csv(self, truth_end, est_for):
        lines = []
        for index in range(40):
            truth = None
            if index == 0:
                truth = (1.0, 1.0)
            elif index == 39:
                truth = truth_end
            lines.append(tick_line(index * 0.35, truth=truth, est=est_for(index)))
        return csv_text(lines)

    def test_three_quarters_of_walking_ticks_in_correct_aisle(self):
        def est_for(index):
            if index in self.WRONG:
                return (5.0, 3.0) if index % 2 == 0 else (5.0, 5.0)
            return (5.0, 1.0)
        recording = analyze(self.walk_csv((9.0, 1.0), est_for), aisles=self.AISLES)
        self.assertEqual(recording.walking, (40, 30, 0))

    def test_estimate_outside_all_aisles_counts_as_wrong(self):
        recording = analyze(self.walk_csv((9.0, 1.0), lambda i: (5.0, 3.0)), aisles=self.AISLES)
        self.assertEqual(recording.walking, (40, 0, 0))

    def test_truth_in_no_aisle_is_excluded_and_counted(self):
        lines = []
        for index in range(40):
            truth = (5.0, 3.0) if index in (0, 39) else None
            lines.append(tick_line(index * 0.35, truth=truth, est=(5.0, 1.0)))
        recording = analyze(csv_text(lines), aisles=self.AISLES)
        self.assertEqual(recording.walking, (0, 0, 40))

    def test_no_aisles_means_no_walking_share(self):
        recording = analyze(self.walk_csv((9.0, 1.0), lambda i: (5.0, 1.0)), aisles=None)
        self.assertIsNone(recording.walking)
        report = stats.render_report([recording], MARKERS, None, "n/a (keine Gangdefinition)", "est", 20.0, None)
        self.assertIn("n/a (keine Gangdefinition)", report)


class RerouteTests(unittest.TestCase):
    def test_reroutes_and_stop_changes_are_counted_per_recording(self):
        lines = []
        for index in range(181):
            lines.append(tick_line(
                index * 0.35,
                rebuild=1 if index in (10, 20, 30) else 0,
                stop=1 if index in (40, 50) else 0,
            ))
        recording = analyze(csv_text(lines), name="r")
        self.assertEqual(recording.reroutes, 3)
        self.assertEqual(recording.stop_changes, 2)
        self.assertAlmostEqual(recording.duration_s, 63.0)
        report = stats.render_report([recording], MARKERS, None, "n/a", "est", 20.0, None)
        self.assertIn("| r | 1.05 | 3 | 2.86 | 2 |", report)


class RenderTests(unittest.TestCase):
    def test_replay_table_contains_baseline_values(self):
        rows = stats.parse_replay_lines("\n".join(BASELINE_LINES))
        report = stats.render_report([], [], None, "n/a", "est", 20.0, rows)
        self.assertIn("## Replay-Metriken", report)
        determinism = next(line for line in report.splitlines() if line.startswith("| determinism |"))
        self.assertIn("| 73 |", determinism)
        self.assertIn("6.90", determinism)
        wrong = next(line for line in report.splitlines() if line.startswith("| wrongAisle |"))
        self.assertIn("6.55", wrong)

    def test_empty_input_renders_without_crash(self):
        report = stats.render_report([], [], None, "n/a (keine Gangdefinition)", "est", 20.0, None)
        self.assertIn("Keine Standzeit-Fenster gefunden", report)
        self.assertIn("## Gesamt", report)

    def test_percentages_use_decimal_point(self):
        recording = analyze(standing_csv(60, lambda i: (11.0, 10.0)))
        report = stats.render_report([recording], MARKERS, None, "n/a", "est", 20.0, None)
        self.assertIn("| M1 | Flur | 10.00 / 10.00 | 1 | 60 | 1.00 | 1.00 |", report)


class CommandLineTests(unittest.TestCase):
    def _run(self, argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = stats.main(argv)
        return code, out.getvalue(), err.getvalue()

    def test_end_to_end_pools_two_recordings_into_markdown(self):
        site_md = "\n".join([
            "| Marker | x_m | y_m | Beschreibung |",
            "| --- | --- | --- | --- |",
            "| M1 | 10.0 | 10.0 | Flur |",
            "| (Mensch: weitere Marker) | | | |",
            "",
        ])
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "site.md").write_text(site_md, encoding="utf-8")
            (root / "a-ticks.csv").write_text(standing_csv(60, lambda i: (11.0, 10.0)), encoding="utf-8")
            (root / "b-ticks.csv").write_text(standing_csv(60, lambda i: (12.0, 10.0)), encoding="utf-8")
            out_path = root / "table.md"

            code, _, err = self._run([
                "--ticks", str(root / "a-ticks.csv"), str(root / "b-ticks.csv"),
                "--markers", str(root / "site.md"), "--out", str(out_path),
            ])

            self.assertEqual(code, 0)
            self.assertIn("Tabelle geschrieben", err)
            report = out_path.read_text(encoding="utf-8")
        self.assertIn("# Feldauswertung", report)
        self.assertIn("| M1 | Flur | 10.00 / 10.00 | 2 | 120 | 1.50 | 2.00 |", report)
        self.assertIn("| Alle Standzeiten (gepoolt) | 2 | 2 | 120 | 1.50 | 2.00 |", report)
        self.assertIn("| Aufnahme a | 1 | 1 | 60 | 1.00 | 1.00 |", report)
        self.assertIn("## Gehzeit im richtigen Gang", report)
        self.assertIn("## Reroutes und Stoppwechsel je Aufnahme", report)

    def test_header_only_input_does_not_crash(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "empty-ticks.csv"
            path.write_text(HEADER + "\n", encoding="utf-8")
            code, out, _ = self._run(["--ticks", str(path)])
        self.assertEqual(code, 0)
        self.assertIn("Keine Standzeit-Fenster gefunden", out)
        self.assertIn("n/a (keine Gangdefinition)", out)

    def test_missing_ticks_file_exits_two(self):
        code, _, err = self._run(["--ticks", "/nonexistent/none-ticks.csv"])
        self.assertEqual(code, 2)
        self.assertIn("nicht gefunden", err)

    def test_corrupt_marker_table_exits_two(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "ticks.csv").write_text(HEADER + "\n", encoding="utf-8")
            (root / "site.md").write_text(
                "| Marker | x_m | y_m | Beschreibung |\n| --- | --- | --- | --- |\n| M1 | abc | 1 | x |\n",
                encoding="utf-8",
            )
            code, _, err = self._run(["--ticks", str(root / "ticks.csv"), "--markers", str(root / "site.md")])
        self.assertEqual(code, 2)
        self.assertIn("keine Zahl", err)

    def test_aisles_from_layout_are_used_when_site_has_none(self):
        layout = {"elements": [{"id": 9, "type": "aisle", "x": 0, "y": 0, "width": 10, "height": 2}]}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "a-ticks.csv").write_text(standing_csv(60, lambda i: (11.0, 10.0)), encoding="utf-8")
            (root / "layout.json").write_text(json.dumps(layout), encoding="utf-8")
            code, out, _ = self._run([
                "--ticks", str(root / "a-ticks.csv"), "--layout", str(root / "layout.json"),
            ])
        self.assertEqual(code, 0)
        self.assertIn("Layout-JSON", out)
        self.assertNotIn("n/a (keine Gangdefinition)", out)

    def test_replay_lines_file_is_included(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "ticks.csv").write_text(HEADER + "\n", encoding="utf-8")
            (root / "replay.txt").write_text("noise\n" + "\n".join(BASELINE_LINES) + "\n", encoding="utf-8")
            code, out, _ = self._run(["--ticks", str(root / "ticks.csv"), "--replay-lines", str(root / "replay.txt")])
        self.assertEqual(code, 0)
        self.assertIn("## Replay-Metriken", out)
        self.assertIn("| wrongAisle |", out)

    def test_negative_min_window_is_usage_error(self):
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as raised:
                stats.main(["--ticks", "x-ticks.csv", "--min-window", "-1"])
        self.assertEqual(raised.exception.code, 2)

    def test_output_path_in_missing_folder_exits_two(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "ticks.csv").write_text(HEADER + "\n", encoding="utf-8")
            code, _, err = self._run([
                "--ticks", str(root / "ticks.csv"), "--out", str(root / "missing" / "table.md"),
            ])
        self.assertEqual(code, 2)
        self.assertIn("kann nicht geschrieben werden", err)


if __name__ == "__main__":
    unittest.main()
