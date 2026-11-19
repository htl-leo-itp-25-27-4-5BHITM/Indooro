import XCTest
import simd
@testable import IndooroPositioning

/// Task 5.4: Der Snapshot-Strom ersetzt `BeaconManager.navigationSamples` fuer die Navigations-Session.
final class SnapshotTickAdapterTests: XCTestCase {
    private var sequence = 0

    private func snapshot(
        _ status: PositionSnapshot.Status,
        at time: TimeInterval = 100,
        point: SIMD2<Float>? = nil,
        confidence: Float = 0,
        calibration: CalibrationEvent? = nil
    ) -> PositionSnapshot {
        sequence += 1
        return PositionSnapshot(
            sequence: sequence,
            timestamp: time,
            layoutRevision: 1,
            status: status,
            displayedPoint: point,
            rawPoint: point,
            headingRadians: nil,
            isHeadingReliable: false,
            confidence: confidence,
            isTrusted: status == .tracking || status == .manual,
            activeBeaconCount: 0,
            wasJumpSuppressed: false,
            lastCalibration: calibration,
            radio: RadioStatus()
        )
    }

    func testWarmupProducesNoTick() {
        var adapter = SnapshotTickAdapter()
        XCTAssertNil(adapter.consume(snapshot(.warmingUp)))
    }

    func testTrackingTickIsTrustedWithPositionAndConfidence() {
        var adapter = SnapshotTickAdapter()
        let output = adapter.consume(snapshot(.tracking, at: 101.5, point: SIMD2(4, 5), confidence: 0.7))
        XCTAssertEqual(output, .tick(NavigationTick(
            projectedPosition: SIMD2(4, 5), confidence: 0.7, timestamp: 101.5, isTrusted: true
        )))
    }

    func testLowConfidenceAndSearchingTicksAreNotTrusted() {
        var adapter = SnapshotTickAdapter()
        XCTAssertEqual(
            adapter.consume(snapshot(.lowConfidence, point: SIMD2(1, 1), confidence: 0.2)),
            .tick(NavigationTick(projectedPosition: SIMD2(1, 1), confidence: 0.2, timestamp: 100, isTrusted: false))
        )
        XCTAssertEqual(
            adapter.consume(snapshot(.searching, confidence: 0.1)),
            .tick(NavigationTick(projectedPosition: nil, confidence: 0.1, timestamp: 100, isTrusted: false))
        )
    }

    func testCalibrationIsReportedOnceAndHoldTicksAreNotTrusted() {
        var adapter = SnapshotTickAdapter()
        let event = CalibrationEvent(revision: 1, point: SIMD2(7, 8), timestamp: 100)
        XCTAssertEqual(
            adapter.consume(snapshot(.manual, point: SIMD2(7, 8), confidence: 1, calibration: event)),
            .calibrated(SIMD2(7, 8))
        )
        // Folge-Tick im manuellen Halt: normaler Tick, Solver-Vertrauen fehlt (wie im alten Pfad).
        XCTAssertEqual(
            adapter.consume(snapshot(.manual, at: 100.35, point: nil, confidence: 0.2, calibration: event)),
            .tick(NavigationTick(projectedPosition: nil, confidence: 0.2, timestamp: 100.35, isTrusted: false))
        )
    }

    func testSecondCalibrationIsReportedAgain() {
        var adapter = SnapshotTickAdapter()
        _ = adapter.consume(snapshot(.manual, point: SIMD2(1, 1), calibration: CalibrationEvent(revision: 1, point: SIMD2(1, 1), timestamp: 1)))
        XCTAssertEqual(
            adapter.consume(snapshot(.manual, point: SIMD2(2, 2), calibration: CalibrationEvent(revision: 2, point: SIMD2(2, 2), timestamp: 2))),
            .calibrated(SIMD2(2, 2))
        )
    }

    func testStopAfterTrackingEmitsOneTickWithoutPosition() {
        var adapter = SnapshotTickAdapter()
        _ = adapter.consume(snapshot(.tracking, point: SIMD2(1, 1), confidence: 0.8))
        XCTAssertEqual(
            adapter.consume(snapshot(.stopped, at: 105)),
            .tick(NavigationTick(projectedPosition: nil, confidence: 1, timestamp: 105, isTrusted: false))
        )
        XCTAssertNil(adapter.consume(snapshot(.stopped, at: 106)), "Weitere Stopp-Snapshots (Layoutwechsel) erzeugen keinen Tick")
    }

    func testInitialStoppedSnapshotProducesNoTick() {
        var adapter = SnapshotTickAdapter()
        XCTAssertNil(adapter.consume(snapshot(.stopped)))
    }
}
