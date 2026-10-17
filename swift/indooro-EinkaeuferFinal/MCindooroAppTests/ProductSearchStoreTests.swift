import XCTest
@testable import MCindooroApp

/// Prueft, dass Produktanfragen die aktive Filiale als `storeCode` mitschicken und dass ein
/// Filialwechsel die Trefferliste leert. Keine Netzwerkaufrufe: nur URL-Bildung und Zustand.
final class ProductSearchStoreTests: XCTestCase {
    // MARK: - storeCode in Produktanfragen

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

    // MARK: - Lossy Decoding der Trefferliste

    func testBareArraySkipsProductWithMissingLayoutCode() throws {
        let json = """
        [
          {"id":92,"name":"Naturpur Bio-Milch 1L","price":1.79,"layoutCode":"520/2/1/1","storeId":null,"storeCode":null},
          {"id":93,"name":"S-BUDGET H-Milch 1L (defekt)","price":1.29,"storeId":null,"storeCode":null},
          {"id":94,"name":"Berglandmilch 1L","price":1.49,"layoutCode":"520/2/1/3","storeId":null,"storeCode":null}
        ]
        """

        let products = try ProductSearchStore.decodeProducts(from: Data(json.utf8))

        XCTAssertEqual(products.map(\.id), [92, 94])
    }

    func testPageFormSkipsInvalidElement() throws {
        let json = """
        {"content":[
          {"id":92,"name":"Naturpur Bio-Milch 1L","price":1.79,"layoutCode":"520/2/1/1"},
          {"id":93,"name":"S-BUDGET H-Milch 1L (defekt)","price":1.29},
          {"id":94,"name":"Berglandmilch 1L","price":1.49,"layoutCode":"520/2/1/3"}
        ],"totalElements":3}
        """

        let products = try ProductSearchStore.decodeProducts(from: Data(json.utf8))

        XCTAssertEqual(products.map(\.id), [92, 94])
    }

    func testUnknownObjectShapeThrows() {
        XCTAssertThrowsError(try ProductSearchStore.decodeProducts(from: Data("{\"foo\":1}".utf8)))
    }

    // MARK: - Query-Kodierung der Suche

    func testSearchQueriesRoundTripAndReservedCharactersAreEncoded() throws {
        let base = URL(string: "https://example.org/api")!
        let cases: [(query: String, encoded: String)] = [
            ("Milch & Käse", "%26"),
            ("a+b", "%2B"),
            ("50%", "%25"),
            ("#1", "%23"),
        ]

        for (query, encoded) in cases {
            let url = try XCTUnwrap(PilotSearchURL.make(base: base, query: query, size: 50, storeID: nil, storeCode: nil))
            let parts = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false))
            let segments = try XCTUnwrap(parts.percentEncodedQuery?.components(separatedBy: "&"))

            XCTAssertEqual(parts.queryItems?.first(where: { $0.name == "q" })?.value, query, "Roundtrip für \(query)")
            XCTAssertFalse(url.absoluteString.contains("+"), "Kein rohes + in \(url.absoluteString)")
            XCTAssertEqual(segments.count, 2, "Nur size und q erwartet, kein zusätzliches & im q-Wert")
            let rawQ = try XCTUnwrap(segments.first(where: { $0.hasPrefix("q=") }))
            XCTAssertTrue(rawQ.contains(encoded), "\(query) sollte \(encoded) enthalten, ist \(rawQ)")
        }
    }
}
