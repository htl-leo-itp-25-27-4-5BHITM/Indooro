import IndooroModels
import XCTest
@testable import MCindooroApp

@MainActor
final class ShoppingListManagerTests: XCTestCase {
    private var suiteName: String!
    private var defaults: UserDefaults!

    private let storeKey = "shoppingListStore.v1"

    private let milk = Product(id: 92, name: "Naturpur Bio-Milch 1L", price: 1.79, layoutCode: "520/2/1/1")
    private let apples = Product(id: 1, name: "Gala Aepfel lose", price: 2.99, layoutCode: "310/1/1/1")

    override func setUp() {
        super.setUp()
        suiteName = "ShoppingListManagerTests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)!
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        suiteName = nil
        super.tearDown()
    }

    // MARK: - Persistenz

    func testPersistenceRoundTripKeepsListItemsAndSelection() throws {
        let manager = ShoppingListManager(defaults: defaults)
        let listID = try XCTUnwrap(manager.selectedList?.id)
        let added = try XCTUnwrap(manager.addProduct(milk, to: listID))

        let reloaded = ShoppingListManager(defaults: defaults)

        XCTAssertEqual(reloaded.lists, manager.lists)
        XCTAssertEqual(reloaded.selectedListID, listID)
        XCTAssertEqual(reloaded.lists.count, 1)
        XCTAssertEqual(reloaded.lists.first?.items.map(\.id), [added.id])
        XCTAssertEqual(reloaded.lists.first?.items.first?.productID, milk.id)
        XCTAssertEqual(reloaded.lists.first?.items.first?.quantity, 1)
    }

    func testFreshStoreCreatesDefaultListAndPersistsIt() throws {
        let manager = ShoppingListManager(defaults: defaults)

        XCTAssertEqual(manager.lists.map(\.name), ["Meine Einkaufsliste"])
        XCTAssertEqual(manager.selectedListID, manager.lists.first?.id)
        XCTAssertNotNil(defaults.data(forKey: storeKey))
    }

    // MARK: - Decoding des Altformats (v1)

    func testLoadsV1StoreFormatThroughManager() throws {
        let listID = "7f1c2a3b-1d2e-4f50-8a6b-9c0d1e2f3a4b"
        let json = """
        {
          "lists": [
            {
              "id": "\(listID)",
              "name": "Wocheneinkauf",
              "items": [
                {
                  "id": "0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d",
                  "productID": 92,
                  "name": "Naturpur Bio-Milch 1L",
                  "price": 1.79,
                  "layoutCode": "520/2/1/1",
                  "quantity": 2,
                  "note": null,
                  "sortOrder": 0,
                  "status": "open",
                  "addedAt": 792115200.5,
                  "updatedAt": 792115200.5
                },
                {
                  "id": "1b2c3d4e-5f60-4718-9a0b-c1d2e3f4a5b6",
                  "productID": 1,
                  "name": "Gala Aepfel lose",
                  "price": 2.99,
                  "layoutCode": "310/1/1/1",
                  "quantity": 1,
                  "note": "rote, nicht zu weich",
                  "sortOrder": 1,
                  "status": "done",
                  "addedAt": 792115260.0,
                  "updatedAt": 792115900.25
                },
                {
                  "id": "2c3d4e5f-6071-4829-8b1c-d2e3f4a5b6c7",
                  "name": "Haferflocken (frei erfasst)",
                  "quantity": 1,
                  "note": null,
                  "status": "missing",
                  "addedAt": 792115320.0,
                  "updatedAt": 792116000.0
                }
              ],
              "createdAt": 792100000.0,
              "updatedAt": 792118800.0,
              "isArchived": false
            }
          ],
          "selectedListID": "\(listID)"
        }
        """
        defaults.set(Data(json.utf8), forKey: storeKey)

        let manager = ShoppingListManager(defaults: defaults)

        XCTAssertEqual(manager.lists.count, 1)
        let list = try XCTUnwrap(manager.lists.first)
        XCTAssertEqual(list.name, "Wocheneinkauf")
        XCTAssertEqual(list.id.uuidString.lowercased(), listID)
        XCTAssertEqual(manager.selectedListID, list.id)
        XCTAssertEqual(list.items.count, 3)
        XCTAssertEqual(list.items.map(\.status), [.open, .done, .missing])

        // Felder aus späteren Versionen fehlen im Altformat: Rezept- und Upsell-Felder bleiben nil/false.
        for item in list.items {
            XCTAssertNil(item.sourceRecipeId)
            XCTAssertNil(item.sourceRecipeName)
            XCTAssertNil(item.ingredientName)
            XCTAssertNil(item.mappingConfidence)
            XCTAssertNil(item.manuallyConfirmed)
            XCTAssertFalse(item.addedFromUpsell)
        }
    }

