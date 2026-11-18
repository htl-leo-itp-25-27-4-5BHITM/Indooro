import IndooroModels
import IndooroNavigation
import IndooroTestSupport
import XCTest
import simd
@testable import IndooroNavigation
@testable import IndooroPositioning

/// Task 9.6: Engine-Tests mit Fake-Radio und `TestClock`.
final class PositioningEngineTests: XCTestCase {
    private let center = SIMD2<Float>(6, 6)

    func testWarmupPublishesNoPositionUntilWarmupElapsed() async throws {
        let rig = try EngineRig()
        await rig.prepare()
        let warmup = rig.config.beacon.warmupSeconds

        var statuses: [PositionSnapshot.Status] = []
        var elapsed = 0.0
        while elapsed + rig.config.beacon.updateIntervalSeconds < warmup {
            let snapshot = await rig.tick(truth: center)
            statuses.append(try XCTUnwrap(snapshot).status)
            XCTAssertNil(snapshot?.displayedPoint)
            XCTAssertFalse(snapshot?.isTrusted ?? true)
            elapsed += rig.config.beacon.updateIntervalSeconds
        }
        XCTAssertFalse(statuses.isEmpty)
        XCTAssertTrue(statuses.allSatisfy { $0 == .warmingUp })

        await rig.finishWarmup(truth: center)
        let snapshot = try await rig.latest()
        XCTAssertNotEqual(snapshot.status, .warmingUp)
        await rig.engine.stop()
    }

    func testTrackingAfterWarmupIsTrustedAndNearTruth() async throws {
        let rig = try EngineRig()
        await rig.prepare()
        await rig.finishWarmup(truth: center)
        for _ in 0..<6 { await rig.tick(truth: center) }

        let snapshot = try await rig.latest()
        XCTAssertEqual(snapshot.status, .tracking)
        XCTAssertTrue(snapshot.isTrusted)
        XCTAssertEqual(snapshot.activeBeaconCount, 4)
        XCTAssertEqual(snapshot.layoutRevision, 1)
        let point = try XCTUnwrap(snapshot.displayedPoint)
        XCTAssertEqual(simd_length(point - center), 0, accuracy: 1.0)
        XCTAssertGreaterThanOrEqual(snapshot.confidence, rig.config.confidence.lowThreshold)
        await rig.engine.stop()
    }

    func testSnapshotSequenceIncreasesStrictly() async throws {
        let rig = try EngineRig()
        await rig.prepare()
        var last = 0
        for _ in 0..<8 {
            let snapshot = try await rig.requireTick(truth: center)
            XCTAssertGreaterThan(snapshot.sequence, last)
            last = snapshot.sequence
        }
        await rig.engine.stop()
    }

    func testStaleBeaconsDropOutAndTrustIsLost() async throws {
        let rig = try EngineRig()
        await rig.prepare()
        await rig.finishWarmup(truth: center)
        for _ in 0..<6 { await rig.tick(truth: center) }
        let tracking = try await rig.latest()
        XCTAssertTrue(tracking.isTrusted)

        // Keine Samples mehr: alle Messungen laufen ab.
        var last = tracking
        for _ in 0..<20 {
            last = try await rig.requireTick(truth: nil)
            if last.activeBeaconCount == 0 { break }
        }
        XCTAssertEqual(last.activeBeaconCount, 0)
        XCTAssertFalse(last.isTrusted)
        XCTAssertNotEqual(last.status, .tracking)
        await rig.engine.stop()
    }

    func testTooFewBeaconsGivesNoTrustedPosition() async throws {
        let rig = try EngineRig()
        await rig.prepare()
        // Nur ein einziger Beacon sichtbar: kein vertrauenswuerdiger Fix.
        var snapshot: PositionSnapshot?
        for _ in 0..<12 {
            snapshot = await rig.tick(truth: center, skip: [2, 3, 4])
        }
        let result = try XCTUnwrap(snapshot)
        XCTAssertFalse(result.isTrusted)
        XCTAssertNotEqual(result.status, .tracking)
        XCTAssertLessThanOrEqual(result.activeBeaconCount, 1)
        await rig.engine.stop()
    }

