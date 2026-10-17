import XCTest
@testable import IndooroNavigationCore

/// Lädt anonymisierte Live-Antworten bzw. handgemachte Fixtures aus `Fixtures/`.
/// Der Pfad ist relativ zu dieser Datei: Tests/IndooroNavigationCoreTests/<Datei> -> Paketwurzel.
enum ContractFixtures {
    static let directory: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent() // IndooroNavigationCoreTests
        .deletingLastPathComponent() // Tests
        .deletingLastPathComponent() // swift/indooro-EinkaeuferFinal
        .appendingPathComponent("Fixtures", isDirectory: true)

    static func data(_ name: String) throws -> Data {
        try Data(contentsOf: directory.appendingPathComponent(name))
    }
}

/// Prüft, dass die Backend-Antworten mit den Modellen dekodieren, so wie es die App-Stores tun
/// (JSONDecoder() ohne Strategie, außer UpsellSuggestionStore: dateDecodingStrategy = .iso8601).
final class ContractDecodingTests: XCTestCase {

    // MARK: - Stores

    func testStoresDecodeToFourSummaries() throws {
        let stores = try JSONDecoder().decode([MobileStoreSummary].self, from: ContractFixtures.data("stores.json"))

        XCTAssertEqual(stores.count, 4)

        let first = try XCTUnwrap(stores.first)
        XCTAssertEqual(first.id, UUID(uuidString: "ad61389a-7486-48fa-afa2-9b5e4132f6a8"))
        XCTAssertEqual(first.storeCode, "SPAR-Leonding-001")
        XCTAssertEqual(first.name, "EUROSPAR Leonding/Hart")
        XCTAssertEqual(first.city, "Leonding")
        XCTAssertEqual(try XCTUnwrap(first.latitude), 48.2680495, accuracy: 1e-7)
        XCTAssertEqual(try XCTUnwrap(first.longitude), 14.2618747, accuracy: 1e-7)

        // Defekt (siehe Bericht): stores.json liefert "address" als einen String, MobileStoreSummary
        // kennt nur street/zipCode/country. Die Adresse geht deshalb verloren; das Test-Verhalten
        // hält den aktuellen Stand fest.
        XCTAssertNil(first.street)
        XCTAssertNil(first.zipCode)
        XCTAssertEqual(first.displaySubtitle, "Leonding")
    }

    // MARK: - Layout

    func testStoreLayoutCurrentDecodesWithSingleEntrance() throws {
        let response = try JSONDecoder().decode(
            MobileLayoutResponse.self,
            from: ContractFixtures.data("store-layout-current.json")
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
            from: ContractFixtures.data("store-layout-rotated-shelf-no-label.json")
        )

        let rotated = try XCTUnwrap(response.layout.elements.first { $0.id == 1770804675428 })
        XCTAssertEqual(rotated.type, "shelf")
        XCTAssertEqual(rotated.rotation, 45)
        XCTAssertNil(rotated.label)
        XCTAssertEqual(rotated.effectiveMeter, 2)
        XCTAssertTrue(rotated.matchesProductLayoutCode("520/2/1/1"))
        XCTAssertEqual(response.layout.elements.count, 4)
    }

    // MARK: - Produkte

    func testProductsSearchMilchDecodes() throws {
        let products = try JSONDecoder().decode([Product].self, from: ContractFixtures.data("products-search-milch.json"))

        XCTAssertEqual(products.count, 2)
        XCTAssertEqual(products[0].id, 92)
        XCTAssertEqual(products[0].name, "Naturpur Bio-Milch 1L")
        XCTAssertEqual(products[0].price, 1.79, accuracy: 0.001)
        XCTAssertEqual(products[0].layoutCode, "520/2/1/1")
    }

    func testProductListWithOneMalformedElementFailsAsWhole() throws {
        // Reales Verhalten: ProductSearchStore.decodeProducts dekodiert die Liste nicht lossy.
        // Fehlt in einem Element ein Pflichtfeld (hier layoutCode), schlägt die gesamte Dekodierung
        // fehl; der Fallback über ProductCollectionResponse scheitert ebenfalls, und die Suche
        // zeigt leere Ergebnisse. Siehe Bericht (Defekt-Kandidat).
        let data = try ContractFixtures.data("products-search-one-malformed.json")

        XCTAssertThrowsError(try JSONDecoder().decode([Product].self, from: data))
    }

    // MARK: - Rezepte

    func testRecipesPageDecodesContent() throws {
        let data = try ContractFixtures.data("recipes.json")

        // Die App probiert zuerst ein nacktes Array und fällt dann auf die Seiten-Form zurück.
        XCTAssertThrowsError(try JSONDecoder().decode([RecipeSummary].self, from: data))

        let page = try JSONDecoder().decode(RecipePageResponse<RecipeSummary>.self, from: data)

        XCTAssertEqual(page.page, 0)
        XCTAssertEqual(page.size, 20)
        XCTAssertEqual(page.totalElements, 26)
        XCTAssertEqual(page.content.count, 20)

        let first = try XCTUnwrap(page.content.first)
        XCTAssertEqual(first.id, UUID(uuidString: "00000000-0000-0000-0000-000000000119"))
        XCTAssertEqual(first.slug, "apfel-hafer-crumble")
        XCTAssertEqual(first.displayTitle, "Apfel-Hafer-Crumble")
        XCTAssertEqual(first.servings, 4)
        XCTAssertEqual(first.totalTimeMinutes, 37)
        XCTAssertEqual(first.mappedIngredientCount, 3)
        XCTAssertEqual(first.totalIngredientCount, 3)
        XCTAssertEqual(first.tags.first?.code, "family")
    }

