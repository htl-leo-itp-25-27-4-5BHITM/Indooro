import XCTest
import simd
@testable import IndooroNavigationCore

/// Baseline-Tests (Task 2.5): Jeder Test dokumentiert einen BEKANNTEN DEFEKT des
/// aktuellen Verhaltens (docs/NAVIGATION_REVIEW.md C.9/C.10) und besteht, solange
/// der Defekt existiert. Die Zahlen werden mit `BASELINE key=value` ausgegeben und
/// stehen in NavigationFixtures/BASELINE.md. Die Routenform-Assertion wurde in Task 8.6 invertiert,
/// der Nearest-Neighbour-Test wird in Task 9.10 invertiert. PoseFusion- und MapMatcher-Tests (C.1/C.2) wurden in
/// Task 6.10 durch `PoseEstimatorTests` / `WalkableProjectorTests` ersetzt.
final class BaselineDefectTests: XCTestCase {
    private let tick = 0.35

    private func report(_ key: String, _ value: Double) {
        print("BASELINE \(key)=\(String(format: "%.3f", value))")
    }

    // MARK: - Routing

    func testBaseline_nearestNeighbourFirstStopFlipsWithJitter() throws {
        let layout = try TestLayouts.demoSupermarket(beaconSpacing: nil)
        let graph = TestLayouts.demoGraph(layout: layout)
        // Zwei Stopps symmetrisch (je 6 m) um den Startpunkt im offenen Gang y = 8.5.
        let stops = [SIMD2<Float>(14.5, 8.5), SIMD2<Float>(26.5, 8.5)]
        let center = SIMD2<Float>(20.5, 8.5)
        var rng = SplitMix64(seed: 11)
        var firstStops = Set<Int>()
        for _ in 0..<60 {
            let angle = Float(rng.nextUnit() * 2 * Double.pi)
            let radius = Float(rng.nextUnit()) * 0.85
            let start = center + SIMD2<Float>(cos(angle), sin(angle)) * radius
            // Nearest-Neighbour wie MultiStopRoutePlanner.order: kleinste Routenkosten gewinnt.
            let costs = stops.map { graph.plannedRouteCost(from: start, to: $0) }
            firstStops.insert(costs[0] <= costs[1] ? 0 : 1)
        }
        report("routing.nearestNeighbour.distinctFirstStops", Double(firstStops.count))
        // Defekt C.10: Jitter <= 0.85 m kippt den ersten Stopp.
        // Inverted in task 9.10
        XCTAssertEqual(firstStops.count, 2)
    }
}
