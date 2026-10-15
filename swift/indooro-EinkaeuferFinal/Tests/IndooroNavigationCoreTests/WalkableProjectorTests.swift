import XCTest
import simd
@testable import IndooroNavigationCore

/// Spec "Projected position is history-free and unbiased" (Task 6.10).
final class WalkableProjectorTests: XCTestCase {
    private let tick = 0.35

    private func makeProjector() throws -> WalkableProjector {
        let layout = try TestLayouts.demoSupermarket(beaconSpacing: nil)
        return WalkableProjector(graph: TestLayouts.demoGraph(layout: layout))
    }

    func testAisleChangeThroughShelfEndsInNewAisle() throws {
        // Regal 525/1 (x 29...38, y 56...59): oberhalb Gang y = 55.5, darunter y = 59.5.
        let projector = try makeProjector()
        let oldAisle = projector.project(SIMD2<Float>(33.5, 55.5))
        XCTAssertEqual(oldAisle?.projectedPoint.y ?? 0, 55.5, accuracy: 0.01)

        let newAisle = projector.project(SIMD2<Float>(33.5, 59.5))
        print("AFTER56 projector.aisleChange.projectedY_m=\(String(format: "%.3f", newAisle?.projectedPoint.y ?? 0))")
        XCTAssertEqual(newAisle?.projectedPoint.y ?? 0, 59.5, accuracy: 0.01, "Projektion folgt der Schaetzung in den neuen Gang")
    }

    func testPointInsideShelfIsMovedOntoWalkableLine() throws {
        let projector = try makeProjector()
        let inside = SIMD2<Float>(33.5, 57.5)
        let projection = try XCTUnwrap(projector.project(inside))
        let y = projection.projectedPoint.y
        XCTAssertTrue(abs(y - 55.5) < 0.01 || abs(y - 59.5) < 0.01, "y = \(y)")
        XCTAssertLessThanOrEqual(projection.distanceToPoint, 2.5)
    }

    func testLeftWalkingProjectionStaysOnHorizontalLine() throws {
        // Offener Gang y = 5...10: Zeilenmitte y = 8.5; Punkte liegen 0.02 m daneben und weichen den Knotenspalten x.5 aus.
        let projector = try makeProjector()
        var maxDeviation: Float = 0
        var x: Float = 24
        while x > 17 {
            let projection = try XCTUnwrap(projector.project(SIMD2<Float>(x, 8.52)))
            maxDeviation = max(maxDeviation, abs(projection.projectedPoint.y - 8.5))
            x -= 0.43
        }
        print("AFTER56 projector.leftWalking.maxDeviationFromLine_m=\(String(format: "%.3f", maxDeviation))")
        XCTAssertLessThan(maxDeviation, 0.001)
    }

    func testProjectionIsIndependentOfPreviousCalls() throws {
        let projector = try makeProjector()
        let target = SIMD2<Float>(20.9, 8.6)
        let first = projector.project(target)?.projectedPoint
        _ = projector.project(SIMD2<Float>(33.5, 55.5))
        _ = projector.project(SIMD2<Float>(3, 3))
        XCTAssertEqual(projector.project(target)?.projectedPoint, first)
    }

    func testEstimatorAndProjectorFollowConfirmedTwentyMeterJump() throws {
        let projector = try makeProjector()
        let service = PoseFusionService(config: StabilizedNavigationConfig.default.poseFusion)
        let origin = SIMD2<Float>(14.5, 7.5)
        let moved = origin + SIMD2<Float>(20, 0)
        var time = 0.0
        var projected = projector.project(origin)?.projectedPoint ?? origin
        for index in 0..<30 {
            let solved = index < 5 ? origin : moved
            if let estimate = service.update(solvedPoint: solved, confidence: 1, timestamp: time) {
                projected = projector.project(estimate.point)?.projectedPoint ?? projected
            }
            time += tick
        }
        print("AFTER56 estimator.jump20m.projectedShiftX_m=\(String(format: "%.3f", projected.x - origin.x))")
        XCTAssertGreaterThan(projected.x - origin.x, 18, "Bestaetigter Sprung wird uebernommen (Baseline: 0 m)")
    }
}
