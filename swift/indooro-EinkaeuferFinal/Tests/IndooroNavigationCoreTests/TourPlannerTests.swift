import XCTest
import simd
@testable import IndooroNavigationCore

/// Task 9.10: Tourenplanung (Distanzmatrix, Nearest Neighbor, 2-opt auf dem offenen Pfad).
final class TourPlannerTests: XCTestCase {
    private func openGraph() -> IndoorGraph {
        IndoorGraphBuilder.fromLayout(gridWidth: 40, gridHeight: 30, elements: [])
    }

    private func stop(_ id: String, _ x: Float, _ y: Float, seed: Int = 0) -> TourPlanStop {
        TourPlanStop(id: id, title: id, mapPoint: SIMD2(x, y), orderSeed: seed)
    }

    private func randomStops(count: Int, seed: UInt64, width: Float = 38, height: Float = 28) -> [TourPlanStop] {
        var rng = SplitMix64(seed: seed)
        return (0..<count).map { index in
            let x = Float(rng.nextUnit()) * width + 0.5
            let y = Float(rng.nextUnit()) * height + 0.5
            return stop("S\(index)", x.rounded(.down) + 0.5, y.rounded(.down) + 0.5, seed: index)
        }
    }

    func testTwoOptNeverLongerThanNearestNeighbour() {
        let graph = openGraph()
        let start = SIMD2<Float>(0.5, 0.5)
        var improved = 0
        for seed in 0..<40 {
            let stops = randomStops(count: 12, seed: UInt64(seed))
            let nn = TourPlanner.nearestNeighborOrder(stops: stops, start: start, graph: graph)
            let opt = TourPlanner.order(stops: stops, start: start, graph: graph, mode: .optimized)
            let nnLength = TourPlanner.pathLength(of: nn, start: start, graph: graph)
            let optLength = TourPlanner.pathLength(of: opt, start: start, graph: graph)
            XCTAssertLessThanOrEqual(optLength, nnLength + 0.001, "seed \(seed)")
            XCTAssertEqual(Set(opt.map(\.id)), Set(stops.map(\.id)))
            if optLength < nnLength - 0.5 { improved += 1 }
        }
        // Das Beispiel „Kreuzung wird entfernt“ kommt in den Stichproben vor.
        XCTAssertGreaterThan(improved, 0)
    }

    func testCrossingExampleImproves() {
        let graph = openGraph()
        let start = SIMD2<Float>(0.5, 0.5)
        // Beste Verbesserung ueber feste Seeds: das Planungsergebnis ist strikt kuerzer als Nearest Neighbor.
        var bestGain: Float = 0
        for seed in 100..<160 {
            let stops = randomStops(count: 10, seed: UInt64(seed))
            let nn = TourPlanner.nearestNeighborOrder(stops: stops, start: start, graph: graph)
            let opt = TourPlanner.order(stops: stops, start: start, graph: graph, mode: .optimized)
            bestGain = max(
                bestGain,
                TourPlanner.pathLength(of: nn, start: start, graph: graph)
                    - TourPlanner.pathLength(of: opt, start: start, graph: graph)
            )
        }
        XCTAssertGreaterThan(bestGain, 1.0)
    }

    func testPositionJitterNeverChangesTheStoredPlan() {
        // Zwei Stopps symmetrisch (je 6 m) um den Startpunkt: Das Planungsergebnis haengt nicht vom Jitter ab,
        // weil nicht je Update, sondern nur bei Planungsereignissen geplant wird. Die Session haelt den Plan.
        let graph = openGraph()
        let a = stop("A", 14.5, 15.5, seed: 0)
        let b = stop("B", 26.5, 15.5, seed: 1)
        let center = SIMD2<Float>(20.5, 15.5)
        var core = NavigationSessionCore(graph: graph)
        core.seedPosition(center)
        let initial = TourPlanner.order(stops: [b, a], start: center, graph: graph, mode: .optimized)
        core.startTour(plan: initial.map(\.navigationStop))
        let order = core.plan.map(\.id)
        let builds = core.routeBuildCount

        var rng = SplitMix64(seed: 11)
        var now: TimeInterval = 100
        for _ in 0..<100 {
            now += 0.35
            let angle = Float(rng.nextUnit() * 2 * Double.pi)
            let radius = Float(rng.nextUnit()) * 0.85
            let jittered = center + SIMD2<Float>(cos(angle), sin(angle)) * radius
            core.positionUpdated(jittered, confidence: 0.9, at: now)
        }
        XCTAssertEqual(core.plan.map(\.id), order)
        XCTAssertEqual(core.activeStopID, order.first)
        XCTAssertEqual(core.routeBuildCount, builds)
        print("AFTER910 routing.nearestNeighbour.planChangesUnderJitter=0")
    }

