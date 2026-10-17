import XCTest
@testable import IndooroNavigationCore

final class RotatedShelfTests: XCTestCase {
    private func blocked(x: Double, y: Double, width: Double, height: Double, rotation: Double, grid: Int = 10) -> Set<GridPoint> {
        RotatedRectGeometry.blockedCells(
            x: x,
            y: y,
            width: width,
            height: height,
            rotationDegrees: rotation,
            gridWidth: grid,
            gridHeight: grid
        )
    }

    func testZeroDegreesCoversSameCellsAsAxisAlignedRule() {
        let cells = blocked(x: 2, y: 2, width: 3, height: 1, rotation: 0)
        XCTAssertEqual(cells, [GridPoint(x: 2, y: 2), GridPoint(x: 3, y: 2), GridPoint(x: 4, y: 2)])
    }

    func testNinetyDegreesTurnsShelfVertically() {
        // Mittelpunkt (3.5, 2.5) -> vertikal: x in [3, 4], y in [1, 4]
        let cells = blocked(x: 2, y: 2, width: 3, height: 1, rotation: 90)
        XCTAssertEqual(cells, [GridPoint(x: 3, y: 1), GridPoint(x: 3, y: 2), GridPoint(x: 3, y: 3)])
    }

    func testTwoSeventyDegreesMatchesNinety() {
        let ninety = blocked(x: 2, y: 2, width: 3, height: 1, rotation: 90)
        let twoSeventy = blocked(x: 2, y: 2, width: 3, height: 1, rotation: 270)
        XCTAssertEqual(twoSeventy, ninety)
    }

    func testOneEightyDegreesMatchesZero() {
        let zero = blocked(x: 2, y: 2, width: 3, height: 1, rotation: 0)
        let oneEighty = blocked(x: 2, y: 2, width: 3, height: 1, rotation: 180)
        XCTAssertEqual(oneEighty, zero)
    }

    func testFullTurnMatchesZero() {
        let zero = blocked(x: 2, y: 2, width: 3, height: 1, rotation: 0)
        let fullTurn = blocked(x: 2, y: 2, width: 3, height: 1, rotation: 360)
        XCTAssertEqual(fullTurn, zero)
    }

    func testFortyFiveDegreesBlocksDiagonalRun() {
        let cells = blocked(x: 2, y: 2, width: 4, height: 1, rotation: 45)
        XCTAssertGreaterThanOrEqual(cells.count, 4)

        // Keine Zelle darf weit ausserhalb der Boundingbox des gedrehten Rechtecks liegen.
        let corners = RotatedRectGeometry.corners(x: 2, y: 2, width: 4, height: 1, rotationDegrees: 45)
        let minX = corners.map(\.x).min() ?? 0
        let maxX = corners.map(\.x).max() ?? 0
        let minY = corners.map(\.y).min() ?? 0
        let maxY = corners.map(\.y).max() ?? 0
        for cell in cells {
            XCTAssertGreaterThanOrEqual(Double(cell.x), minX - 1)
            XCTAssertLessThanOrEqual(Double(cell.x), maxX)
            XCTAssertGreaterThanOrEqual(Double(cell.y), minY - 1)
            XCTAssertLessThanOrEqual(Double(cell.y), maxY)
        }

        // Diagonal: mehrere Spalten und mehrere Zeilen.
        XCTAssertGreaterThan(Set(cells.map(\.x)).count, 2)
        XCTAssertGreaterThan(Set(cells.map(\.y)).count, 2)
    }

    func testEdgeTouchingDoesNotBlockNeighbour() {
        // 1x1 bei 90 Grad bleibt im Einheitsquadrat (0,0); Nachbarzelle (1,0) wird nur an der Kante beruehrt.
        let cells = blocked(x: 0, y: 0, width: 1, height: 1, rotation: 90)
        XCTAssertEqual(cells, [GridPoint(x: 0, y: 0)])
    }

    func testCellsOutsideGridAreDiscarded() {
        // Vertikal bei x in [1, 2], y in [-1, 2]: der Teil y < 0 faellt weg.
        let cells = blocked(x: 0, y: 0, width: 3, height: 1, rotation: 90)
        XCTAssertEqual(cells, [GridPoint(x: 1, y: 0), GridPoint(x: 1, y: 1)])

        let outside = blocked(x: 20, y: 20, width: 3, height: 1, rotation: 45)
        XCTAssertTrue(outside.isEmpty)
    }

    func testRotatedShelfInFromLayoutRemovesNodeAtRotatedCellOnly() throws {
        let json: [String: Any] = [
            "id": 1,
            "type": "shelf",
            "x": 2,
            "y": 2,
            "width": 3,
            "height": 1,
            "rotation": 90
        ]
        let data = try JSONSerialization.data(withJSONObject: json)
        let shelf = try JSONDecoder().decode(LayoutElement.self, from: data)

        let graph = IndoorGraphBuilder.fromLayout(gridWidth: 10, gridHeight: 10, elements: [shelf])
        let gridWidth = 10

        // Gedrehte Zelle (3, 2) ist blockiert, die alten Enden (2, 2) und (4, 2) sind frei.
        XCTAssertNil(graph.node(id: 2 * gridWidth + 3))
        XCTAssertNotNil(graph.node(id: 2 * gridWidth + 2))
        XCTAssertNotNil(graph.node(id: 2 * gridWidth + 4))
    }
}
