import IndooroModels
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

    // MARK: - Transport über APIClient (Phase 5, task 6.4)

    private let storeID = UUID(uuidString: "AD61389A-7486-48FA-AFA2-9B5E4132F6A8")!

    override func tearDown() {
        TransportStubURLProtocol.clear()
        super.tearDown()
    }

    @MainActor
    func testSearchWithStoreSendsSameURLAsBefore() async throws {
        TransportStubURLProtocol.install { _ in .respond(status: 200, body: Data("[]".utf8)) }
        let store = ProductSearchStore(client: StoreTestClient.make())
        let mobileStore = MobileStoreSummary(id: storeID, storeCode: "HA-01", name: "Test Markt", city: "Linz")

        store.searchProducts(query: "milch", size: 50, store: mobileStore)
        try await waitUntil { !store.isSearching }

        let request = try XCTUnwrap(TransportStubURLProtocol.requests.first)
        XCTAssertEqual(
            request.url?.absoluteString,
            "https://example.test/api/products/search?size=50&q=milch&storeId=\(storeID.uuidString)&storeCode=HA-01"
        )
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertEqual(request.timeoutInterval, 10)
        XCTAssertTrue(store.hasCompletedSearch)
        XCTAssertNil(store.errorMessage)
    }

    @MainActor
    func testSearchTextPlusIsEncodedAsBefore() async throws {
        TransportStubURLProtocol.install { _ in .respond(status: 200, body: Data("[]".utf8)) }
        let store = ProductSearchStore(client: StoreTestClient.make())

        store.searchProducts(query: "a+b & c", size: 50)
        try await waitUntil { !store.isSearching }

        let absolute = try XCTUnwrap(TransportStubURLProtocol.requests.first?.url?.absoluteString)
        XCTAssertEqual(absolute, "https://example.test/api/products/search?size=50&q=a%2Bb%20%26%20c")
    }

    @MainActor
    func testLayoutPrefixListingUsesProductsPathActiveStoreCodeAndFilters() async throws {
        let body = Data("""
        [
          {"id":92,"name":"Naturpur Bio-Milch 1L","price":1.79,"layoutCode":"520/2/1/1"},
          {"id":40,"name":"Eier","price":2.49,"layoutCode":"530/1/1/1"}
        ]
        """.utf8)
        TransportStubURLProtocol.install { _ in .respond(status: 200, body: body) }
        let store = ProductSearchStore(client: StoreTestClient.make())
        store.setActiveStore(code: "SPAR-001")

        store.searchProducts(layoutCodePrefixes: ["520/2"], size: 500)
        try await waitUntil { !store.isSearching }

        XCTAssertEqual(
            TransportStubURLProtocol.requests.first?.url?.absoluteString,
            "https://example.test/api/products?size=500&storeCode=SPAR-001"
        )
        XCTAssertEqual(store.searchResults.map(\.id), [92])
    }

    @MainActor
    func testHTTPErrorShowsStatusTextAndNeverTheServerMessageAndIsNotRetried() async throws {
        TransportStubURLProtocol.install { _ in .respond(status: 404, body: Data("{\"error\":\"Interner Text\"}".utf8)) }
        let store = ProductSearchStore(client: StoreTestClient.make())

        store.searchProducts(query: "milch", size: 50)
        try await waitUntil { !store.isSearching }

        XCTAssertEqual(store.errorMessage, "Der Server meldet einen Fehler (HTTP 404).")
        XCTAssertFalse(store.hasCompletedSearch)
        XCTAssertTrue(store.searchResults.isEmpty)
        XCTAssertEqual(TransportStubURLProtocol.requests.count, 1)
    }

    @MainActor
    func testTimeoutShowsLegacyTextAfterReadRetries() async throws {
        TransportStubURLProtocol.install { _ in .fail(.timedOut) }
        let store = ProductSearchStore(client: StoreTestClient.make())

        store.searchProducts(query: "milch", size: 50)
        try await waitUntil { !store.isSearching }

        XCTAssertEqual(store.errorMessage, "Die Anfrage hat zu lange gedauert.")
        // Bewusste Änderung: Lesende Anfragen nutzen interactiveRead (Erstversuch plus eine Wiederholung, 10 s Timeout je Versuch).
        XCTAssertEqual(TransportStubURLProtocol.requests.count, 2)
    }

    @MainActor
    func testOfflineShowsConnectionTextWithoutRetry() async throws {
        TransportStubURLProtocol.install { _ in .fail(.notConnectedToInternet) }
        let store = ProductSearchStore(client: StoreTestClient.make())

        store.searchProducts(query: "milch", size: 50)
        try await waitUntil { !store.isSearching }

        XCTAssertEqual(store.errorMessage, "Die Verbindung zum Server ist nicht verfügbar.")
        XCTAssertEqual(TransportStubURLProtocol.requests.count, 1)
    }

    @MainActor
    func testUndecodableBodyShowsLegacyDecodeText() async throws {
        TransportStubURLProtocol.install { _ in .respond(status: 200, body: Data("{\"foo\":1}".utf8)) }
        let store = ProductSearchStore(client: StoreTestClient.make())

        store.searchProducts(query: "milch", size: 50)
        try await waitUntil { !store.isSearching }

        XCTAssertEqual(store.errorMessage, "Die Produktdaten konnten nicht gelesen werden.")
        XCTAssertFalse(store.hasCompletedSearch)
    }

    @MainActor
    func testNewSearchCancelsPreviousRequestAndKeepsOnlyLatestResults() async throws {
        let body = Data("[{\"id\":40,\"name\":\"Eier\",\"price\":2.49,\"layoutCode\":\"530/1/1/1\"}]".utf8)
        TransportStubURLProtocol.install { request in
            request.url?.absoluteString.contains("q=erste") == true ? .hang : .respond(status: 200, body: body)
        }
        let store = ProductSearchStore(client: StoreTestClient.make())

        store.searchProducts(query: "erste", size: 50)
        try await waitUntil { TransportStubURLProtocol.requests.count == 1 }
        store.searchProducts(query: "eier", size: 50)
        try await waitUntil { !store.isSearching }
        try await waitUntil { TransportStubURLProtocol.stopCount >= 1 }
        try await sleep(milliseconds: 150)

        XCTAssertEqual(store.searchResults.map(\.id), [40])
        XCTAssertNil(store.errorMessage, "der abgebrochene Aufruf darf keinen Fehler setzen")
        XCTAssertEqual(store.lastQuery, "eier")
    }

    @MainActor
    func testClearSearchCancelsInFlightRequestWithoutLateError() async throws {
        TransportStubURLProtocol.install { _ in .hang }
        let store = ProductSearchStore(client: StoreTestClient.make())

        store.searchProducts(query: "milch", size: 50)
        try await waitUntil { TransportStubURLProtocol.requests.count == 1 }
        store.clearSearch()
        try await waitUntil { TransportStubURLProtocol.stopCount >= 1 }
        try await sleep(milliseconds: 150)

        XCTAssertFalse(store.isSearching)
        XCTAssertTrue(store.searchResults.isEmpty)
        XCTAssertNil(store.errorMessage)
        XCTAssertNil(store.lastQuery)
    }

    // MARK: - Helfer

    @MainActor
    private func waitUntil(timeout: TimeInterval = 3, _ condition: () -> Bool) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition() {
            if Date() > deadline {
                XCTFail("Condition not reached within \(timeout)s")
                return
            }
            try await sleep(milliseconds: 10)
        }
    }

    private func sleep(milliseconds: UInt64) async throws {
        try await Task.sleep(nanoseconds: milliseconds * 1_000_000)
    }
}