    func testLowConfidenceIsPublishedButNotTrusted() async throws {
        let rig = try EngineRig()
        await rig.prepare()

        // Drei schwache Beacons (grosse Distanz, schlechter Pegel): es gibt eine Position, aber keine Konfidenz.
        func feedPoor() async {
            for minor: UInt16 in 1...3 {
                await rig.engine.ingest(BeaconSample(
                    source: .ranging(accuracy: 10.5, proximity: .unknown),
                    rssi: -91,
                    timestamp: rig.clock.now(),
                    identity: makeIdentity(minor: minor)
                ))
            }
        }
        var snapshot: PositionSnapshot?
        for _ in 0..<12 {
            await feedPoor()
            await rig.clock.advance(by: rig.config.beacon.updateIntervalSeconds)
            snapshot = try await rig.latest()
        }
        let low = try XCTUnwrap(snapshot)
        XCTAssertEqual(low.status, .lowConfidence)
        XCTAssertFalse(low.isTrusted)
        XCTAssertNotNil(low.displayedPoint)
        XCTAssertLessThan(low.confidence, rig.config.confidence.lowThreshold)

        // Gute Messungen stellen das Vertrauen wieder her.
        for _ in 0..<8 { await rig.tick(truth: center) }
        let recovered = try await rig.latest()
        XCTAssertEqual(recovered.status, .tracking)
        XCTAssertTrue(recovered.isTrusted)
        await rig.engine.stop()
    }

    func testJumpGateHoldsPositionAndReportsSuppressedJump() async throws {
        // Enges Sprung-Gate (0.1 m/s + 0.05 m), damit schon die gedaempfte Loesung des Solvers es ausloest.
        var config = StabilizedNavigationConfig.default
        config.poseFusion.maxPlausibleSpeed = 0.1
        config.poseFusion.jumpMargin = 0.05
        let rig = try EngineRig(config: config)
        await rig.prepare()
        await rig.finishWarmup(truth: center)
        for _ in 0..<8 { await rig.tick(truth: center) }
        let before = try await rig.latest()
        XCTAssertFalse(before.wasJumpSuppressed)
        let anchor = try XCTUnwrap(before.displayedPoint)

        var heldPoints: [SIMD2<Float>] = []
        for _ in 0..<2 {
            let snapshot = try await rig.requireTick(truth: SIMD2<Float>(10, 2))
            if snapshot.wasJumpSuppressed, let displayed = snapshot.displayedPoint {
                heldPoints.append(displayed)
            }
        }
        XCTAssertFalse(heldPoints.isEmpty, "Sprung muss unterdrueckt werden")
        for point in heldPoints {
            XCTAssertEqual(simd_length(point - anchor), 0, accuracy: 0.8, "Gehaltene Position bleibt am Ankerpunkt")
        }
        await rig.engine.stop()
    }

    func testManualCalibrationHoldsTrustUntilSolverIsSafe() async throws {
        let rig = try EngineRig()
        await rig.prepare()
        let target = SIMD2<Float>(3, 9)

        await rig.engine.calibrate(to: target)
        let calibrated = try await rig.latest()
        XCTAssertEqual(calibrated.status, .manual)
        XCTAssertTrue(calibrated.isTrusted)
        XCTAssertEqual(calibrated.confidence, 1)
        let displayed = try XCTUnwrap(calibrated.displayedPoint)
        XCTAssertEqual(simd_length(displayed - target), 0, accuracy: 0.8)
        XCTAssertEqual(calibrated.lastCalibration?.revision, 1)

        // Waehrend der Aufwaermphase und ohne Fix bleibt die manuelle Position vertraut.
        let during = try await rig.requireTick(truth: nil)
        XCTAssertTrue(during.isTrusted || during.status == .warmingUp)

        // Ein sicherer Solver-Fix beendet den manuellen Halt.
        await rig.finishWarmup(truth: target)
        for _ in 0..<6 { await rig.tick(truth: target) }
        let after = try await rig.latest()
        XCTAssertEqual(after.status, .tracking)
        XCTAssertEqual(after.lastCalibration?.revision, 1)
        await rig.engine.stop()
    }

