import IndooroModels
import XCTest
import simd
@testable import IndooroNavigationCore

final class AnchorLayoutTests: XCTestCase {
    private struct LayoutEnvelope: Decodable {
        let layout: LayoutData
    }

    private func loadAnchorFixture() throws -> LayoutData {
        guard let url = Bundle.module.url(
            forResource: "store-layout-with-anchors",
            withExtension: "json",
            subdirectory: "Resources"
        ) else {
            throw TestLayouts.LoadError.resourceMissing
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(LayoutEnvelope.self, from: data).layout
    }

    private func element(
        id: Int64,
        type: String,
        anchorId: String? = nil,
        x: Double,
        y: Double,
        width: Double? = nil,
        height: Double? = nil
    ) throws -> LayoutElement {
        var json: [String: Any] = ["id": id, "type": type, "x": x, "y": y]
        if let anchorId { json["anchorId"] = anchorId }
        if let width { json["width"] = width }
        if let height { json["height"] = height }
        let data = try JSONSerialization.data(withJSONObject: json)
        return try JSONDecoder().decode(LayoutElement.self, from: data)
    }

    func testFixtureAnchorsAreDecoded() throws {
        let layout = try loadAnchorFixture()
        let anchors = layout.elements.filter(\.isAnchor)

        XCTAssertEqual(layout.shopName, "EUROSPAR Leonding")
        XCTAssertEqual(anchors.compactMap(\.anchorId), ["A12", "A1"])
        XCTAssertEqual(anchors.first?.label, "Gang 4 – Anfang")
        XCTAssertEqual(anchors.first?.x ?? 0, 10.5, accuracy: 0.0001)
        XCTAssertEqual(anchors.first?.y ?? 0, 3, accuracy: 0.0001)
        XCTAssertNil(anchors.first?.category)
        XCTAssertFalse(anchors.contains { $0.isBeacon })
    }

    func testShelvesStillHaveNoAnchorId() throws {
        let layout = try loadAnchorFixture()
        let shelves = layout.elements.filter { $0.type == "shelf" }

        XCTAssertEqual(shelves.count, 2)
        XCTAssertTrue(shelves.allSatisfy { $0.anchorId == nil && !$0.isAnchor })
    }

    func testAnchorDoesNotBlockGraphCell() throws {
        let anchor = try element(id: 1, type: "anchor", anchorId: "A1", x: 5, y: 5)
        let graph = IndoorGraphBuilder.fromLayout(gridWidth: 10, gridHeight: 10, elements: [anchor])

        XCTAssertNotNil(graph.node(id: 5 * 10 + 5))
        XCTAssertEqual(graph.nodes.count, 100)
    }

    func testShelfWithSameGeometryBlocksGraphCellForComparison() throws {
        let shelf = try element(id: 1, type: "shelf", x: 5, y: 5)
        let graph = IndoorGraphBuilder.fromLayout(gridWidth: 10, gridHeight: 10, elements: [shelf])

        XCTAssertNil(graph.node(id: 5 * 10 + 5))
    }

    func testFixtureAnchorsDoNotBlockRoute() throws {
        let layout = try loadAnchorFixture()
        let graph = IndoorGraphBuilder.fromLayout(
            gridWidth: Int(layout.gridSize.width),
            gridHeight: Int(layout.gridSize.height),
            elements: layout.elements
        )

        XCTAssertNotNil(graph.node(id: 3 * 20 + 10))
        XCTAssertNotNil(graph.node(id: 8 * 20 + 1))
        XCTAssertNotNil(graph.shortestRoute(from: SIMD2(1.5, 8.5), to: SIMD2(10.5, 3.5)))
    }

    func testAnchorInsideClosedRingIsNotReportedAsUnreachableShelf() throws {
        // Ring aus Regalen um den Bereich x 4...6, y 4...6; der Anker liegt im Inneren.
        // Ohne Ausnahme fuer Anker wuerde er als nicht erreichbares Regal gemeldet.
        let entrance = try element(id: 1, type: "entrance", x: 0, y: 0)
        let ring = [
            try element(id: 2, type: "shelf", x: 3, y: 3, width: 5, height: 1),
            try element(id: 3, type: "shelf", x: 3, y: 7, width: 5, height: 1),
            try element(id: 4, type: "shelf", x: 3, y: 4, width: 1, height: 3),
            try element(id: 5, type: "shelf", x: 7, y: 4, width: 1, height: 3)
        ]
        let anchor = try element(id: 6, type: "anchor", anchorId: "A5", x: 4, y: 4)
        let elements = [entrance] + ring + [anchor]
        let graph = IndoorGraphBuilder.fromLayout(gridWidth: 20, gridHeight: 12, elements: elements)
        let entrancePoint = try XCTUnwrap(IndoorGraph.entrancePoint(in: elements))

        XCTAssertNil(graph.shortestRoute(from: entrancePoint, to: SIMD2(4.5, 4.5)), "Premisse: Anker liegt eingeschlossen")
        let unreachable = graph.unreachableShelves(in: elements, from: entrancePoint)
        XCTAssertFalse(unreachable.contains { $0.isAnchor })
    }
}
