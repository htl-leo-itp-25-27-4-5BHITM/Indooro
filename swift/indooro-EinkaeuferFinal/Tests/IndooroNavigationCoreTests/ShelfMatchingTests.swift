import IndooroModels
import XCTest
@testable import IndooroNavigationCore

final class ShelfMatchingTests: XCTestCase {
    private func element(id: Int64 = 1, type: String = "shelf", category: String?, meter: Int? = nil) throws -> LayoutElement {
        var json: [String: Any] = ["id": id, "type": type, "x": 0, "y": 0, "width": 3, "height": 5]
        if let category { json["category"] = category }
        if let meter { json["meter"] = meter }
        let data = try JSONSerialization.data(withJSONObject: json)
        return try JSONDecoder().decode(LayoutElement.self, from: data)
    }

    func testProductWithMeterResolvesToMatchingMeterElement() throws {
        let shelves = [
            try element(id: 1, category: "520/1"),
            try element(id: 2, category: "520/2")
        ]
        let match = shelves.first { $0.matchesProductLayoutCode("520/2/3/1") }
        XCTAssertEqual(match?.id, 2)
    }

    func testCategoryPrefixDoesNotMatch() throws {
        let shelf = try element(category: "310")
        XCTAssertFalse(shelf.matchesProductLayoutCode("31/1/1/1"))
        let withMeter = try element(category: "310/1")
        XCTAssertFalse(withMeter.matchesProductLayoutCode("31/1/1/1"))
    }

    func testElementWithoutMeterMatchesAnyMeter() throws {
        let shelf = try element(category: "310")
        XCTAssertTrue(shelf.matchesProductLayoutCode("310/1/1/1"))
        XCTAssertTrue(shelf.matchesProductLayoutCode("310/7/1/1"))
    }

    func testLayoutCodeWithOneSegmentDoesNotResolve() throws {
        let shelf = try element(category: "310")
        XCTAssertFalse(shelf.matchesProductLayoutCode("310"))
        let withMeter = try element(category: "310/1")
        XCTAssertFalse(withMeter.matchesProductLayoutCode("310"))
    }

    func testNonNumericMeterDoesNotResolve() throws {
        let shelf = try element(category: "310/1")
        XCTAssertFalse(shelf.matchesProductLayoutCode("310/x/1/1"))
        XCTAssertFalse(shelf.matchesProductLayoutCode("310//1/1"))
    }

    func testMeterMismatchDoesNotResolve() throws {
        let shelf = try element(category: "520/1")
        XCTAssertFalse(shelf.matchesProductLayoutCode("520/2/3/1"))
    }

    func testDemoLayoutResolvesRealShelfAndRejectsPrefix() throws {
        let layout = try TestLayouts.demoSupermarket(beaconSpacing: nil)
        let shelves = layout.elements.filter { !$0.isBeacon }
        let match = shelves.first { $0.matchesProductLayoutCode("520/2/3/1") }
        XCTAssertEqual(match?.category, "520/2")
        XCTAssertNil(shelves.first { $0.matchesProductLayoutCode("31/1/1/1") })
    }
}
