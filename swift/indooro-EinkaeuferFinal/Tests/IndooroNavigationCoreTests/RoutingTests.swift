import XCTest
import simd
@testable import IndooroNavigationCore

/// Task 8.6: deterministische, abbiegeaverse Routensuche.
final class RoutingTests: XCTestCase {
    private func report(_ key: String, _ value: Double) {
        print("AFTER78 \(key)=\(String(format: "%.3f", value))")
    }

    /// Invertiert aus dem Baseline-Test (Task 2.5): Starts innerhalb 0.4 m um einen
    /// begehbaren Punkt liefern nach dem ersten Knoten dieselbe Kantenfolge.
    func testRouteShapeIsIdenticalAfterFirstNodeForStartsWithinFortyCentimeters() throws {
        let layout = try TestLayouts.demoSupermarket(beaconSpacing: nil)
        let graph = TestLayouts.demoGraph(layout: layout)
        var rng = SplitMix64(seed: 7)
        let destination = SIMD2<Float>(26.5, 4.5)
        let center = SIMD2<Float>(20.5, 8.5)
        var sequences = Set<[Int]>()
        var sequencesByFirstNode: [Int: Set<[Int]>] = [:]
        for _ in 0..<40 {
            let start = center + SIMD2<Float>(
                Float(rng.nextUnit() * 0.8 - 0.4),
                Float(rng.nextUnit() * 0.8 - 0.4)
            )
            let route = try XCTUnwrap(graph.shortestRoute(from: start, to: destination))
            sequences.insert(Array(route.edgeIDs.dropFirst()))
            sequencesByFirstNode[route.nodeIDs[0], default: []].insert(route.edgeIDs)
        }
        report("routing.distinctEdgeSequencesFor40Starts", Double(sequences.count))
        XCTAssertEqual(sequences.count, 1)
        // Auch an einer Zellecke (vier moegliche Startknoten) gibt es je Startknoten genau eine Form.
        for (_, shapes) in sequencesByFirstNode {
            XCTAssertEqual(shapes.count, 1)
        }

        var cornerShapes: [Int: Set<[Int]>] = [:]
        for _ in 0..<40 {
            let start = SIMD2<Float>(
                20 + Float(rng.nextUnit() * 0.8 - 0.4),
                8 + Float(rng.nextUnit() * 0.8 - 0.4)
            )
            let route = try XCTUnwrap(graph.shortestRoute(from: start, to: destination))
            cornerShapes[route.nodeIDs[0], default: []].insert(route.edgeIDs)
        }
        for (_, shapes) in cornerShapes {
            XCTAssertEqual(shapes.count, 1)
        }
    }

    func testRouteIsUnchangedAcrossRepeatedCalls() throws {
        let layout = try TestLayouts.demoSupermarket(beaconSpacing: nil)
        let graph = TestLayouts.demoGraph(layout: layout)
        let first = graph.shortestRoute(from: SIMD2(5.5, 8.5), to: SIMD2(30.5, 40.5))
        XCTAssertNotNil(first)
        for _ in 0..<5 {
            let again = graph.shortestRoute(from: SIMD2(5.5, 8.5), to: SIMD2(30.5, 40.5))
            XCTAssertEqual(again?.edgeIDs, first?.edgeIDs)
            XCTAssertEqual(again?.totalCost, first?.totalCost)
        }
        // Zwei frisch gebaute Graphen liefern dieselbe Route.
        let other = TestLayouts.demoGraph(layout: layout)
        XCTAssertEqual(other.shortestRoute(from: SIMD2(5.5, 8.5), to: SIMD2(30.5, 40.5))?.edgeIDs, first?.edgeIDs)
    }

    func testOneTurnPathPreferredOverFiveTurnPathOfEqualLength() {
        // Offenes 6 x 6 Raster, von (0,0) nach (5,5): alle monotonen Pfade sind gleich lang.
        let graph = openGridGraph(width: 6, height: 6)
        let route = graph.shortestRoute(from: SIMD2(0.5, 0.5), to: SIMD2(5.5, 5.5))
        XCTAssertNotNil(route)
        XCTAssertEqual(turnCount(of: route!.polyline), 1)
        XCTAssertEqual(route!.totalCost, 10 + 1.5, accuracy: 0.001)
    }

