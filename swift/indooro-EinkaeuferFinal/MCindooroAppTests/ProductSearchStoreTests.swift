import XCTest
@testable import MCindooroApp

/// Prueft, dass Produktanfragen die aktive Filiale als `storeCode` mitschicken und dass ein
/// Filialwechsel die Trefferliste leert. Keine Netzwerkaufrufe: nur URL-Bildung und Zustand.
final class ProductSearchStoreTests: XCTestCase {

    func testNoStoreCodeByDefaultLeavesURLsUnchanged() {
        let store = ProductSearchStore()

        XCTAssertNil(store.activeStoreCode)
        XCTAssertFalse(store.searchURL(query: "milch", size: 50)?.absoluteString.contains("storeCode") ?? true)
        XCTAssertFalse(store.listURL(size: 500)?.absoluteString.contains("storeCode") ?? true)
    }

    func testSetActiveStoreAddsStoreCodeToSearchAndListURLs() {
        let store = ProductSearchStore()

        store.setActiveStore(code: "SPAR-001")

        XCTAssertEqual(store.activeStoreCode, "SPAR-001")
        XCTAssertTrue(
            store.searchURL(query: "milch", size: 50)?.absoluteString.hasSuffix("/products/search?q=milch&size=50&storeCode=SPAR-001") ?? false
        )
        XCTAssertTrue(
            store.listURL(size: 500)?.absoluteString.hasSuffix("/products?size=500&storeCode=SPAR-001") ?? false
        )
    }

    func testSetActiveStoreNilRemovesStoreCodeFromURLs() {
        let store = ProductSearchStore()
        store.setActiveStore(code: "SPAR-001")

        store.setActiveStore(code: nil)

        XCTAssertNil(store.activeStoreCode)
        XCTAssertFalse(store.searchURL(query: "milch", size: 50)?.absoluteString.contains("storeCode") ?? true)
        XCTAssertFalse(store.listURL(size: 500)?.absoluteString.contains("storeCode") ?? true)
    }

    func testBlankStoreCodeIsTreatedAsNoStore() {
        let store = ProductSearchStore()

        store.setActiveStore(code: "   ")

        XCTAssertNil(store.activeStoreCode)
        XCTAssertFalse(store.searchURL(query: "milch", size: 50)?.absoluteString.contains("storeCode") ?? true)
    }

    func testSameStoreCodeTwiceIsNoOp() {
        let store = ProductSearchStore()
        store.setActiveStore(code: "SPAR-001")
        let urlBefore = store.searchURL(query: "milch", size: 50)

        store.setActiveStore(code: "SPAR-001")

        XCTAssertEqual(store.activeStoreCode, "SPAR-001")
        XCTAssertEqual(store.searchURL(query: "milch", size: 50), urlBefore)
        XCTAssertTrue(store.searchResults.isEmpty)
        XCTAssertFalse(store.isSearching)
    }

    func testStoreChangeUpdatesCodeAndClearsSearchState() {
        let store = ProductSearchStore()
        store.setActiveStore(code: "SPAR-001")
        let urlForFirstStore = store.searchURL(query: "milch", size: 50)

        store.setActiveStore(code: "SPAR-002")

        XCTAssertEqual(store.activeStoreCode, "SPAR-002")
        XCTAssertNotEqual(store.searchURL(query: "milch", size: 50), urlForFirstStore)
        XCTAssertTrue(
            store.searchURL(query: "milch", size: 50)?.absoluteString.hasSuffix("&storeCode=SPAR-002") ?? false
        )
        XCTAssertTrue(store.searchResults.isEmpty)
        XCTAssertFalse(store.isSearching)
    }
}