    // MARK: - Archivierte Listen

    func testArchivedListsAreFilteredOnLoad() throws {
        let archivedID = UUID()
        let activeID = UUID()
        let json = """
        {
          "lists": [
            {
              "id": "\(archivedID.uuidString)",
              "name": "Alt",
              "items": [],
              "createdAt": 792100000.0,
              "updatedAt": 792100000.0,
              "isArchived": true
            },
            {
              "id": "\(activeID.uuidString)",
              "name": "Aktuell",
              "items": [],
              "createdAt": 792100000.0,
              "updatedAt": 792100000.0,
              "isArchived": false
            }
          ],
          "selectedListID": "\(archivedID.uuidString)"
        }
        """
        defaults.set(Data(json.utf8), forKey: storeKey)

        let manager = ShoppingListManager(defaults: defaults)

        XCTAssertEqual(manager.lists.map(\.name), ["Aktuell"])
        XCTAssertFalse(manager.lists.contains { $0.id == archivedID })
        // Die Auswahl zeigt auf eine gefilterte Liste: die erste verbleibende Liste wird gewaehlt.
        XCTAssertEqual(manager.selectedListID, activeID)
        XCTAssertEqual(manager.selectedList?.name, "Aktuell")
    }

    // MARK: - Merge und Deduplizierung einzelner Produkte

    func testAddingSameProductTwiceMergesIntoOneOpenItem() throws {
        let manager = ShoppingListManager(defaults: defaults)
        let listID = try XCTUnwrap(manager.selectedList?.id)

        let first = try XCTUnwrap(manager.addProduct(milk, to: listID))
        let second = try XCTUnwrap(manager.addProduct(milk, to: listID))

        let list = try XCTUnwrap(manager.list(with: listID))
        XCTAssertEqual(list.items.count, 1)
        XCTAssertEqual(second.id, first.id)
        XCTAssertEqual(list.items.first?.quantity, 2)
        XCTAssertEqual(list.items.first?.status, .open)
        XCTAssertEqual(list.openItemCount, 2)
    }

    func testAddedFromUpsellStaysTrueOnceSetByAnyAdd() throws {
        let manager = ShoppingListManager(defaults: defaults)
        let listID = try XCTUnwrap(manager.selectedList?.id)

        manager.addProduct(milk, to: listID, addedFromUpsell: false)
        XCTAssertEqual(manager.list(with: listID)?.items.first?.addedFromUpsell, false)

        manager.addProduct(milk, to: listID, addedFromUpsell: true)
        XCTAssertEqual(manager.list(with: listID)?.items.first?.addedFromUpsell, true)

        // Ein späterer Add ohne Upsell-Kennzeichen setzt das Flag nicht zurück.
        manager.addProduct(milk, to: listID, addedFromUpsell: false)
        let list = try XCTUnwrap(manager.list(with: listID))
        XCTAssertEqual(list.items.count, 1)
        XCTAssertEqual(list.items.first?.quantity, 3)
        XCTAssertEqual(list.items.first?.addedFromUpsell, true)
    }

    func testAddingDoneProductCreatesNewOpenItem() throws {
        let manager = ShoppingListManager(defaults: defaults)
        let listID = try XCTUnwrap(manager.selectedList?.id)

        let first = try XCTUnwrap(manager.addProduct(apples, to: listID))
        manager.updateItemStatus(first.id, in: listID, status: .done)
        XCTAssertFalse(manager.containsProduct(apples, in: listID))

        let second = try XCTUnwrap(manager.addProduct(apples, to: listID))

        let list = try XCTUnwrap(manager.list(with: listID))
        XCTAssertNotEqual(second.id, first.id)
        XCTAssertEqual(list.items.count, 2)
        XCTAssertEqual(list.items.first(where: { $0.id == first.id })?.status, .done)
        XCTAssertEqual(list.items.first(where: { $0.id == second.id })?.status, .open)
        XCTAssertEqual(second.quantity, 1)
        XCTAssertEqual(manager.openItems(in: listID).map(\.id), [second.id])
        XCTAssertTrue(manager.containsProduct(apples, in: listID))
    }

