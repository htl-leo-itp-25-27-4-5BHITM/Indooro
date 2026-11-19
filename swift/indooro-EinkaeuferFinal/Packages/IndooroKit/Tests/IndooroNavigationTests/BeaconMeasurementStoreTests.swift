import XCTest
import simd
@testable import IndooroNavigation

/// Spec "Each beacon uses one measurement source at a time" und
/// "Position is solved only on the update tick" (Task 5.6).
final class BeaconMeasurementStoreTests: XCTestCase {
    private let config = StabilizedNavigationConfig.default.beacon

    private func makeStore() -> BeaconMeasurementStore {
        let store = BeaconMeasurementStore(config: config)
        store.syncBeacons([
            (name: "B1", point: SIMD2<Float>(0, 0)),
            (name: "B2", point: SIMD2<Float>(10, 0)),
            (name: "B3", point: SIMD2<Float>(0, 10))
        ])
        return store
    }

    func testBothSourcesFreshUsesRangingOnly() {
        let store = makeStore()
        store.recordRanging(beaconName: "B1", accuracy: 2.0, rssi: -60, quality: 0.9, timestamp: 100)
        XCTAssertFalse(store.shouldUseRSSI(for: "B1", at: 100.2))

        let selection = store.selection(for: "B1", at: 100.2)
        XCTAssertEqual(selection?.source, .ranging)
        XCTAssertEqual(selection?.measurement.distanceMeters ?? 0, 2.0, accuracy: 1e-9)

        // RSSI-Samples werden nicht verarbeitet; der RSSI-Filter bleibt unberuehrt.
        XCTAssertNil(store.measurement(beaconName: "B1", source: .rssi))
        let measurements = store.activeMeasurements(at: 100.2)
        XCTAssertEqual(measurements.count, 1)
        XCTAssertEqual(measurements.first?.distanceMeters ?? 0, 2.0, accuracy: 1e-5)
    }

    func testRSSIFilterIsNeverFedFromRanging() {
        let store = makeStore()
        // Ranging liefert 2 m; danach (Ranging stale) liefert RSSI 6 m. Der RSSI-Filter
        // muss bei 6 m starten und nicht von 2 m beeinflusst sein.
        store.recordRanging(beaconName: "B1", accuracy: 2.0, rssi: -60, quality: 0.9, timestamp: 100)
        let rssiDistance = store.recordRSSI(beaconName: "B1", rawDistance: 6.0, rssi: -75, quality: 0.5, timestamp: 102.5)
        XCTAssertEqual(rssiDistance, 6.0, accuracy: 1e-9)
    }

    func testRangingStaleForTwoAndAHalfSecondsFallsBackToRSSI() {
        let store = makeStore()
        store.recordRanging(beaconName: "B1", accuracy: 2.0, rssi: -60, quality: 0.9, timestamp: 100)
        store.recordRSSI(beaconName: "B1", rawDistance: 5.0, rssi: -75, quality: 0.6, timestamp: 102.5)

        XCTAssertTrue(store.shouldUseRSSI(for: "B1", at: 102.5))
        let selection = store.selection(for: "B1", at: 102.5)
        XCTAssertEqual(selection?.source, .rssi)
        XCTAssertEqual(selection?.measurement.distanceMeters ?? 0, 5.0, accuracy: 1e-9)
    }

    func testRangingAndRSSIFiltersAreIndependent() {
        let store = makeStore()
        for index in 0..<10 {
            store.recordRanging(beaconName: "B1", accuracy: 2.0, rssi: -60, quality: 1, timestamp: 100 + Double(index) * 0.1)
        }
        // Erster RSSI-Wert initialisiert seinen eigenen Filter exakt.
        let first = store.recordRSSI(beaconName: "B1", rawDistance: 9.0, rssi: -80, quality: 1, timestamp: 101)
        XCTAssertEqual(first, 9.0, accuracy: 1e-9)
    }

    func testRangingJumpHasNoStepLimitOrSecondBlend() {
        let store = makeStore()
        let reference = KalmanFilter(processNoise: 0.02, measurementNoise: 4.0)
        var expected = 0.0
        var time = 100.0
        for _ in 0..<30 {
            store.recordRanging(beaconName: "B1", accuracy: 2.0, rssi: -60, quality: 1, timestamp: time)
            expected = reference.filter(2.0)
            time += 0.1
        }
        let stored = store.recordRanging(beaconName: "B1", accuracy: 8.0, rssi: -60, quality: 1, timestamp: time)
        expected = reference.filter(8.0)
        XCTAssertEqual(stored ?? -1, expected, accuracy: 1e-9)
    }

    func testInvalidRangingCallbackIsNotFresh() {
        let store = makeStore()
        XCTAssertNil(store.recordRanging(beaconName: "B1", accuracy: -1, rssi: 0, quality: 0.1, timestamp: 100))
        XCTAssertNil(store.selection(for: "B1", at: 100))
        XCTAssertTrue(store.shouldUseRSSI(for: "B1", at: 100))
    }

    func testThreeRangingCallbacksPerTickYieldOneSolution() {
        let store = makeStore()
        var solutions = 0
        // Drei Callbacks (je Constraint einer) innerhalb eines 0.35-s-Ticks.
        for name in ["B1", "B2", "B3"] {
            store.recordRanging(beaconName: name, accuracy: 4.0, rssi: -65, quality: 1, timestamp: 100.1)
        }
        XCTAssertEqual(store.callbacksSinceLastTick, 3)
        XCTAssertEqual(store.solveCount, 0, "Callbacks duerfen nicht loesen")

        let measurementCount = store.solveTick(at: 100.35) { measurements -> Int in
            solutions += 1
            return measurements.count
        }
        XCTAssertEqual(solutions, 1)
        XCTAssertEqual(measurementCount, 3)
        XCTAssertEqual(store.solveCount, 1)
        XCTAssertEqual(store.callbacksSinceLastTick, 0)
    }

    func testStaleMeasurementsExpireAndResetFilter() {
        let store = makeStore()
        store.recordRanging(beaconName: "B1", accuracy: 2.0, rssi: -60, quality: 1, timestamp: 100)
        store.expireStaleMeasurements(at: 102.1)
        XCTAssertNil(store.measurement(beaconName: "B1", source: .ranging))
        // Neuer Wert initialisiert den zurueckgesetzten Filter exakt.
        let value = store.recordRanging(beaconName: "B1", accuracy: 7.0, rssi: -60, quality: 1, timestamp: 103)
        XCTAssertEqual(value ?? -1, 7.0, accuracy: 1e-9)
    }
}