    func testPlanningIsDeterministicAndTieBreaksBySeedThenTitle() {
        let graph = openGraph()
        let start = SIMD2<Float>(20.5, 15.5)
        let stops = [stop("B", 26.5, 15.5, seed: 5), stop("A", 14.5, 15.5, seed: 5), stop("C", 20.5, 9.5, seed: 1)]
        let first = TourPlanner.order(stops: stops, start: start, graph: graph, mode: .optimized)
        for _ in 0..<5 {
            XCTAssertEqual(
                TourPlanner.order(stops: stops.reversed(), start: start, graph: graph, mode: .optimized).map(\.id),
                first.map(\.id)
            )
        }
        // C, A, B sind alle 6 m entfernt: niedrigster orderSeed (C) zuerst.
        XCTAssertEqual(first.first?.id, "C")
        // Danach ist A (seed 5, Titel A) beim Gleichstand vor B.
        let nn = TourPlanner.nearestNeighborOrder(stops: stops, start: start, graph: graph)
        XCTAssertEqual(nn.first?.id, "C")
    }

    func testListOrderModeBypassesPlanner() {
        let graph = openGraph()
        let stops = [stop("far", 35.5, 15.5, seed: 0), stop("near", 21.5, 15.5, seed: 1)]
        let result = TourPlanner.order(stops: stops, start: SIMD2(20.5, 15.5), graph: graph, mode: .listOrder)
        XCTAssertEqual(result.map(\.id), ["far", "near"])
        let noStart = TourPlanner.order(stops: stops, start: nil, graph: graph, mode: .optimized)
        XCTAssertEqual(noStart.map(\.id), ["far", "near"])
        let noGraph = TourPlanner.order(stops: stops, start: SIMD2(20.5, 15.5), graph: nil, mode: .optimized)
        XCTAssertEqual(noGraph.map(\.id), ["far", "near"])
    }

    func testUnreachableStopsArePlacedLastInSeedOrder() throws {
        // Eine durchgehende Wand trennt das Raster bei x = 20.
        let json = """
        [{"id": 1, "type": "shelf", "x": 20, "y": 0, "width": 1, "height": 30}]
        """
        let wall = try JSONDecoder().decode([LayoutElement].self, from: Data(json.utf8))
        let graph = IndoorGraphBuilder.fromLayout(gridWidth: 40, gridHeight: 30, elements: wall)
        let stops = [
            stop("farSide2", 30.5, 5.5, seed: 0),
            stop("here1", 10.5, 5.5, seed: 1),
            stop("farSide1", 30.5, 25.5, seed: 2),
            stop("here2", 5.5, 25.5, seed: 3)
        ]
        let result = TourPlanner.order(stops: stops, start: SIMD2(2.5, 2.5), graph: graph, mode: .optimized)
        XCTAssertEqual(result.count, 4)
        XCTAssertEqual(Set(result.prefix(2).map(\.id)), ["here1", "here2"])
        XCTAssertEqual(result.suffix(2).map(\.id), ["farSide2", "farSide1"])
    }

    // MARK: - Listenaenderungen

    func testPlanAfterListChangeIsNilWhenStopSetIsUnchanged() {
        let graph = openGraph()
        let stops = [stop("A", 5.5, 15.5), stop("B", 30.5, 15.5), stop("C", 20.5, 3.5)]
        let plan = TourPlanner.planAfterListChange(
            resolved: stops,
            storedPlanIDs: ["C", "A", "B"],
            activeStopID: "C",
            projectedStart: SIMD2(20.5, 15.5),
            entranceStart: nil,
            graph: graph,
            mode: .optimized
        )
        XCTAssertNil(plan)
    }

    func testAddingAProductKeepsActiveStopAndReplansOthersFromActive() {
        let graph = openGraph()
        let a = stop("A", 5.5, 15.5)
        let c = stop("C", 20.5, 3.5)
        let d = stop("D", 35.5, 3.5)
        let e = stop("E", 6.5, 14.5)
        var core = NavigationSessionCore(graph: graph)
        core.seedPosition(SIMD2(28.5, 15.5))
        core.startTour(plan: [a, c, d].map(\.navigationStop))
        let builds = core.routeBuildCount

        let plan = TourPlanner.planAfterListChange(
            resolved: [a, c, d, e],
            storedPlanIDs: core.plan.map(\.id),
            activeStopID: core.activeStopID,
            projectedStart: SIMD2(28.5, 15.5),
            entranceStart: nil,
            graph: graph,
            mode: .optimized
        )
        let newPlan = try! XCTUnwrap(plan)
        XCTAssertEqual(newPlan.first?.id, "A")
        // E liegt direkt neben A und kommt nach A zuerst.
        XCTAssertEqual(newPlan[1].id, "E")
        core.listChanged(plan: newPlan.map(\.navigationStop))
        XCTAssertEqual(core.activeStopID, "A")
        XCTAssertEqual(core.plan.map(\.id), newPlan.map(\.id))
        XCTAssertEqual(core.routeBuildCount, builds)
    }

