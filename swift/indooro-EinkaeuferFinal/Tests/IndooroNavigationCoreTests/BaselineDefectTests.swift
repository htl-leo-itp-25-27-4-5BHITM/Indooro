import XCTest
import simd
@testable import IndooroNavigationCore

/// Baseline-Tests (Task 2.5): Jeder Test dokumentiert einen BEKANNTEN DEFEKT des
/// aktuellen Verhaltens (docs/NAVIGATION_REVIEW.md C.9/C.10) und besteht, solange
/// der Defekt existiert. Die Zahlen werden mit `BASELINE key=value` ausgegeben und
/// stehen in NavigationFixtures/BASELINE.md. Die Assertions werden in den
/// Tasks 8.6 / 9.10 invertiert. PoseFusion- und MapMatcher-Tests (C.1/C.2) wurden in
/// Task 6.10 durch `PoseEstimatorTests` / `WalkableProjectorTests` ersetzt.
final class BaselineDefectTests: XCTestCase {
    private let tick = 0.35

    private func report(_ key: String, _ value: Double) {
        print("BASELINE \(key)=\(String(format: "%.3f", value))")
    }

    // MARK: - Routing

    func testBaseline_routeShapeVariesForStartsWithinFortyCentimeters() throws {
        let layout = try TestLayouts.demoSupermarket(beaconSpacing: nil)
        let graph = TestLayouts.demoGraph(layout: layout)
        var rng = SplitMix64(seed: 7)
        let destination = SIMD2<Float>(26.5, 4.5)
        var sequences = Set<[Int]>()
        for _ in 0..<40 {
            let start = SIMD2<Float>(
                20 + Float(rng.nextUnit() * 0.8 - 0.4),
                8 + Float(rng.nextUnit() * 0.8 - 0.4)
            )
            if let route = graph.shortestRoute(from: start, to: destination) {
                sequences.insert(route.edgeIDs)
            }
        }
        report("routing.distinctEdgeSequencesFor40Starts", Double(sequences.count))
        // Defekt C.9/C.10: kleine Startverschiebungen erzeugen unterschiedliche Routenformen.
        // Inverted in task 8.6
        XCTAssertGreaterThan(sequences.count, 1)
    }

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
