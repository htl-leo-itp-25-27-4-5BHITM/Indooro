import XCTest
@testable import IndooroNavigationCore

final class ShelfLocationDescriptorTests: XCTestCase {
    private func shelf(id: Int64 = 1, category: String, label: String? = nil) throws -> LayoutElement {
        var json: [String: Any] = ["id": id, "type": "shelf", "x": 0, "y": 0, "width": 3, "height": 1, "category": category]
        if let label { json["label"] = label }
        let data = try JSONSerialization.data(withJSONObject: json)
        return try JSONDecoder().decode(LayoutElement.self, from: data)
    }

    func testLabeledShelfShowsLabelAndPosition() throws {
        let shelves = [try shelf(category: "800/1", label: "Gang 4 · links · Backzutaten")]
        let descriptor = ShelfLocationDescriptor.make(layoutCode: "800/1/3/2", shelves: shelves)
        XCTAssertEqual(descriptor?.primary, "Gang 4 · links · Backzutaten")
        XCTAssertEqual(descriptor?.detail, "3. Boden von unten · Position 2")
        XCTAssertFalse(descriptor?.primary.contains("800") ?? true)
        XCTAssertFalse(descriptor?.detail?.contains("800") ?? true)
        XCTAssertEqual(descriptor?.debugCode, "800/1/3/2")
    }

    func testShelfWithoutLabelFallsBackToMeter() throws {
        let shelves = [try shelf(category: "310/2")]
        let descriptor = ShelfLocationDescriptor.make(layoutCode: "310/2/1/1", shelves: shelves)
        XCTAssertEqual(descriptor?.primary, "Regal 2")
        XCTAssertEqual(descriptor?.detail, "1. Boden von unten · Position 1")
    }

    func testNonNumericFachOrReiheHasNoDetail() throws {
        let shelves = [try shelf(category: "310/2")]
        let nonNumericFach = ShelfLocationDescriptor.make(layoutCode: "310/2/oben/1", shelves: shelves)
        XCTAssertEqual(nonNumericFach?.primary, "Regal 2")
        XCTAssertNil(nonNumericFach?.detail)

        let nonNumericReihe = ShelfLocationDescriptor.make(layoutCode: "310/2/1/x", shelves: shelves)
        XCTAssertNil(nonNumericReihe?.detail)
    }

    func testDefectiveLayoutCodeReturnsNil() throws {
        let shelf = try shelf(category: "310")
        XCTAssertNil(ShelfLocationDescriptor.make(layoutCode: "abc", shelf: shelf))
        XCTAssertNil(ShelfLocationDescriptor.make(layoutCode: "310", shelf: shelf))
        XCTAssertNil(ShelfLocationDescriptor.make(layoutCode: "abc", shelves: [shelf]))
        XCTAssertNil(ShelfLocationDescriptor.make(layoutCode: "310", shelves: [shelf]))
    }

    func testNoMatchingShelfReturnsNil() throws {
        let shelves = [try shelf(category: "520/1", label: "Gang 5")]
        XCTAssertNil(ShelfLocationDescriptor.make(layoutCode: "310/1/1/1", shelves: shelves))
        XCTAssertNil(ShelfLocationDescriptor.make(layoutCode: "310/1/1/1", shelf: nil))
        XCTAssertNil(ShelfLocationDescriptor.make(layoutCode: "310/1/1/1", shelves: []))
    }

    func testWhitespaceOnlyLabelFallsBackToMeter() throws {
        let shelves = [try shelf(category: "310/2", label: "   ")]
        let descriptor = ShelfLocationDescriptor.make(layoutCode: "310/2/1/1", shelves: shelves)
        XCTAssertEqual(descriptor?.primary, "Regal 2")
    }

    func testCategoryPrefixCollisionDoesNotMatch() throws {
        let shelves = [try shelf(category: "310/1", label: "Gang 3")]
        XCTAssertNil(ShelfLocationDescriptor.make(layoutCode: "31/1/3/2", shelves: shelves))
        let matching = ShelfLocationDescriptor.make(layoutCode: "310/1/3/2", shelves: shelves)
        XCTAssertEqual(matching?.primary, "Gang 3")
    }
}
