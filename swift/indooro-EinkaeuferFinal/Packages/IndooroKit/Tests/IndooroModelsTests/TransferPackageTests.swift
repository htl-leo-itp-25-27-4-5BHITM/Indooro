import XCTest
@testable import IndooroModels

/// Austauschpaket fuer Einkaufslisten (Export/Import): Kodierung, Auswahl und Ueberfuehrung in Listen.
final class TransferPackageTests: XCTestCase {

    private let milch = Product(id: 92, name: "Naturpur Bio-Milch 1L", price: 1.79, layoutCode: "520/2/1/1")

    private func transferItem(quantity: Int = 3) -> ShoppingTransferItem {
        ShoppingTransferItem(item: ShoppingListItem(product: milch, quantity: quantity, note: "  laktosefrei  "))!
    }

    func testPackageRoundTripKeepsVersionItemsAndQuantities() throws {
        let package = ShoppingTransferPackage(
            kind: .fullList,
            sourceListID: UUID(uuidString: "7f1c2a3b-1d2e-4f50-8a6b-9c0d1e2f3a4b"),
            sourceListName: "Wocheneinkauf",
            senderDisplayName: "Erik",
            note: "Bitte mitbringen",
            exportedAt: Date(timeIntervalSince1970: 1_792_153_800),
            items: [transferItem(quantity: 2), transferItem(quantity: 1)]
        )

        let decoded = try JSONDecoder().decode(ShoppingTransferPackage.self, from: JSONEncoder().encode(package))

        XCTAssertEqual(decoded.id, package.id)
        XCTAssertEqual(decoded.version, ShoppingTransferPackage.currentVersion)
        XCTAssertEqual(decoded.kind, .fullList)
        XCTAssertEqual(decoded.sourceListName, "Wocheneinkauf")
        XCTAssertEqual(decoded.senderDisplayName, "Erik")
        XCTAssertEqual(decoded.note, "Bitte mitbringen")
        XCTAssertEqual(decoded.exportedAt, Date(timeIntervalSince1970: 1_792_153_800))
        XCTAssertEqual(decoded.items.count, 2)
        XCTAssertEqual(decoded.totalQuantity, 3)
        XCTAssertEqual(decoded.items[0].note, "laktosefrei")
    }

    func testTransferItemCarriesProductIdentityAndClampsQuantity() {
        let full = ShoppingTransferItem(item: ShoppingListItem(product: milch, quantity: 3))
        XCTAssertEqual(full?.productID, 92)
        XCTAssertEqual(full?.layoutCode, "520/2/1/1")
        XCTAssertEqual(full?.quantity, 3, "ohne Auswahl wird die volle Menge uebernommen")

        let selected = ShoppingTransferItem(item: ShoppingListItem(product: milch, quantity: 3), quantity: 2)
        XCTAssertEqual(selected?.quantity, 2)

        let tooMany = ShoppingTransferItem(item: ShoppingListItem(product: milch, quantity: 3), quantity: 9)
        XCTAssertEqual(tooMany?.quantity, 3, "mehr als vorhanden wird begrenzt")

        let zero = ShoppingTransferItem(item: ShoppingListItem(product: milch, quantity: 3), quantity: 0)
        XCTAssertEqual(zero?.quantity, 1, "mindestens eine Einheit")
    }

    func testFreeIngredientWithoutProductCannotBeTransferred() {
        let free = ShoppingListItem(
            freeIngredientName: "Salz",
            sourceRecipeId: nil,
            sourceRecipeName: nil,
            ingredientQuantity: nil,
            ingredientUnit: nil
        )

        XCTAssertNil(ShoppingTransferItem(item: free))
    }

    func testSuggestedImportedListNameFallsBackWhenSourceNameIsBlank() {
        let named = ShoppingTransferPackage(kind: .itemSelection, sourceListID: nil, sourceListName: "Party", items: [])
        let blank = ShoppingTransferPackage(kind: .itemSelection, sourceListID: nil, sourceListName: "  ", items: [])

        XCTAssertEqual(named.suggestedImportedListName, "Party")
        XCTAssertEqual(blank.suggestedImportedListName, "Importierte Einkaufsliste")
        XCTAssertEqual(ShoppingTransferKind.fullList.title, "Komplette Liste")
        XCTAssertEqual(ShoppingTransferKind.itemSelection.title, "Artikelauswahl")
    }

    func testImportedItemGetsOpenStatusNoUpsellFlagAndTrimmedNote() {
        let imported = ShoppingListItem(transferItem: transferItem(quantity: 2), sortOrder: 4)

        XCTAssertEqual(imported.productID, 92)
        XCTAssertEqual(imported.name, "Naturpur Bio-Milch 1L")
        XCTAssertEqual(imported.quantity, 2)
        XCTAssertEqual(imported.note, "laktosefrei")
        XCTAssertEqual(imported.sortOrder, 4)
        XCTAssertEqual(imported.status, .open)
        XCTAssertFalse(imported.addedFromUpsell)
    }

    func testShareSelectionIsIdentifiedByItemID() {
        let itemID = UUID()
        let selection = ShoppingShareSelection(itemID: itemID, quantity: 2)

        XCTAssertEqual(selection.id, itemID)
        XCTAssertEqual(selection.quantity, 2)
    }
}
