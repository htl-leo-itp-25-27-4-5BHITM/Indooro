import XCTest
@testable import IndooroModels

/// Layout- und Produktmodelle gegen die Backend-Fixtures (wie die App sie mit JSONDecoder() liest).
final class LayoutDecodingTests: XCTestCase {

    func testStoreLayoutCurrentDecodesWithSingleEntrance() throws {
        let response = try JSONDecoder().decode(
            MobileLayoutResponse.self,
            from: ModelFixtures.data("store-layout-current.json")
        )

        XCTAssertEqual(response.storeId, UUID(uuidString: "ad61389a-7486-48fa-afa2-9b5e4132f6a8"))
        XCTAssertEqual(response.layout.gridSize.width, 40)
        XCTAssertEqual(response.layout.gridSize.height, 60)
        XCTAssertEqual(response.layout.shopName, "Eurospar Poststraße")
        XCTAssertEqual(response.layout.elements.count, 48)
        XCTAssertEqual(response.layout.elements.filter { $0.type == "entrance" }.count, 1)
        XCTAssertEqual(response.layout.elements.filter(\.isBeacon).count, 3)
    }

    func testLayoutWithRotatedShelfWithoutLabelDecodes() throws {
        let response = try JSONDecoder().decode(
            MobileLayoutResponse.self,
            from: ModelFixtures.data("store-layout-rotated-shelf-no-label.json")
        )

        let rotated = try XCTUnwrap(response.layout.elements.first { $0.id == 1770804675428 })
        XCTAssertEqual(rotated.type, "shelf")
        XCTAssertEqual(rotated.rotation, 45)
        XCTAssertNil(rotated.label)
        XCTAssertEqual(rotated.effectiveMeter, 2)
        XCTAssertTrue(rotated.matchesProductLayoutCode("520/2/1/1"))
        XCTAssertEqual(response.layout.elements.count, 4)
    }

    func testDemoSupermarketLayoutDecodesAllElements() throws {
        let layout = try JSONDecoder().decode(
            LayoutData.self,
            from: ModelFixtures.data("Layouts/layout-demosupermarkt.json")
        )

        XCTAssertEqual(layout.shopName, "SparSupermarkt_Posttrasse")
        XCTAssertEqual(layout.gridSize.width, 40)
        XCTAssertEqual(layout.gridSize.height, 60)
        XCTAssertEqual(layout.elements.count, 55)
        XCTAssertEqual(layout.elements.filter(\.isBeacon).count, 0)
        XCTAssertEqual(layout.elements.filter { $0.type == "shelf" }.count, 48)
    }

    func testBeaconIdentityKeyIsSplitIntoUUIDMajorAndMinor() throws {
        // Alias-Schluessel `identityKey` = "<UUID>:<major>:<minor>"; die UUID wird kleingeschrieben normalisiert.
        let json = """
        {"id":7,"type":"beacon","beaconCode":"B-7","identityKey":"AD61389A-7486-48FA-AFA2-9B5E4132F6A8:7:3","x":1,"y":2}
        """
        let element = try JSONDecoder().decode(LayoutElement.self, from: Data(json.utf8))

        XCTAssertTrue(element.isBeacon)
        XCTAssertEqual(element.beaconId, "B-7")
        XCTAssertEqual(element.beaconUUID, "ad61389a-7486-48fa-afa2-9b5e4132f6a8")
        XCTAssertEqual(element.beaconMajor, 7)
        XCTAssertEqual(element.beaconMinor, 3)
    }

    func testLayoutVersionSummaryDisplayNameFallsBackToLayoutId() throws {
        let json = """
        {"layoutId":"8f14e45fceea167a5a36dedd4bea2543","shopName":"Eurospar","elementCount":48}
        """
        let summary = try JSONDecoder().decode(LayoutVersionSummary.self, from: Data(json.utf8))

        XCTAssertEqual(summary.id, "8f14e45fceea167a5a36dedd4bea2543")
        XCTAssertEqual(summary.displayName, "Version 8f14e45f")
        XCTAssertEqual(summary.detailText, "Eurospar • 48 Elemente")
    }

    // MARK: - Produkte

    func testProductsSearchMilchDecodes() throws {
        let products = try JSONDecoder().decode([Product].self, from: ModelFixtures.data("products-search-milch.json"))

        XCTAssertEqual(products.count, 2)
        XCTAssertEqual(products[0].id, 92)
        XCTAssertEqual(products[0].name, "Naturpur Bio-Milch 1L")
        XCTAssertEqual(products[0].price, 1.79, accuracy: 0.001)
        XCTAssertEqual(products[0].layoutCode, "520/2/1/1")
    }

    func testProductMemberwiseInitMatchesDecodedValue() throws {
        let decoded = try JSONDecoder().decode([Product].self, from: ModelFixtures.data("products-search-milch.json"))
        let built = Product(id: 92, name: "Naturpur Bio-Milch 1L", price: 1.79, layoutCode: "520/2/1/1")

        XCTAssertEqual(decoded[0], built)
    }
}