    // MARK: - Rezepte

    func testAddingSameRecipeTwiceMergesMappedIngredients() throws {
        let manager = ShoppingListManager(defaults: defaults)
        let listID = try XCTUnwrap(manager.selectedList?.id)
        let recipe = try decode(RecipeDetail.self, from: Self.recipeJSON)
        let mapping = try decode(RecipeProductMappingResponse.self, from: Self.mappingJSON)

        let firstChanged = manager.addRecipeIngredients(
            recipe: recipe,
            mapping: mapping,
            includeFreeIngredients: false,
            to: listID
        )
        XCTAssertEqual(firstChanged.count, 3)

        let secondChanged = manager.addRecipeIngredients(
            recipe: recipe,
            mapping: mapping,
            includeFreeIngredients: false,
            to: listID
        )
        XCTAssertEqual(secondChanged.count, 3)

        let list = try XCTUnwrap(manager.list(with: listID))
        XCTAssertEqual(list.items.count, 3, "Zweites Hinzufuegen darf keine doppelten Items erzeugen")
        XCTAssertEqual(Set(list.items.compactMap(\.productID)), [1, 44, 102])
        XCTAssertEqual(list.items.map(\.quantity), [2, 2, 2])
        XCTAssertTrue(list.items.allSatisfy { $0.sourceRecipeId == recipe.id })
        XCTAssertTrue(list.items.allSatisfy { $0.sourceRecipeName == "Apfel-Hafer-Crumble" })

        let apfelItem = try XCTUnwrap(list.items.first { $0.productID == 1 })
        XCTAssertEqual(apfelItem.note, "Aus Apfel-Hafer-Crumble: 4 Äpfel")
        XCTAssertEqual(apfelItem.sourceRecipeName, "Apfel-Hafer-Crumble")
    }

    func testRecipeWithoutFreeIngredientsSkipsUnmappedIngredient() throws {
        let manager = ShoppingListManager(defaults: defaults)
        let listID = try XCTUnwrap(manager.selectedList?.id)
        let recipe = try decode(RecipeDetail.self, from: Self.recipeJSON)
        let mapping = try decode(RecipeProductMappingResponse.self, from: Self.mappingWithUnmappedButterJSON)

        let changed = manager.addRecipeIngredients(
            recipe: recipe,
            mapping: mapping,
            includeFreeIngredients: false,
            to: listID
        )

        XCTAssertEqual(changed.count, 2)
        let list = try XCTUnwrap(manager.list(with: listID))
        XCTAssertEqual(list.items.count, 2)
        XCTAssertTrue(list.items.allSatisfy { $0.productID != nil })
    }

    func testFreeIngredientsAreAddedOnceAndMergedOnRepeat() throws {
        let manager = ShoppingListManager(defaults: defaults)
        let listID = try XCTUnwrap(manager.selectedList?.id)
        let recipe = try decode(RecipeDetail.self, from: Self.recipeJSON)
        let mapping = try decode(RecipeProductMappingResponse.self, from: Self.mappingWithUnmappedButterJSON)

        manager.addRecipeIngredients(recipe: recipe, mapping: mapping, includeFreeIngredients: true, to: listID)
        manager.addRecipeIngredients(recipe: recipe, mapping: mapping, includeFreeIngredients: true, to: listID)

        let list = try XCTUnwrap(manager.list(with: listID))
        XCTAssertEqual(list.items.count, 3)
        let freeItems = list.items.filter { $0.productID == nil }
        XCTAssertEqual(freeItems.count, 1)
        XCTAssertEqual(freeItems.first?.ingredientName, "Butter")
        XCTAssertEqual(freeItems.first?.quantity, 2)
    }

    // MARK: - Hilfsfunktionen