    func testTurnPenaltyDoesNotChangeStraightRoutes() {
        let graph = openGridGraph(width: 10, height: 3)
        let route = graph.shortestRoute(from: SIMD2(0.5, 1.5), to: SIMD2(9.5, 1.5))
        XCTAssertEqual(route?.totalCost ?? 0, 9, accuracy: 0.001)
        XCTAssertEqual(turnCount(of: route?.polyline ?? []), 0)
    }

    func testDestinationInsideShelfAndNoPathStillBehave() throws {
        let layout = try TestLayouts.demoSupermarket(beaconSpacing: nil)
        let graph = TestLayouts.demoGraph(layout: layout)
        // Ziel in einem Regal: naechster begehbarer Knoten wird verwendet.
        let shelf = try XCTUnwrap(layout.elements.first { $0.type != "beacon" && $0.type != "entrance" && ($0.width ?? 1) > 1 })
        let inside = SIMD2<Float>(Float(shelf.x) + Float((shelf.width ?? 1) / 2), Float(shelf.y) + Float((shelf.height ?? 1) / 2))
        XCTAssertNotNil(graph.shortestRoute(from: SIMD2(20.5, 8.5), to: inside))

        // Zwei getrennte Komponenten: keine Route.
        let nodes = [
            IndoorGraphNode(id: 0, mapPoint: SIMD2(0.5, 0.5), floor: 0),
            IndoorGraphNode(id: 1, mapPoint: SIMD2(1.5, 0.5), floor: 0),
            IndoorGraphNode(id: 2, mapPoint: SIMD2(9.5, 0.5), floor: 0)
        ]
        let edge = IndoorGraphEdge(id: 0, from: 0, to: 1, polyline: [nodes[0].mapPoint, nodes[1].mapPoint], type: .corridor, cost: 1)
        let disconnected = IndoorGraph(nodes: nodes, edges: [edge])
        XCTAssertNil(disconnected.shortestRoute(from: SIMD2(0.5, 0.5), to: SIMD2(9.5, 0.5)))
    }

    func testDistancesMatchRouteCostsWithoutTurnPenalty() throws {
        let graph = openGridGraph(width: 6, height: 6)
        let start = try XCTUnwrap(graph.nearestNode(to: SIMD2(0.5, 0.5)))
        let distances = graph.distances(fromNodeID: start.id)
        XCTAssertEqual(distances.count, 36)
        let far = try XCTUnwrap(graph.nearestNode(to: SIMD2(5.5, 5.5)))
        XCTAssertEqual(distances[far.id] ?? 0, 10, accuracy: 0.001)
        XCTAssertEqual(distances[start.id], 0)
    }

    func testAStarTimingOnDemoSupermarket() throws {
        let layout = try TestLayouts.demoSupermarket(beaconSpacing: nil)
        let graph = TestLayouts.demoGraph(layout: layout)
        let clock = ContinuousClock()
        var found = 0
        let elapsed = clock.measure {
            for index in 0..<50 {
                let start = SIMD2<Float>(Float(2 + index % 30) + 0.5, 8.5)
                if graph.shortestRoute(from: start, to: SIMD2(30.5, 50.5)) != nil { found += 1 }
            }
        }
        XCTAssertEqual(found, 50)
        let millis = Double(elapsed.components.seconds) * 1000 + Double(elapsed.components.attoseconds) / 1e15
        report("routing.astar.ms_per_route", millis / 50)
    }

    // MARK: Helpers

    private func openGridGraph(width: Int, height: Int) -> IndoorGraph {
        IndoorGraphBuilder.fromLayout(gridWidth: width, gridHeight: height, elements: [])
    }

    private func turnCount(of polyline: [SIMD2<Float>]) -> Int {
        var turns = 0
        var last: SIMD2<Float>?
        for index in 1..<max(1, polyline.count) {
            let step = polyline[index] - polyline[index - 1]
            guard simd_length(step) > 0.001 else { continue }
            let normalized = simd_normalize(step)
            if let last, simd_length(normalized - last) > 0.01 { turns += 1 }
            last = normalized
        }
        return turns
    }
}
