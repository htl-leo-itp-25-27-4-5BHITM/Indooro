import IndooroModels
import XCTest
@testable import MCindooroApp

/// Phase 5 (task 6.4): RecipeStore über den APIClient. Prüft, dass Anfragen dieselben URLs, Query-Items
/// und Timeouts haben wie vorher, und dass Fehlertexte unverändert bleiben.
@MainActor
final class RecipeStoreTests: XCTestCase {
    private let recipeID = UUID(uuidString: "11111111-2222-4333-8444-555555555555")!
    private let storeID = UUID(uuidString: "AD61389A-7486-48FA-AFA2-9B5E4132F6A8")!
    private let base = "https://example.test/api"

    override func tearDown() {
        TransportStubURLProtocol.clear()
        super.tearDown()
    }

    // MARK: - Liste

    func testListWithoutTagSendsPageAndSizeOnly() async throws {
        TransportStubURLProtocol.install { _ in .respond(status: 200, body: Data("[]".utf8)) }
        let store = RecipeStore(client: StoreTestClient.make())

        store.loadRecipes(page: 2, size: 20)
        try await waitUntil { !store.isLoading }

        let request = try XCTUnwrap(TransportStubURLProtocol.requests.first)
        XCTAssertEqual(request.url?.absoluteString, "\(base)/mobile/recipes?page=2&size=20")
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertEqual(request.timeoutInterval, 15)
        XCTAssertNil(store.errorMessage)
        XCTAssertTrue(store.recipes.isEmpty)
    }

    func testBlankTagIsNotSentAndTagIsSentUnchanged() async throws {
        TransportStubURLProtocol.install { _ in .respond(status: 200, body: Data("[]".utf8)) }
        let store = RecipeStore(client: StoreTestClient.make())

        store.loadRecipes(tag: "   ")
        try await waitUntil { !store.isLoading }
        store.loadRecipes(tag: "vegan")
        try await waitUntil { !store.isLoading }

        let requests = TransportStubURLProtocol.requests
        XCTAssertEqual(requests.count, 2)
        XCTAssertEqual(requests[0].url?.absoluteString, "\(base)/mobile/recipes?page=0&size=20")
        XCTAssertEqual(requests[1].url?.absoluteString, "\(base)/mobile/recipes?page=0&size=20&tag=vegan")
    }

    // MARK: - Suche

    func testSearchTrimsQueryAndSendsPlusUnchanged() async throws {
        TransportStubURLProtocol.install { _ in .respond(status: 200, body: Data("[]".utf8)) }
        let store = RecipeStore(client: StoreTestClient.make())

        store.searchRecipes(query: "  Pasta+Sauce ", page: 1, size: 10)
        try await waitUntil { !store.isSearching }

        XCTAssertEqual(
            TransportStubURLProtocol.requests.first?.url?.absoluteString,
            "\(base)/mobile/recipes/search?q=Pasta+Sauce&page=1&size=10"
        )
    }

    func testShortSearchFallsBackToList() async throws {
        TransportStubURLProtocol.install { _ in .respond(status: 200, body: Data("[]".utf8)) }
        let store = RecipeStore(client: StoreTestClient.make())

        store.searchRecipes(query: " a ")
        try await waitUntil { !store.isLoading }

        XCTAssertEqual(
            TransportStubURLProtocol.requests.first?.url?.absoluteString,
            "\(base)/mobile/recipes?page=0&size=20"
        )
    }

    func testListTimeoutClearsRecipesAndShowsLegacyTextAfterReadRetries() async throws {
        TransportStubURLProtocol.install { _ in .fail(.timedOut) }
        let store = RecipeStore(client: StoreTestClient.make())

        store.loadRecipes()
        try await waitUntil { !store.isLoading }

        XCTAssertEqual(store.errorMessage, "Die Anfrage hat zu lange gedauert.")
        XCTAssertTrue(store.recipes.isEmpty)
        // Bewusste Änderung: lesende Anfragen nutzen idempotentRead (Erstversuch plus zwei Wiederholungen).
        XCTAssertEqual(TransportStubURLProtocol.requests.count, 3)
    }

    func testLatestSearchWinsOverSlowerEarlierResponse() async throws {
        TransportStubURLProtocol.install { request in
            request.url?.absoluteString.contains("q=alt") == true
                ? .delayed(seconds: 0.3, status: 500, body: Data())
                : .respond(status: 200, body: Data("[]".utf8))
        }
        let store = RecipeStore(client: StoreTestClient.make())

        store.searchRecipes(query: "alt")
        store.searchRecipes(query: "neu")
        try await waitUntil { !store.isSearching }
        try await sleep(milliseconds: 500)

        XCTAssertNil(store.errorMessage, "die veraltete Antwort darf keinen Fehler setzen")
        XCTAssertFalse(store.isSearching)
    }

    // MARK: - Detail

    func testDetailUsesRecipePathWithTimeoutAndStatusText() async throws {
        TransportStubURLProtocol.install { _ in .respond(status: 404, body: Data("{\"error\":\"Intern\"}".utf8)) }
        let store = RecipeStore(client: StoreTestClient.make())

        store.loadRecipe(id: recipeID)
        try await waitUntil { !store.isLoadingDetail }

        let request = try XCTUnwrap(TransportStubURLProtocol.requests.first)
        XCTAssertEqual(request.url?.absoluteString, "\(base)/mobile/recipes/\(recipeID.uuidString)")
        XCTAssertEqual(request.timeoutInterval, 15)
        XCTAssertEqual(store.errorMessage, "Der Server meldet einen Fehler (HTTP 404).")
        XCTAssertNil(store.selectedRecipe)
        XCTAssertEqual(TransportStubURLProtocol.requests.count, 1)
    }

    // MARK: - Zuordnung

    func testMappingWithStoreSendsStoreIdAndStoreCode() async throws {
        TransportStubURLProtocol.install { _ in .respond(status: 500, body: Data()) }
        let store = RecipeStore(client: StoreTestClient.make())
        let mobileStore = MobileStoreSummary(id: storeID, storeCode: "HA-01", name: "Test Markt", city: "Linz")

        store.loadMapping(recipeId: recipeID, store: mobileStore)
        try await waitUntil { !store.isLoadingMapping }

        let request = try XCTUnwrap(TransportStubURLProtocol.requests.first)
        XCTAssertEqual(
            request.url?.absoluteString,
            "\(base)/mobile/recipes/\(recipeID.uuidString)/product-mapping?storeId=\(storeID.uuidString)&storeCode=HA-01"
        )
        XCTAssertEqual(request.timeoutInterval, 15)
        XCTAssertEqual(store.errorMessage, "Der Server meldet einen Fehler (HTTP 500).")
        XCTAssertEqual(TransportStubURLProtocol.requests.count, 1, "500 ist nicht wiederholbar")
    }

    func testMappingWithoutStoreHasNoQuery() async throws {
        TransportStubURLProtocol.install { _ in .respond(status: 200, body: Data("{}".utf8)) }
        let store = RecipeStore(client: StoreTestClient.make())

        store.loadMapping(recipeId: recipeID, store: nil)
        try await waitUntil { !store.isLoadingMapping }

        XCTAssertEqual(
            TransportStubURLProtocol.requests.first?.url?.absoluteString,
            "\(base)/mobile/recipes/\(recipeID.uuidString)/product-mapping"
        )
    }

    // MARK: - Helfer

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
