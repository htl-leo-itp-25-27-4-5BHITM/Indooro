import IndooroModels
import XCTest
import simd
@testable import IndooroNavigationCore

/// Tasks 3.6-3.8: Replay-Treiber, Metriken, Determinismus und synthetische Spec-Szenarien.
final class NavigationReplayTests: XCTestCase {
    private func report(_ name: String, _ metrics: ReplayMetrics) {
        let delays = metrics.offRouteDetectionDelays.map { String(format: "%.2f", $0) }.joined(separator: ",")
        print("REPLAY \(name) ticks=\(metrics.tickCount) duration=\(String(format: "%.1f", metrics.durationSeconds))s "
            + "reroutes=\(metrics.rerouteCount) reroutesPerMin=\(String(format: "%.2f", metrics.reroutesPerMinute)) "
            + "stopChanges=\(metrics.activeStopChangesWithoutEvent) jumps=\(metrics.projectedJumps) maxStep=\(String(format: "%.2f", metrics.maxProjectedStepMeters)) "
            + "lagMean=\(metrics.meanLagMeters.map { String(format: "%.2f", $0) } ?? "-") "
            + "lagP95=\(metrics.p95LagMeters.map { String(format: "%.2f", $0) } ?? "-") "
            + "offRouteDelays=[\(delays)] lowConfToggles=\(metrics.lowConfidenceToggles) "
            + "planning=\(metrics.planningSeconds.count)x")
    }

    private func layout() throws -> LayoutData {
        try TestLayouts.demoSupermarket(beaconSpacing: 8)
    }

    private func roundTrip(_ lines: [NavigationRecordLine]) throws -> [NavigationRecordLine] {
        try NavigationRecordLine.parse(jsonl: NavigationRecordLine.jsonl(lines))
    }

    private func stop(_ id: String, _ x: Float, _ y: Float) -> RecordedStop {
        RecordedStop(id: id, title: id, x: x, y: y)
    }

    // MARK: - Task 2.7: Start ab Eingang ohne Messungen

    func testTourStartedAtEntranceWithoutMeasurementsRebuildsRouteOnceWhenMeasurementsStart() throws {
        let layout = try layout()
        let entrance = SIMD2<Float>(5.5, 56.5)
        var recording = SyntheticRecording(layout: layout, seed: 61)
        recording.event(.startTour, plan: [stop("A", 30.5, 9.5)])
        // Zehn Sekunden ohne jede Messung (Beacons stumm), der Kunde steht am Eingang.
        recording.blackout(seconds: 10, truth: entrance)
        recording.stand(at: entrance, seconds: 20)

        let metrics = NavigationReplay.run(recording: try roundTrip(recording.lines), layout: layout, entrance: entrance)
        report("entranceStart", metrics)
        XCTAssertEqual(metrics.activeStopChangesWithoutEvent, 0)
        XCTAssertEqual(metrics.rerouteCount, 0)
        // Ein Bau beim Start ab Eingang, genau ein Neubau von der vertrauten Position sobald Messungen laufen.
        XCTAssertEqual(metrics.routeBuildCount, 2)
    }

    // MARK: - Format

    func testRecordLinesRoundTripThroughJSONLines() throws {
        var recording = SyntheticRecording(layout: try layout(), seed: 1)
        recording.event(.startTour, plan: [stop("A", 5, 5)])
        recording.stand(at: SIMD2(8.5, 9.5), seconds: 1)
        recording.event(.calibrate, x: 8.5, y: 9.5)
        recording.event(.stopDone)
        let text = try NavigationRecordLine.jsonl(recording.lines)
        XCTAssertTrue(text.contains("\"type\":\"measurement\""))
        XCTAssertTrue(text.contains("\"type\":\"truth\""))
        XCTAssertTrue(text.contains("\"type\":\"layout\""))
        XCTAssertTrue(text.contains("\"kind\":\"startTour\""))
        XCTAssertEqual(try NavigationRecordLine.parse(jsonl: text), recording.lines)
    }

    // MARK: - Szenario 1: Stillstand

