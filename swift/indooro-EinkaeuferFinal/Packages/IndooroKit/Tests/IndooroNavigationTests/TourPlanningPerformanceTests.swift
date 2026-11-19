import IndooroModels
import XCTest
import simd
@testable import IndooroNavigation

/// Task 5.6: Laufzeit der Tourplanung mit 25 Stopps.
/// Budget aus design.md D8: 16 ms auf einem iPhone 12 fuer ein 40 x 30 m Layout; auf dem CI-Simulator
/// gilt die Toleranz x3 (48 ms). `swift test` baut im Debug-Modus (ohne Optimierung), dort gilt
/// zusaetzlich x10, damit der Test auf Entwicklerrechnern nicht an der fehlenden Optimierung scheitert.
final class TourPlanningPerformanceTests: XCTestCase {
    private static let budgetSeconds = 0.016
    private static let ciTolerance = 3.0
    #if DEBUG
    private static let buildModeFactor = 10.0
    #else
    private static let buildModeFactor = 1.0
    #endif
    private static let runs = 7

    private func report(_ name: String, _ seconds: Double) {
        print("PERF \(name) median_ms=\(String(format: "%.2f", seconds * 1000))")
    }

    private func randomStops(count: Int, seed: UInt64, width: Float, height: Float) -> [TourPlanStop] {
        var rng = SplitMix64(seed: seed)
        return (0..<count).map { index in
            let x = (Float(rng.nextUnit()) * (width - 2)).rounded(.down) + 1.5
            let y = (Float(rng.nextUnit()) * (height - 2)).rounded(.down) + 1.5
            return TourPlanStop(id: "S\(index)", title: "S\(index)", mapPoint: SIMD2(x, y), orderSeed: index)
        }
    }

    private func medianSeconds(_ body: () -> Void) -> Double {
        let clock = ContinuousClock()
        var samples: [Double] = []
        for _ in 0..<Self.runs {
            let elapsed = clock.measure(body)
            samples.append(Double(elapsed.components.seconds) + Double(elapsed.components.attoseconds) / 1e18)
        }
        return samples.sorted()[samples.count / 2]
    }

    private func assertWithinBudget(_ name: String, _ median: Double, file: StaticString = #filePath, line: UInt = #line) {
        report(name, median)
        let limit = Self.budgetSeconds * Self.ciTolerance * Self.buildModeFactor
        XCTAssertLessThanOrEqual(median, limit, "\(name) braucht \(median * 1000) ms, Budget \(limit * 1000) ms", file: file, line: line)
    }

    func testPlanning25StopsOnOpen40x30LayoutStaysWithinBudget() {
        let snapshot = LayoutGraphSnapshot(revision: 1, gridWidth: 40, gridHeight: 30, elements: [])
        let stops = randomStops(count: 25, seed: 25, width: 40, height: 30)
        let start = SIMD2<Float>(0.5, 0.5)

        var ordered: [TourPlanStop] = []
        let median = medianSeconds {
            ordered = TourPlanner.order(stops: stops, start: start, graph: snapshot.graph, mode: .optimized)
        }
        XCTAssertEqual(Set(ordered.map(\.id)), Set(stops.map(\.id)))
        assertWithinBudget("tour25.open40x30", median)
    }

    func testPlanning25StopsOnDemoSupermarketStaysWithinBudget() throws {
        let layout = try TestLayouts.demoSupermarket(beaconSpacing: nil)
        let snapshot = LayoutGraphSnapshot(revision: 1, layout: layout)
        let stops = randomStops(count: 25, seed: 26, width: 40, height: 60)
        let start = try XCTUnwrap(snapshot.entrance)

        var ordered: [TourPlanStop] = []
        let median = medianSeconds {
            ordered = TourPlanner.order(stops: stops, start: start, graph: snapshot.graph, mode: .optimized)
        }
        XCTAssertEqual(Set(ordered.map(\.id)), Set(stops.map(\.id)))
        // Das Demo-Layout ist 40 x 60 m und damit doppelt so gross wie das Budget-Layout.
        report("tour25.demoSupermarket", median)
        let limit = Self.budgetSeconds * Self.ciTolerance * Self.buildModeFactor * 2
        XCTAssertLessThanOrEqual(median, limit)
    }

    func testSnapshotBuildFor25StopLayoutStaysWithinBudget() throws {
        let layout = try TestLayouts.demoSupermarket(beaconSpacing: nil)
        let median = medianSeconds {
            _ = LayoutGraphSnapshot(revision: 1, layout: layout)
        }
        report("snapshot.build.demoSupermarket", median)
        let limit = Self.budgetSeconds * Self.ciTolerance * Self.buildModeFactor * 2
        XCTAssertLessThanOrEqual(median, limit)
    }
}