    func testRecipeDetailDecodes() throws {
        let detail = try JSONDecoder().decode(RecipeDetail.self, from: ContractFixtures.data("recipe-detail.json"))

        XCTAssertEqual(detail.id, UUID(uuidString: "00000000-0000-0000-0000-000000000119"))
        XCTAssertEqual(detail.title, "Apfel-Hafer-Crumble")
        XCTAssertEqual(detail.servings, 4)
        XCTAssertNil(detail.archivedAt)

        XCTAssertEqual(detail.ingredients.map(\.position), [1, 2, 3])
        XCTAssertEqual(detail.ingredients[0].displayName, "Äpfel")
        XCTAssertEqual(detail.ingredients[0].quantity, 4)
        XCTAssertEqual(detail.ingredients[0].unitCode, "piece")
        XCTAssertNil(detail.ingredients[0].displayUnitForList) // "piece" wird in der Liste nicht angezeigt
        XCTAssertEqual(detail.ingredients[0].amountText, "4")
        XCTAssertFalse(detail.ingredients[1].optional)

        XCTAssertEqual(detail.steps.map(\.position), [1, 2, 3])
        XCTAssertEqual(detail.steps.map(\.durationMinutes), [5, 15, 3])
        XCTAssertEqual(detail.steps.count, 3)
    }

    func testRecipeProductMappingDecodes() throws {
        let mapping = try JSONDecoder().decode(
            RecipeProductMappingResponse.self,
            from: ContractFixtures.data("recipe-product-mapping.json")
        )

        XCTAssertEqual(mapping.recipeId, UUID(uuidString: "00000000-0000-0000-0000-000000000119"))
        XCTAssertEqual(mapping.storeId, UUID(uuidString: "ad61389a-7486-48fa-afa2-9b5e4132f6a8"))
        XCTAssertNil(mapping.storeCode)
        XCTAssertEqual(mapping.ingredients.count, 3)
        XCTAssertTrue(mapping.ingredients.allSatisfy { $0.status == .mapped })

        let apples = try XCTUnwrap(mapping.ingredients.first)
        XCTAssertEqual(apples.ingredientName, "Äpfel")
        XCTAssertEqual(apples.confidence, 0.85)
        XCTAssertTrue(apples.manuallyConfirmed)
        XCTAssertNil(apples.reason)
        XCTAssertEqual(apples.product?.id, 1)
        XCTAssertEqual(apples.product?.product?.layoutCode, "310/1/1/1")
        XCTAssertEqual(apples.product?.product?.price, 2.99)
    }

    // MARK: - Upsell

    func testUpsellPlanDecodesWithISO8601ExpiresAt() throws {
        // Dekodierung wie UpsellSuggestionStore (dateDecodingStrategy = .iso8601).
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let plan = try decoder.decode(UpsellPlanResponse.self, from: ContractFixtures.data("upsell-plan.json"))

        XCTAssertEqual(plan.source, "openai")
        XCTAssertEqual(try XCTUnwrap(plan.expiresAt).timeIntervalSince1970, 1_792_153_800, accuracy: 0.5)

        XCTAssertEqual(plan.opportunities.count, 1)
        let opportunity = try XCTUnwrap(plan.opportunities.first)
        XCTAssertEqual(opportunity.opportunityId, "opp-milch-muesli")
        XCTAssertEqual(opportunity.triggerProductIds, [92])
        XCTAssertEqual(opportunity.suggestions.count, 2)

        let first = opportunity.suggestions[0]
        XCTAssertEqual(first.id, 93)
        XCTAssertEqual(first.product.layoutCode, "520/2/1/2")
        XCTAssertTrue(first.product.hasLayoutPosition)
        XCTAssertEqual(first.product.product.price, 1.29, accuracy: 0.001)
        XCTAssertEqual(first.confidence, 0.72, accuracy: 0.001)

        // Vorschlag ohne Preis und ohne Regalposition: Defaults über die computed properties.
        let second = opportunity.suggestions[1]
        XCTAssertNil(second.product.price)
        XCTAssertNil(second.product.layoutCode)
        XCTAssertFalse(second.product.hasLayoutPosition)
        XCTAssertEqual(second.product.product.price, 0)
        XCTAssertEqual(second.product.detailText, "ohne Regalposition")

        XCTAssertEqual(plan.debug?.totalTokens, 406)
        XCTAssertEqual(plan.debug?.candidateCount, 2)
    }
}