    private func decode<T: Decodable>(_ type: T.Type, from json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    /// Verkuerzt aus `Fixtures/recipe-detail.json` (Felder und Namen unveraendert).
    private static let recipeJSON = """
    {"id":"00000000-0000-0000-0000-000000000119","slug":"apfel-hafer-crumble","title":"Apfel-Hafer-Crumble","summary":"Warmer Crumble mit Apfel, Hafer und Butter.","description":null,"imageUrl":null,"imageAlt":null,"servings":4,"prepTimeMinutes":12,"cookTimeMinutes":25,"totalTimeMinutes":37,"status":"PUBLISHED","publishedAt":"2026-06-29T06:43:46.777744Z","archivedAt":null,"createdAt":"2026-05-27T06:35:41.115741Z","updatedAt":"2026-06-29T06:43:46.783417Z","tags":[{"id":"00000000-0000-0000-0000-000000000203","code":"family","name":"Familie","kind":"occasion","status":"ACTIVE"}],"ingredients":[{"id":"00000000-0000-0000-0000-000000000355","position":1,"displayName":"Äpfel","canonicalName":"aepfel","quantity":4.000,"quantityText":"4","unitCode":"piece","unitDisplayName":"Stück","preparationNote":null,"optional":false},{"id":"00000000-0000-0000-0000-000000000356","position":2,"displayName":"Haferflocken","canonicalName":"haferflocken","quantity":100.000,"quantityText":"100","unitCode":"g","unitDisplayName":"Gramm","preparationNote":null,"optional":false},{"id":"00000000-0000-0000-0000-000000000357","position":3,"displayName":"Butter","canonicalName":"butter","quantity":80.000,"quantityText":"80","unitCode":"g","unitDisplayName":"Gramm","preparationNote":"kalt","optional":false}],"steps":[{"position":1,"instruction":"Zutaten vorbereiten und nach Rezept sortieren.","durationMinutes":5}]}
    """

    /// Aus `Fixtures/recipe-product-mapping.json`: alle drei Zutaten zugeordnet.
    private static let mappingJSON = """
    {"recipeId":"00000000-0000-0000-0000-000000000119","storeId":"ad61389a-7486-48fa-afa2-9b5e4132f6a8","storeCode":null,"ingredients":[{"ingredientId":"00000000-0000-0000-0000-000000000355","ingredientName":"Äpfel","status":"MAPPED","product":{"id":1,"name":"Gala Äpfel lose","price":2.99,"layoutCode":"310/1/1/1","storeId":null,"storeCode":null},"candidates":[],"confidence":0.850,"manuallyConfirmed":true,"reason":null},{"ingredientId":"00000000-0000-0000-0000-000000000356","ingredientName":"Haferflocken","status":"MAPPED","product":{"id":44,"name":"S-BUDGET Haferflocken 500g","price":1.19,"layoutCode":"440/1/3/2","storeId":null,"storeCode":null},"candidates":[],"confidence":0.920,"manuallyConfirmed":true,"reason":null},{"ingredientId":"00000000-0000-0000-0000-000000000357","ingredientName":"Butter","status":"MAPPED","product":{"id":102,"name":"Butter 250g","price":2.19,"layoutCode":"525/1/2/1","storeId":null,"storeCode":null},"candidates":[],"confidence":0.900,"manuallyConfirmed":true,"reason":null}]}
    """

    /// Wie `mappingJSON`, aber Butter ist nicht zugeordnet (Freitext-Zutat).
    private static let mappingWithUnmappedButterJSON = """
    {"recipeId":"00000000-0000-0000-0000-000000000119","storeId":"ad61389a-7486-48fa-afa2-9b5e4132f6a8","storeCode":null,"ingredients":[{"ingredientId":"00000000-0000-0000-0000-000000000355","ingredientName":"Äpfel","status":"MAPPED","product":{"id":1,"name":"Gala Äpfel lose","price":2.99,"layoutCode":"310/1/1/1","storeId":null,"storeCode":null},"candidates":[],"confidence":0.850,"manuallyConfirmed":true,"reason":null},{"ingredientId":"00000000-0000-0000-0000-000000000356","ingredientName":"Haferflocken","status":"MAPPED","product":{"id":44,"name":"S-BUDGET Haferflocken 500g","price":1.19,"layoutCode":"440/1/3/2","storeId":null,"storeCode":null},"candidates":[],"confidence":0.920,"manuallyConfirmed":true,"reason":null},{"ingredientId":"00000000-0000-0000-0000-000000000357","ingredientName":"Butter","status":"UNMAPPED","product":null,"candidates":[],"confidence":null,"manuallyConfirmed":false,"reason":"no_match"}]}
    """
}
