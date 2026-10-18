import IndooroModels
import XCTest
import simd
@testable import IndooroNavigationCore

final class UnreachableShelfTests: XCTestCase {
    private func element(
        id: Int64,
        type: String,
        x: Double,
        y: Double,
        width: Double? = nil,
        height: Double? = nil
    ) throws -> LayoutElement {
        var json: [String: Any] = ["id": id, "type": type, "x": x, "y": y]
        if let width { json["width"] = width }
        if let height { json["height"] = height }
        let data = try JSONSerialization.data(withJSONObject: json)
        return try JSONDecoder().decode(LayoutElement.self, from: data)
    }

    func testOpenLayoutWithoutObstaclesReportsNothing() throws {
        let entrance = try element(id: 1, type: "entrance", x: 0, y: 0)
        let beacon = try element(id: 2, type: "beacon", x: 20, y: 15)
        let graph = IndoorGraphBuilder.fromLayout(gridWidth: 40, gridHeight: 30, elements: [entrance, beacon])
        let entrancePoint = try XCTUnwrap(IndoorGraph.entrancePoint(in: [entrance]))

        XCTAssertTrue(graph.unreachableShelves(in: [entrance, beacon], from: entrancePoint).isEmpty)
    }

    func testFreeStandingShelfInOpenLayoutIsReachable() throws {
        let entrance = try element(id: 1, type: "entrance", x: 0, y: 0)
        let shelf = try element(id: 3, type: "shelf", x: 20, y: 20, width: 3, height: 1)
        let elements = [entrance, shelf]
        let graph = IndoorGraphBuilder.fromLayout(gridWidth: 40, gridHeight: 30, elements: elements)
        let entrancePoint = try XCTUnwrap(IndoorGraph.entrancePoint(in: elements))

        XCTAssertTrue(graph.unreachableShelves(in: elements, from: entrancePoint).isEmpty)
    }

    func testShelfInsideClosedRingOfShelvesIsReported() throws {
        // Ring aus 1x1-Regalen um das Quadrat (10...14, 10...14); Innenregal in (12, 12).
        // Der Eingang liegt ausserhalb des Rings. Die acht freien Innenzellen sind nicht erreichbar.
        let entrance = try element(id: 1, type: "entrance", x: 0, y: 0)
        var ring: [LayoutElement] = []
        var nextID: Int64 = 100
        for x in 10...14 {
            for y in 10...14 where x == 10 || x == 14 || y == 10 || y == 14 {
                ring.append(try element(id: nextID, type: "shelf", x: Double(x), y: Double(y), width: 1, height: 1))
                nextID += 1
            }
        }
        let inner = try element(id: 50, type: "shelf", x: 12, y: 12, width: 1, height: 1)
        let control = try element(id: 60, type: "shelf", x: 20, y: 20, width: 3, height: 1)
        let elements = [entrance] + ring + [inner, control]

        let graph = IndoorGraphBuilder.fromLayout(gridWidth: 40, gridHeight: 30, elements: elements)
        let entrancePoint = try XCTUnwrap(IndoorGraph.entrancePoint(in: elements))
        let reported = graph.unreachableShelves(in: elements, from: entrancePoint)
        let reportedIDs = Set(reported.map(\.id))

        XCTAssertTrue(reportedIDs.contains(50), "Innenregal muss als unerreichbar gemeldet werden")
        XCTAssertFalse(reportedIDs.contains(60), "Freistehendes Regal ist erreichbar")
        XCTAssertFalse(reportedIDs.contains(1), "Eingang wird nie gemeldet")
        // Ring-Regale liegen auf der Grenze; ihr naechster freier Knoten kann innen oder aussen liegen.
        XCTAssertTrue(reportedIDs.isSubset(of: Set(ring.map(\.id)).union([50])))
    }

    func testBeaconsAreNeverReported() throws {
        // Beacon mitten in einem geschlossenen Ring: wird trotzdem nicht gemeldet.
        let entrance = try element(id: 1, type: "entrance", x: 0, y: 0)
        let beacon = try element(id: 2, type: "beacon", x: 12, y: 12)
        var ring: [LayoutElement] = []
        var nextID: Int64 = 100
        for x in 10...14 {
            for y in 10...14 where x == 10 || x == 14 || y == 10 || y == 14 {
                ring.append(try element(id: nextID, type: "shelf", x: Double(x), y: Double(y), width: 1, height: 1))
                nextID += 1
            }
        }
        let elements = [entrance, beacon] + ring
        let graph = IndoorGraphBuilder.fromLayout(gridWidth: 40, gridHeight: 30, elements: elements)
        let entrancePoint = try XCTUnwrap(IndoorGraph.entrancePoint(in: elements))

        let reportedIDs = Set(graph.unreachableShelves(in: elements, from: entrancePoint).map(\.id))
        XCTAssertFalse(reportedIDs.contains(2))
    }
}