    func testCalibrateAtCurrentEstimateUsesLastDisplayedPoint() async throws {
        let rig = try EngineRig()
        await rig.prepare()
        await rig.finishWarmup(truth: center)
        for _ in 0..<6 { await rig.tick(truth: center) }
        let trackedSnapshot = try await rig.latest()
        let tracked = try XCTUnwrap(trackedSnapshot.displayedPoint)

        await rig.engine.calibrateAtCurrentEstimate()
        let snapshot = try await rig.latest()
        XCTAssertEqual(snapshot.status, .manual)
        XCTAssertEqual(simd_length(try XCTUnwrap(snapshot.displayedPoint) - tracked), 0, accuracy: 0.8)
        await rig.engine.stop()
    }

    func testCalibrateWithoutEstimateDoesNothing() async throws {
        let rig = try EngineRig()
        await rig.engine.calibrateAtCurrentEstimate()
        let snapshot = await rig.engine.latestSnapshot
        XCTAssertNil(snapshot)
    }

    func testStopClearsMeasurementsAndPublishesStopped() async throws {
        let rig = try EngineRig()
        await rig.prepare()
        await rig.finishWarmup(truth: center)
        for _ in 0..<4 { await rig.tick(truth: center) }
        await rig.engine.stop()
        let snapshot = try await rig.latest()
        XCTAssertEqual(snapshot.status, .stopped)
        XCTAssertFalse(snapshot.isTrusted)
        XCTAssertEqual(snapshot.activeBeaconCount, 0)
        XCTAssertEqual(rig.radio.stops, 1)
    }

    func testRadioStartsWithLayoutConstraintsAndRestartsOnLayoutChange() async throws {
        let rig = try EngineRig()
        await rig.prepare()
        XCTAssertEqual(rig.radio.starts.count, 1)
        XCTAssertEqual(rig.radio.starts.first, [BeaconConstraint(uuid: testBeaconUUID, major: 1)])

        let storeUUID = UUID()
        await rig.engine.setStoreDetectionUUIDs([storeUUID])
        XCTAssertEqual(rig.radio.starts.count, 2)
        XCTAssertTrue(rig.radio.starts.last?.contains(BeaconConstraint(uuid: storeUUID, major: nil)) == true)

        await rig.engine.setLayout(PositioningLayout(layout: rig.layout, revision: 2))
        XCTAssertEqual(rig.radio.starts.count, 3)
        let snapshot = try await rig.latest()
        XCTAssertEqual(snapshot.layoutRevision, 2)
        XCTAssertEqual(snapshot.status, .warmingUp)
        await rig.engine.stop()
    }

    func testSamplesFlowThroughRadioStream() async throws {
        let rig = try EngineRig()
        await rig.prepare()
        for sample in rangingSamples(truth: center, at: rig.clock.now(), layout: rig.layout) {
            rig.radio.emit(sample)
        }
        // Die Ingest-Tasks laufen asynchron; warten, bis ein Tick die vier Messungen sieht.
        var count = 0
        for _ in 0..<2_000 where count < 4 {
            try await Task.sleep(nanoseconds: 1_000_000)
            count = await rig.engine.activeMeasurementCount()
        }
        XCTAssertEqual(count, 4)
        await rig.engine.stop()
    }

    func testRadioStatusIsReportedInSnapshots() async throws {
        let rig = try EngineRig()
        await rig.prepare()
        let status = RadioStatus(bluetooth: .poweredOn, authorization: .authorized)
        rig.radio.emit(status)
        var seen: RadioStatus?
        for _ in 0..<2_000 where seen != status {
            try await Task.sleep(nanoseconds: 1_000_000)
            seen = await rig.tick(truth: nil)?.radio
        }
        XCTAssertEqual(seen, status)
        await rig.engine.stop()
    }

    func testSnapshotsStreamDeliversPublishedSnapshots() async throws {
        let rig = try EngineRig()
        await rig.prepare()
        await rig.tick(truth: center)
        var received: [PositionSnapshot] = []
        for await snapshot in rig.engine.snapshots {
            received.append(snapshot)
            if received.count >= 2 { break }
        }
        XCTAssertEqual(received.count, 2)
        XCTAssertLessThan(received[0].sequence, received[1].sequence)
        await rig.engine.stop()
    }
}

