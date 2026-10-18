import XCTest
@testable import IndooroModels

/// Rezeptmodelle gegen die Backend-Fixtures: Seitenform, Detail und Produktzuordnung.
final class RecipeDecodingTests: XCTestCase {

    func testRecipesPageDecodesContent() throws {
        let data = try ModelFixtures.data("recipes.json")

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
        let detail = try JSONDecoder().decode(RecipeDetail.self, from: ModelFixtures.data("recipe-detail.json"))

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
            from: ModelFixtures.data("recipe-product-mapping.json")
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

    func testRecipeDisplayTextRestoresUmlauts() {
        let tag = RecipeTag(id: UUID(), code: "fruehstueck", name: "Frueh Muesli", kind: nil, status: nil)

        XCTAssertEqual(tag.displayName, "Früh Müsli")
    }
}
