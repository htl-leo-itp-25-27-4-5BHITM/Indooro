import XCTest
import simd
@testable import IndooroNavigation

final class LayoutAndGraphTests: XCTestCase {
    func testDemoLayoutDecodesWithInjectedBeaconGrid() throws {
        let layout = try TestLayouts.demoSupermarket()
        XCTAssertEqual(layout.gridSize.width, 40)
        XCTAssertEqual(layout.gridSize.height, 60)
        XCTAssertEqual(layout.elements.filter(\.isBeacon).count, 40) // 5 x 8 Zellen
    }

    func testGraphRouteExistsBetweenAisles() throws {
        let layout = try TestLayouts.demoSupermarket(beaconSpacing: nil)
        let graph = TestLayouts.demoGraph(layout: layout)
        let route = graph.shortestRoute(from: SIMD2(20.5, 8.5), to: SIMD2(26.5, 8.5))
        XCTAssertNotNil(route)
        XCTAssertEqual(route?.totalCost ?? 0, 6, accuracy: 0.01)
    }

    func testBeaconSolverRecoversTruthWithoutNoise() throws {
        let layout = try TestLayouts.demoSupermarket()
        let beacons = layout.elements.filter(\.isBeacon).map {
            (name: $0.beaconId ?? "", point: SIMD2<Float>(Float($0.x), Float($0.y)))
        }
        let solver = BeaconPositionSolver(
            bounds: CGRect(x: 0, y: 0, width: 40, height: 60),
            config: BeaconPositioningConfig()
        )
        let walk = SyntheticWalk(polyline: [SIMD2(20, 8), SIMD2(20, 9)], speedMetersPerSecond: 1)
        var rng = SplitMix64(seed: 3)
        let truth = SIMD2<Float>(20, 8)
        let nearby = walk.beaconMeasurements(at: truth, beacons: beacons, rng: &rng)
            .filter { $0.distanceMeters <= 9 }
        let estimate = solver.solve(measurements: nearby)
        XCTAssertNotNil(estimate)
        XCTAssertLessThan(simd_length((estimate?.point ?? .zero) - truth), 0.5)
    }

    func testKalmanFilterConvergesToConstantInput() {
        let filter = KalmanFilter(processNoise: 0.01, measurementNoise: 1.0)
        var value = 0.0
        for _ in 0..<50 { value = filter.filter(5.0) }
        XCTAssertEqual(value, 5.0, accuracy: 0.05)
    }
}
