import Foundation
import XCTest
import IndooroNetworking

/// Prueft, dass die aus `api/openapi/indooro-mobile.yaml` generierten Typen die Fixtures aus
/// `SP/Fixtures` vollstaendig dekodieren. Fixtures muessen dem Vertrag entsprechen; es gibt
/// keine dokumentierten Abweichungen.
final class GeneratedContractDecodingTests: XCTestCase {
    /// Gleiche Datumsstrategie wie `JSONDecoder.indooro` in `indooroApp/Utilities/PilotNetworking.swift`.
    /// Die App-Extension ist nicht Teil dieses Pakets, daher hier gespiegelt.
    private var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { value in
            let text = try value.singleValueContainer().decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: text) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: text) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: value.codingPath, debugDescription: "Ungueltiges Datum"))
        }
        return decoder
    }

    /// `SP/Fixtures` liegt drei Ebenen ueber `Packages/IndooroKit`.
    private func fixtureData(_ name: String) throws -> Data {
        let fixtures = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // IndooroNetworkingTests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // IndooroKit
            .deletingLastPathComponent() // Packages
            .deletingLastPathComponent() // indooro-EinkaeuferFinal
            .appendingPathComponent("Fixtures")
        return try Data(contentsOf: fixtures.appendingPathComponent(name))
    }

    // MARK: - Stores

    func testStoresFixtureDecodesAsMobileStoreSummaries() throws {
        let stores = try decoder.decode([Components.Schemas.MobileStoreSummary].self, from: fixtureData("stores.json"))

        XCTAssertEqual(stores.count, 4)
        XCTAssertEqual(stores.first?.storeCode, "SPAR-Leonding-001")
        XCTAssertEqual(stores.first?.city, "Leonding")
        XCTAssertEqual(stores.first?.latitude ?? 0, 48.2680495, accuracy: 1e-7)
    }

    // MARK: - Layout

    /// Das Fixture dekodiert unveraendert vollstaendig gegen den Vertrag.
    func testStoreLayoutFixtureDecodesCompletely() throws {
        let response = try decoder.decode(Components.Schemas.MobileLayoutResponse.self, from: fixtureData("store-layout-current.json"))

        XCTAssertEqual(response.storeId, "ad61389a-7486-48fa-afa2-9b5e4132f6a8")
        XCTAssertEqual(response.source, .ACTIVE)
        XCTAssertFalse(response.fallback)
        XCTAssertEqual(response.layout.elements?.count, 48)
    }

    /// `LayoutElement.id` ist `integer (int64)`, `meter` ist `integer | null`. Die Werte werden
    /// gegen die Rohwerte aus dem JSON geprueft.
    func testStoreLayoutElementIdAndMeterAreIntegers() throws {
        let data = try fixtureData("store-layout-current.json")
        let response = try decoder.decode(Components.Schemas.MobileLayoutResponse.self, from: data)
        let elements = try XCTUnwrap(response.layout.elements)

        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let layout = try XCTUnwrap(root["layout"] as? [String: Any])
        let rawElements = try XCTUnwrap(layout["elements"] as? [[String: Any]])
        XCTAssertEqual(elements.count, rawElements.count)

        let expectedFirstID = try XCTUnwrap((rawElements.first?["id"] as? NSNumber)?.int64Value)
        XCTAssertEqual(try XCTUnwrap(elements.first?.id), expectedFirstID)

        for (element, raw) in zip(elements, rawElements) {
            XCTAssertEqual(element.id, (raw["id"] as? NSNumber)?.int64Value)
            XCTAssertEqual(element.meter, (raw["meter"] as? NSNumber)?.intValue)
        }

        let withMeter = try XCTUnwrap(zip(elements, rawElements).first { $0.0.meter != nil })
        let expectedMeter = try XCTUnwrap((withMeter.1["meter"] as? NSNumber)?.intValue)
        XCTAssertEqual(withMeter.0.meter, expectedMeter)
    }

    /// Veroeffentlichter Layout-Vertrag: Eine Element-ID als String ist kein gueltiger Wert mehr.
    func testElementWithStringIdIsRejected() throws {
        var root = try XCTUnwrap(JSONSerialization.jsonObject(with: try fixtureData("store-layout-current.json")) as? [String: Any])
        var layout = try XCTUnwrap(root["layout"] as? [String: Any])
        var elements = try XCTUnwrap(layout["elements"] as? [[String: Any]])
        elements[0]["id"] = "legacy-1"
        layout["elements"] = elements
        root["layout"] = layout
        let data = try JSONSerialization.data(withJSONObject: root)

        XCTAssertThrowsError(try decoder.decode(Components.Schemas.MobileLayoutResponse.self, from: data)) { error in
            XCTAssertTrue(error is DecodingError, "Erwartet DecodingError, erhalten: \(error)")
        }
    }

    // MARK: - Products

    func testProductSearchFixtureDecodesAsProducts() throws {
        let products = try decoder.decode([Components.Schemas.Product].self, from: fixtureData("products-search-milch.json"))

        XCTAssertEqual(products.map(\.id), [92, 93])
        XCTAssertEqual(products.first?.name, "Naturpur Bio-Milch 1L")
        XCTAssertEqual(products.first?.price, 1.79)
        XCTAssertNil(products.first?.storeId)
    }

    // MARK: - Upsell

    func testUpsellPlanFixtureDecodesWithDates() throws {
        let plan = try decoder.decode(Components.Schemas.UpsellPlanResponse.self, from: fixtureData("upsell-plan.json"))

        XCTAssertEqual(plan.opportunities?.count, 1)
        XCTAssertEqual(plan.opportunities?.first?.suggestions?.count, 2)
        XCTAssertEqual(plan.opportunities?.first?.suggestions?.first?.product?.id, 93)
        XCTAssertEqual(plan.source?.rawValue, "openai")
        XCTAssertNotNil(plan.expiresAt)
    }

    // MARK: - Recipes

    func testRecipesFixtureDecodesPageWithPublishedDates() throws {
        let page = try decoder.decode(Components.Schemas.RecipeSummaryPage.self, from: fixtureData("recipes.json"))

        XCTAssertEqual(page.content.count, 20)
        XCTAssertEqual(page.page, 0)
        XCTAssertEqual(page.size, 20)
        XCTAssertEqual(page.totalElements, 26)
        XCTAssertEqual(page.content.first?.status?.rawValue, "PUBLISHED")
        XCTAssertNotNil(page.content.first?.publishedAt)
    }
}