    func testRemovingActiveStopReplansFromProjectedPosition() {
        let graph = openGraph()
        let a = stop("A", 5.5, 15.5)
        let c = stop("C", 20.5, 3.5)
        let d = stop("D", 35.5, 3.5)
        var core = NavigationSessionCore(graph: graph)
        core.seedPosition(SIMD2(34.5, 10.5))
        core.startTour(plan: [a, c, d].map(\.navigationStop))
        let builds = core.routeBuildCount

        let plan = TourPlanner.planAfterListChange(
            resolved: [c, d],
            storedPlanIDs: core.plan.map(\.id),
            activeStopID: core.activeStopID,
            projectedStart: SIMD2(34.5, 10.5),
            entranceStart: nil,
            graph: graph,
            mode: .optimized
        )
        let newPlan = try! XCTUnwrap(plan)
        // Ab der Position liegt D naeher als C.
        XCTAssertEqual(newPlan.map(\.id), ["D", "C"])
        core.listChanged(plan: newPlan.map(\.navigationStop))
        XCTAssertEqual(core.activeStopID, "D")
        XCTAssertEqual(core.routeBuildCount, builds + 1)
    }

    func testDoneAndSkipDoNotReoptimize() {
        // Gespeicherte (nicht optimale) Reihenfolge bleibt beim Vorruecken erhalten, auch wenn ein anderer Stopp naeher ist.
        var core = NavigationSessionCore(graph: openGraph())
        core.seedPosition(SIMD2(20.5, 15.5))
        core.startTour(plan: [stop("A", 5.5, 15.5), stop("B", 35.5, 15.5), stop("C", 21.5, 15.5)].map(\.navigationStop))
        core.stopSkipped()
        XCTAssertEqual(core.activeStopID, "B")
        XCTAssertEqual(core.plan.map(\.id), ["B", "C"])
        // Die Listenmenge entspricht dem gespeicherten Plan: kein neuer Plan.
        XCTAssertNil(TourPlanner.planAfterListChange(
            resolved: [stop("B", 35.5, 15.5), stop("C", 21.5, 15.5)],
            storedPlanIDs: core.plan.map(\.id),
            activeStopID: core.activeStopID,
            projectedStart: SIMD2(20.5, 15.5),
            entranceStart: nil,
            graph: openGraph(),
            mode: .optimized
        ))
    }

    // MARK: - Messung

    func testPlanningTimeFor25StopsAndNNvs2OptLength() throws {
        let layout = try TestLayouts.demoSupermarket(beaconSpacing: nil)
        let graph = TestLayouts.demoGraph(layout: layout)
        let start = SIMD2<Float>(20.5, 8.5)

        // Stopps auf freien Zellen des Demo-Layouts (naechster Knoten wird in der Planung gewaehlt).
        var nnTotal: Float = 0
        var optTotal: Float = 0
        var maxMillis = 0.0
        let samples = 10
        for seed in 0..<samples {
            var rng = SplitMix64(seed: UInt64(500 + seed))
            let stops = (0..<25).map { index in
                stop(
                    "S\(index)",
                    Float(rng.nextUnit() * Double(layout.gridSize.width - 1)) + 0.5,
                    Float(rng.nextUnit() * Double(layout.gridSize.height - 1)) + 0.5,
                    seed: index
                )
            }
            let began = Date()
            let optimized = TourPlanner.order(stops: stops, start: start, graph: graph, mode: .optimized)
            maxMillis = max(maxMillis, Date().timeIntervalSince(began) * 1000)
            let nn = TourPlanner.nearestNeighborOrder(stops: stops, start: start, graph: graph)
            nnTotal += TourPlanner.pathLength(of: nn, start: start, graph: graph)
            optTotal += TourPlanner.pathLength(of: optimized, start: start, graph: graph)
            XCTAssertEqual(optimized.count, 25)
        }
        print(String(format: "AFTER910 planning.25stops.maxMillis=%.1f", maxMillis))
        print(String(format: "AFTER910 planning.length.nn.mean_m=%.1f", nnTotal / Float(samples)))
        print(String(format: "AFTER910 planning.length.twoOpt.mean_m=%.1f", optTotal / Float(samples)))
        XCTAssertLessThanOrEqual(optTotal, nnTotal + 0.01)
    }
}
