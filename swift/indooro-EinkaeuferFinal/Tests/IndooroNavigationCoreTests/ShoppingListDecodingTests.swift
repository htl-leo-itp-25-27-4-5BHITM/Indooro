import XCTest
@testable import IndooroNavigationCore

/// Gespeicherte Einkaufslisten (UserDefaults, ShoppingListManager.persist) werden mit
/// JSONEncoder()/JSONDecoder() ohne Datumsstrategie geschrieben und gelesen. Die Fixture
/// shopping-list-v1.json ist eine Liste im alten Format ohne Rezept- und Upsell-Felder.
final class ShoppingListDecodingTests: XCTestCase {

    func testV1ShoppingListDecodesWithDefaultsForRecipeAndUpsellFields() throws {
        let list = try JSONDecoder().decode(
            ShoppingList.self,
            from: ContractFixtures.data("shopping-list-v1.json")
        )

        XCTAssertEqual(list.id, UUID(uuidString: "7f1c2a3b-1d2e-4f50-8a6b-9c0d1e2f3a4b"))
        XCTAssertEqual(list.name, "Wocheneinkauf")
        XCTAssertFalse(list.isArchived)
        XCTAssertEqual(list.items.count, 3)
        XCTAssertEqual(list.openItemCount, 2)
        XCTAssertEqual(list.completedItemCount, 2)

        let milk = list.items[0]
        XCTAssertEqual(milk.id, UUID(uuidString: "0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d"))
        XCTAssertEqual(milk.productID, 92)
        XCTAssertEqual(milk.name, "Naturpur Bio-Milch 1L")
        XCTAssertEqual(milk.price, 1.79)
        XCTAssertEqual(milk.layoutCode, "520/2/1/1")
        XCTAssertEqual(milk.quantity, 2)
        XCTAssertEqual(milk.sortOrder, 0)
        XCTAssertEqual(milk.status, .open)
        XCTAssertEqual(milk.addedAt.timeIntervalSinceReferenceDate, 792_115_200.5, accuracy: 0.001)

        // Defaults für Felder, die im v1-Format fehlen.
        XCTAssertNil(milk.sourceRecipeId)
        XCTAssertNil(milk.sourceRecipeName)
        XCTAssertNil(milk.ingredientName)
        XCTAssertNil(milk.ingredientQuantity)
        XCTAssertNil(milk.ingredientUnit)
        XCTAssertNil(milk.mappingConfidence)
        XCTAssertNil(milk.manuallyConfirmed)
        XCTAssertFalse(milk.addedFromUpsell)
        XCTAssertNil(milk.recipeSourceText)

        let apples = list.items[1]
        XCTAssertEqual(apples.status, .done)
        XCTAssertEqual(apples.trimmedNote, "rote, nicht zu weich")
        XCTAssertFalse(apples.addedFromUpsell)

        // Freier Artikel ohne Produkt: productID, price, layoutCode und sortOrder fehlen.
        let free = list.items[2]
        XCTAssertNil(free.productID)
        XCTAssertNil(free.price)
        XCTAssertNil(free.layoutCode)
        XCTAssertNil(free.sortOrder)
        XCTAssertEqual(free.status, .missing)
        XCTAssertEqual(free.quantity, 1)
        XCTAssertFalse(free.addedFromUpsell)
    }

    func testShoppingListRoundTripKeepsRecipeAndUpsellFields() throws {
        let recipeID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000119"))

        var list = ShoppingList(name: "Rezeptliste")
        let apples = ShoppingListItem(
            product: Product(id: 1, name: "Gala Äpfel lose", price: 2.99, layoutCode: "310/1/1/1"),
            quantity: 2,
            sourceRecipeId: recipeID,
            sourceRecipeName: "Apfel-Hafer-Crumble",
            ingredientName: "Äpfel",
            ingredientQuantity: "4",
            ingredientUnit: "piece",
            mappingConfidence: 0.85,
            manuallyConfirmed: true
        )
        let upsell = ShoppingListItem(
            product: Product(id: 93, name: "S-BUDGET H-Milch 1L", price: 1.29, layoutCode: "520/2/1/2"),
            addedFromUpsell: true
        )
        let freeIngredient = ShoppingListItem(
            freeIngredientName: "Zimt",
            sourceRecipeId: recipeID,
            sourceRecipeName: "Apfel-Hafer-Crumble",
            ingredientQuantity: "1",
            ingredientUnit: "TL"
        )
        list.items = [apples, upsell, freeIngredient]

        let data = try JSONEncoder().encode(list)
        let decoded = try JSONDecoder().decode(ShoppingList.self, from: data)

        XCTAssertEqual(decoded, list)

        // Die neuen Schlüssel stehen tatsächlich im gespeicherten JSON.
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let items = try XCTUnwrap(json["items"] as? [[String: Any]])
        XCTAssertEqual(items[0]["sourceRecipeName"] as? String, "Apfel-Hafer-Crumble")
        XCTAssertEqual(items[1]["addedFromUpsell"] as? Bool, true)

        XCTAssertEqual(decoded.items[0].sourceRecipeId, recipeID)
        XCTAssertEqual(decoded.items[0].mappingConfidence, 0.85)
        XCTAssertEqual(decoded.items[0].manuallyConfirmed, true)
        XCTAssertEqual(decoded.items[0].recipeSourceText, "Apfel-Hafer-Crumble: 4 piece Äpfel")
        XCTAssertTrue(decoded.items[1].addedFromUpsell)
        XCTAssertNil(decoded.items[1].sourceRecipeId)
        XCTAssertNil(decoded.items[2].productID)
        XCTAssertEqual(decoded.items[2].recipeSourceText, "Apfel-Hafer-Crumble: 1 TL Zimt")
    }
}