    func testStationaryBetweenTwoEquidistantStopsNeverReroutesOrSwitchesStop() throws {
        let layout = try layout()
        var recording = SyntheticRecording(layout: layout, seed: 11)
        recording.noiseSigmaMeters = 0.5
        recording.event(.startTour, plan: [stop("A", 8.5, 9.5), stop("B", 24.5, 9.5)])
        recording.stand(at: SIMD2(16.5, 9.5), seconds: 60)

        let metrics = NavigationReplay.run(recording: try roundTrip(recording.lines), layout: layout)
        report("stationary60s", metrics)
        XCTAssertEqual(metrics.rerouteCount, 0)
        XCTAssertEqual(metrics.activeStopChangesWithoutEvent, 0)
        XCTAssertEqual(metrics.projectedJumps, 0)
        XCTAssertEqual(metrics.lowConfidenceToggles, 0)
        XCTAssertLessThan(try XCTUnwrap(metrics.p95LagMeters), 3.0)
    }

    // MARK: - Szenario 3: Ausreisser

    func testIsolatedOutliersAddNoJumpsAndNoReroute() throws {
        let layout = try layout()
        func replay(outlierEvery: Int?) throws -> ReplayMetrics {
            var recording = SyntheticRecording(layout: layout, seed: 33)
            recording.event(.startTour, plan: [stop("A", 30.5, 9.5)])
            recording.walk([SIMD2(2.5, 9.5), SIMD2(30.5, 9.5)], speed: 1.2, outlierEvery: outlierEvery, outlierMeters: 6)
            return NavigationReplay.run(recording: try roundTrip(recording.lines), layout: layout)
        }
        let clean = try replay(outlierEvery: nil)
        let spiked = try replay(outlierEvery: 9)
        report("walkClean", clean)
        report("walkOutliers", spiked)
        XCTAssertEqual(spiked.rerouteCount, 0)
        XCTAssertEqual(spiked.activeStopChangesWithoutEvent, 0)
        XCTAssertLessThanOrEqual(spiked.projectedJumps, clean.projectedJumps + 1)
    }

    // MARK: - Szenario 5: falsche Gasse

    func testWrongAisleCausesExactlyOneReroute() throws {
        let layout = try layout()
        var recording = SyntheticRecording(layout: layout, seed: 55)
        recording.event(.startTour, plan: [stop("A", 30.5, 9.5)])
        recording.walk([SIMD2(2.5, 9.5), SIMD2(10.5, 9.5)], speed: 1.2)
        // Funkloch beim Wechsel in die parallele Gasse (Filter laufen ab), danach Stand in der falschen Gasse.
        let wrongAisle = SIMD2<Float>(10.5, 26.5)
        recording.blackout(seconds: 3, truth: wrongAisle)
        recording.stand(at: wrongAisle, seconds: 25)

        let metrics = NavigationReplay.run(recording: try roundTrip(recording.lines), layout: layout)
        report("wrongAisle", metrics)
        XCTAssertEqual(metrics.rerouteCount, 1)
        XCTAssertEqual(metrics.activeStopChangesWithoutEvent, 0)
        XCTAssertEqual(metrics.offRouteDetectionDelays.count, 1)
        // Task 6.1 (establish-pilot-field-measurement): Der grosse Schritt ist ein Szenario-Artefakt. Die Wahrheit
        // springt im Funkloch in einem Tick um 17 m (9.5 -> 26.5); der Schaetzer uebernimmt den bestaetigten Sprung
        // genau einmal. Der groesste Schritt darf deshalb nicht groesser als der Sprung der Wahrheit sein.
        XCTAssertEqual(metrics.projectedJumps, 1)
        XCTAssertEqual(metrics.maxProjectedStepMeters, 17.0, accuracy: 0.5)
    }

    // MARK: - Szenario 8: Beacon-Ausfall

    func testBeaconDropoutsKeepRouteAndStop() throws {
        let layout = try layout()
        var recording = SyntheticRecording(layout: layout, seed: 88)
        recording.beaconDropoutProbability = 0.35
        recording.event(.startTour, plan: [stop("A", 30.5, 9.5)])
        recording.walk([SIMD2(2.5, 9.5), SIMD2(16.5, 9.5)], speed: 1.2)
        recording.blackout(seconds: 1.4, truth: SIMD2(16.5, 9.5))
        recording.walk([SIMD2(16.5, 9.5), SIMD2(30.5, 9.5)], speed: 1.2)

        let metrics = NavigationReplay.run(recording: try roundTrip(recording.lines), layout: layout)
        report("dropout", metrics)
        XCTAssertEqual(metrics.rerouteCount, 0)
        XCTAssertEqual(metrics.activeStopChangesWithoutEvent, 0)
    }

