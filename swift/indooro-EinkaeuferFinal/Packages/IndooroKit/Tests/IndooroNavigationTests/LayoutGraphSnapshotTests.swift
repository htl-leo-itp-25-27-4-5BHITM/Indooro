import IndooroModels
import XCTest
import simd
@testable import IndooroNavigation

/// Task 5.5: `LayoutGraphSnapshot` umhuellt den einmal je Revision gebauten Graphen unveraendert.
final class LayoutGraphSnapshotTests: XCTestCase {
    func testSnapshotFromLayoutCarriesRevisionGridAndEntrance() throws {
        let layout = try TestLayouts.demoSupermarket(beaconSpacing: nil)
        let snapshot = LayoutGraphSnapshot(revision: 7, layout: layout)

        XCTAssertEqual(snapshot.revision, 7)
        XCTAssertEqual(snapshot.gridWidth, 40)
        XCTAssertEqual(snapshot.gridHeight, 60)
        XCTAssertEqual(snapshot.bounds, CGRect(x: 0, y: 0, width: 40, height: 60))
        XCTAssertEqual(snapshot.entrance, IndoorGraph.entrancePoint(in: layout.elements))
    }

    func testSnapshotGraphEqualsDirectBuilderResult() throws {
        let layout = try TestLayouts.demoSupermarket(beaconSpacing: nil)
        let snapshot = LayoutGraphSnapshot(revision: 1, layout: layout)
        let direct = TestLayouts.demoGraph(layout: layout)

        XCTAssertEqual(snapshot.graph.nodes.count, direct.nodes.count)
        XCTAssertEqual(snapshot.graph.edges.count, direct.edges.count)
        let start = SIMD2<Float>(5.5, 8.5)
        let end = SIMD2<Float>(30.5, 50.5)
        let viaSnapshot = try XCTUnwrap(snapshot.graph.shortestRoute(from: start, to: end))
        let viaBuilder = try XCTUnwrap(direct.shortestRoute(from: start, to: end))
        XCTAssertEqual(viaSnapshot.totalCost, viaBuilder.totalCost, accuracy: 0.0001)
        XCTAssertEqual(viaSnapshot.polyline, viaBuilder.polyline)
    }

    func testSnapshotWrapsExistingGraphWithoutRebuilding() {
        let graph = IndoorGraphBuilder.fromLayout(gridWidth: 10, gridHeight: 10, elements: [])
        let snapshot = LayoutGraphSnapshot(revision: 3, graph: graph, gridWidth: 10, gridHeight: 10, entrance: nil)
        XCTAssertTrue(snapshot.graph === graph)
        XCTAssertNil(snapshot.entrance)
    }

    func testSnapshotIsReadableFromConcurrentTasksWithIdenticalResults() async throws {
        let layout = try TestLayouts.demoSupermarket(beaconSpacing: nil)
        let snapshot = LayoutGraphSnapshot(revision: 1, layout: layout)
        let start = SIMD2<Float>(5.5, 8.5)
        let end = SIMD2<Float>(30.5, 50.5)
        let expected = try XCTUnwrap(snapshot.graph.shortestRoute(from: start, to: end)).totalCost

        let costs = await withTaskGroup(of: Float?.self) { group in
            for _ in 0..<8 {
                group.addTask { snapshot.graph.shortestRoute(from: start, to: end)?.totalCost }
            }
            var all: [Float?] = []
            for await cost in group { all.append(cost) }
            return all
        }
        XCTAssertEqual(costs.count, 8)
        for cost in costs {
            XCTAssertEqual(try XCTUnwrap(cost), expected, accuracy: 0.0001)
        }
    }
}
