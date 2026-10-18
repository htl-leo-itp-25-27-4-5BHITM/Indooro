import IndooroTestSupport
import XCTest
import simd
@testable import IndooroPositioning

/// Task 9.2: Blickrichtung aus Kompass und Bewegung (Verhalten wie `BeaconManager`).
final class HeadingFusionTests: XCTestCase {
    func testCompassEastMapsToHalfPiAndIsReliable() {
        var fusion = HeadingFusion()
        fusion.updateDevice(degrees: 90, accuracyDegrees: 5)
        fusion.refresh(movementHeading: nil, movementHeadingIsFresh: false)
        XCTAssertEqual(fusion.published ?? 0, .pi / 2, accuracy: 1e-5)
        XCTAssertTrue(fusion.isReliable)
    }

    func testPoorCompassAccuracyIsNotReliable() {
        var fusion = HeadingFusion()
        fusion.updateDevice(degrees: 10, accuracyDegrees: 40)
        fusion.refresh(movementHeading: nil, movementHeadingIsFresh: false)
        XCTAssertNotNil(fusion.published)
        XCTAssertFalse(fusion.isReliable)
    }

    func testMovementBelowTwelveCentimetersGivesNoHeading() {
        var fusion = HeadingFusion()
        XCTAssertNil(fusion.movementHeading(currentPoint: SIMD2(1, 1), timestamp: 0))
        XCTAssertNil(fusion.movementHeading(currentPoint: SIMD2(1.05, 1), timestamp: 0.35))
        let heading = fusion.movementHeading(currentPoint: SIMD2(1.05, 2), timestamp: 0.7)
        XCTAssertEqual(heading ?? 99, 0, accuracy: 1e-5)
    }

    func testMovementHeadingExpiresAfterReliabilityTimeout() {
        var fusion = HeadingFusion()
        _ = fusion.movementHeading(currentPoint: SIMD2(0, 0), timestamp: 0)
        _ = fusion.movementHeading(currentPoint: SIMD2(0, 1), timestamp: 0.35)
        XCTAssertNotNil(fusion.recentMovementHeading(at: 1.7))
        XCTAssertNil(fusion.recentMovementHeading(at: 1.8))
    }

    func testPublishedHeadingChangesOnlyByAtLeastOneDegree() {
        var fusion = HeadingFusion()
        fusion.updateDevice(degrees: 90, accuracyDegrees: 5)
        fusion.refresh(movementHeading: nil, movementHeadingIsFresh: false)
        let first = fusion.published
        fusion.updateDevice(degrees: 90.5, accuracyDegrees: 5)
        fusion.refresh(movementHeading: nil, movementHeadingIsFresh: false)
        XCTAssertEqual(fusion.published, first)
    }

    func testEngineAppliesCompassFromProviderStream() async throws {
        let headings = FakeHeadingProvider()
        let rig = try EngineRig(headings: headings)
        await rig.prepare()
        await rig.engine.ingest(HeadingSample(degrees: 90, accuracyDegrees: 5, timestamp: rig.clock.now()))
        let snapshot = try await rig.tick(truth: SIMD2<Float>(6, 6)).unwrapped()
        XCTAssertEqual(snapshot.headingRadians ?? 0, .pi / 2, accuracy: 1e-4)
        XCTAssertTrue(snapshot.isHeadingReliable)
        await rig.engine.stop()
    }

    func testEngineAcceptsStepsFromProvider() async throws {
        let motion = FakeMotionProvider()
        let rig = try EngineRig(motion: motion)
        await rig.prepare()
        await rig.engine.ingest(StepSample(cumulativeSteps: 5, timestamp: rig.clock.now()))
        let snapshot = try await rig.tick(truth: SIMD2<Float>(6, 6)).unwrapped()
        XCTAssertEqual(snapshot.activeBeaconCount, 4)
        await rig.engine.stop()
    }
}

extension Optional {
    func unwrapped() throws -> Wrapped {
        guard let self else { throw NoSnapshotError() }
        return self
    }
}