    func testLongBlackoutTogglesLowConfidenceWithoutReroute() throws {
        let layout = try layout()
        var recording = SyntheticRecording(layout: layout, seed: 89)
        recording.event(.startTour, plan: [stop("A", 30.5, 9.5)])
        recording.walk([SIMD2(2.5, 9.5), SIMD2(16.5, 9.5)], speed: 1.2)
        recording.blackout(seconds: 5, truth: SIMD2(16.5, 9.5))
        recording.walk([SIMD2(16.5, 9.5), SIMD2(30.5, 9.5)], speed: 1.2)

        let metrics = NavigationReplay.run(recording: try roundTrip(recording.lines), layout: layout)
        report("longBlackout", metrics)
        XCTAssertEqual(metrics.lowConfidenceToggles, 2)
        XCTAssertEqual(metrics.rerouteCount, 0)
        XCTAssertEqual(metrics.activeStopChangesWithoutEvent, 0)
    }

    // MARK: - Ereignisse

    func testEventsDriveTheSessionAndPlanningIsMeasured() throws {
        let layout = try layout()
        var recording = SyntheticRecording(layout: layout, seed: 21)
        recording.event(.startTour, plan: [stop("A", 8.5, 9.5), stop("B", 24.5, 9.5), stop("C", 30.5, 26.5)])
        recording.stand(at: SIMD2(2.5, 9.5), seconds: 10)
        recording.event(.stopDone)
        recording.stand(at: SIMD2(2.5, 9.5), seconds: 5)
        recording.event(.replan, plan: [stop("B", 24.5, 9.5), stop("C", 30.5, 26.5)], optimize: true)
        recording.stand(at: SIMD2(2.5, 9.5), seconds: 5)
        recording.event(.calibrate, x: 14, y: 9.5)
        recording.stand(at: SIMD2(14, 9.5), seconds: 5)

        let metrics = NavigationReplay.run(recording: try roundTrip(recording.lines), layout: layout)
        report("events", metrics)
        XCTAssertEqual(metrics.activeStopChangesWithoutEvent, 0)
        XCTAssertEqual(metrics.planningSeconds.count, 2, "startTour und replan planen")
        XCTAssertEqual(metrics.rerouteCount, 0)
    }

    // MARK: - Determinismus (3.8)

    func testReplayingTheSameFixtureTwiceYieldsIdenticalMetrics() throws {
        let layout = try layout()
        var recording = SyntheticRecording(layout: layout, seed: 2024)
        recording.beaconDropoutProbability = 0.2
        recording.event(.startTour, plan: [stop("A", 30.5, 9.5), stop("B", 10.5, 26.5)])
        recording.walk([SIMD2(2.5, 9.5), SIMD2(10.5, 9.5)], speed: 1.2, outlierEvery: 11)
        recording.blackout(seconds: 3, truth: SIMD2(10.5, 26.5))
        recording.stand(at: SIMD2(10.5, 26.5), seconds: 15)

        let url = FileManager.default.temporaryDirectory.appendingPathComponent("replay-\(UUID().uuidString).jsonl")
        try NavigationRecordLine.jsonl(recording.lines).write(to: url, atomically: true, encoding: .utf8)
        defer { try? FileManager.default.removeItem(at: url) }
        let parsed = try NavigationRecordLine.parse(jsonl: String(contentsOf: url, encoding: .utf8))

        let first = NavigationReplay.run(recording: parsed, layout: layout)
        let second = NavigationReplay.run(recording: parsed, layout: layout)
        XCTAssertEqual(first, second)
        XCTAssertGreaterThan(first.tickCount, 50)
        report("determinism", first)
    }

    func testRSSIOnlyRecordingProducesAPosition() throws {
        let layout = try layout()
        var recording = SyntheticRecording(layout: layout, seed: 7)
        recording.source = .rssi
        recording.event(.startTour, plan: [stop("A", 30.5, 9.5)])
        recording.stand(at: SIMD2(16.5, 9.5), seconds: 20)
        let metrics = NavigationReplay.run(recording: recording.lines, layout: layout)
        report("rssiOnly", metrics)
        XCTAssertLessThan(try XCTUnwrap(metrics.meanLagMeters), 4.0)
    }
}
