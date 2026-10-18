import Foundation
import XCTest
import IndooroNetworking

/// Prueft, dass die aus `api/openapi/indooro-mobile.yaml` generierten Typen die Fixtures aus
/// `SP/Fixtures` dekodieren. Abweichungen zwischen Fixture und Vertrag werden hier als
/// erwartete Dekodierfehler festgehalten, der Vertrag selbst wird nicht veraendert.
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

    /// Dokumentierte Abweichung 1: Der Vertrag typisiert `LayoutElement.id` als `[string, integer]`
    /// (Entwuerfe duerfen Strings behalten), der Generator erzeugt `String?`. Das Fixture liefert
    /// ganzzahlige IDs, daher schlaegt das Dekodieren am Feld `id` fehl.
    func testStoreLayoutFixtureFailsOnIntegerElementIDsDocumentedMismatch() throws {
        try assertTypeMismatch(on: "id", in: try fixtureData("store-layout-current.json"))
    }

    /// Dokumentierte Abweichung 2: `LayoutElement.meter` ist ebenfalls `[string, integer]`, das Fixture
    /// liefert eine Zahl. Nach dem Entfernen der IDs schlaegt das Dekodieren am Feld `meter` fehl.
    func testStoreLayoutFixtureFailsOnIntegerMeterDocumentedMismatch() throws {
        let stripped = try layoutFixture(removingElementKeys: ["id"])
        try assertTypeMismatch(on: "meter", in: stripped)
    }

    /// Die uebrigen Felder des Layouts entsprechen dem Vertrag: Ohne die beiden dokumentierten
    /// Abweichungen dekodiert das Fixture vollstaendig.
    func testStoreLayoutFixtureDecodesOnceDocumentedMismatchesAreRemoved() throws {
        let stripped = try layoutFixture(removingElementKeys: ["id", "meter"])

        let response = try decoder.decode(Components.Schemas.MobileLayoutResponse.self, from: stripped)

        XCTAssertEqual(response.storeId, "ad61389a-7486-48fa-afa2-9b5e4132f6a8")
        XCTAssertEqual(response.source, .ACTIVE)
        XCTAssertFalse(response.fallback)
        XCTAssertEqual(response.layout.elements?.count, 48)
    }

    private func layoutFixture(removingElementKeys keys: [String]) throws -> Data {
        var root = try XCTUnwrap(JSONSerialization.jsonObject(with: try fixtureData("store-layout-current.json")) as? [String: Any])
        var layout = try XCTUnwrap(root["layout"] as? [String: Any])
        let elements = try XCTUnwrap(layout["elements"] as? [[String: Any]])
        layout["elements"] = elements.map { element in
            var copy = element
            keys.forEach { copy.removeValue(forKey: $0) }
            return copy
        }
        root["layout"] = layout
        return try JSONSerialization.data(withJSONObject: root)
    }

    private func assertTypeMismatch(on field: String, in data: Data, file: StaticString = #filePath, line: UInt = #line) throws {
        XCTAssertThrowsError(try decoder.decode(Components.Schemas.MobileLayoutResponse.self, from: data), file: file, line: line) { error in
            guard case DecodingError.typeMismatch(_, let context) = error else {
                return XCTFail("Erwartet typeMismatch, erhalten: \(error)", file: file, line: line)
            }
            XCTAssertEqual(context.codingPath.last?.stringValue, field, "codingPath: \(context.codingPath.map(\.stringValue))", file: file, line: line)
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
