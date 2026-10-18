import XCTest
@testable import IndooroNetworking

/// Task 6.2: Anfrageform jedes Endpoints (Methode, Pfad, Query, Timeout, Wiederholung, Body).
/// Reine URL-/Request-Bildung, kein Netzwerk.
final class EndpointRequestTests: XCTestCase {
    private let env = APIEnvironment(baseURL: URL(string: "https://example.test/api")!)
    private let storeUUID = UUID(uuidString: "AD61389A-7486-48FA-AFA2-9B5E4132F6A8")!
    private let recipeUUID = UUID(uuidString: "11111111-2222-4333-8444-555555555555")!

    private func request<E: Endpoint>(_ endpoint: E) throws -> URLRequest {
        try endpoint.urlRequest(environment: env)
    }

    private func queryItems(_ request: URLRequest) -> [URLQueryItem] {
        URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
    }

    private func value(_ name: String, in request: URLRequest) -> String? {
        queryItems(request).first { $0.name == name }?.value
    }

    // MARK: - Stores

    func testListStores() throws {
        let r = try request(ListStoresEndpoint())
        XCTAssertEqual(r.httpMethod, "GET")
        XCTAssertEqual(r.url?.absoluteString, "https://example.test/api/mobile/stores")
        XCTAssertEqual(r.timeoutInterval, 15)
        XCTAssertNil(r.httpBody)
        XCTAssertEqual(ListStoresEndpoint().retry, .idempotentRead)
    }

    func testBeaconIdentities() throws {
        let r = try request(BeaconIdentitiesEndpoint())
        XCTAssertEqual(r.httpMethod, "GET")
        XCTAssertEqual(r.url?.absoluteString, "https://example.test/api/mobile/stores/beacon-identities")
        XCTAssertEqual(r.timeoutInterval, 15)
    }

    func testStoreByBeaconWithMajorAndMinor() throws {
        let r = try request(StoreByBeaconEndpoint(uuid: "E2C56DB5DFFB48D2B060D0F5A71096E0", major: 1, minor: 7))
        XCTAssertEqual(r.httpMethod, "GET")
        XCTAssertEqual(r.url?.path, "/api/mobile/stores/by-beacon")
        XCTAssertEqual(queryItems(r), [
            URLQueryItem(name: "uuid", value: "E2C56DB5DFFB48D2B060D0F5A71096E0"),
            URLQueryItem(name: "major", value: "1"),
            URLQueryItem(name: "minor", value: "7"),
        ])
        XCTAssertEqual(r.timeoutInterval, 15)
    }

    func testStoreByBeaconOmitsMajorMinorUnlessBothSet() throws {
        let uuidOnly = try request(StoreByBeaconEndpoint(uuid: "e2c5"))
        XCTAssertEqual(queryItems(uuidOnly), [URLQueryItem(name: "uuid", value: "e2c5")])

        let majorOnly = try request(StoreByBeaconEndpoint(uuid: "e2c5", major: 1, minor: nil))
        XCTAssertEqual(queryItems(majorOnly), [URLQueryItem(name: "uuid", value: "e2c5")])
    }

    func testStoreLayoutUsesLowercaseStoreID() throws {
        let r = try request(StoreLayoutEndpoint(storeID: storeUUID))
        XCTAssertEqual(r.url?.absoluteString, "https://example.test/api/mobile/stores/ad61389a-7486-48fa-afa2-9b5e4132f6a8/layout/current")
        XCTAssertEqual(r.timeoutInterval, 20)
        XCTAssertEqual(StoreLayoutEndpoint(storeID: storeUUID).retry, .idempotentRead)
    }

    // MARK: - Layouts (Legacy und Store)

    func testCurrentLayout() throws {
        let r = try request(CurrentLayoutEndpoint())
        XCTAssertEqual(r.url?.absoluteString, "https://example.test/api/layout/current")
        XCTAssertEqual(r.timeoutInterval, 20)
    }

    func testLayoutHistoryLimit() throws {
        let r = try request(LayoutHistoryEndpoint(limit: 5))
        XCTAssertEqual(r.url?.path, "/api/layout/history")
        XCTAssertEqual(queryItems(r), [URLQueryItem(name: "limit", value: "5")])
        XCTAssertEqual(r.timeoutInterval, 20)
    }

    func testLayoutVersionPercentEncodesID() throws {
        let r = try request(LayoutVersionEndpoint(layoutID: "1718000000000"))
        XCTAssertEqual(r.url?.absoluteString, "https://example.test/api/layout/versions/1718000000000")

        let hostile = try request(LayoutVersionEndpoint(layoutID: "a/b?c#d %e"))
        XCTAssertEqual(hostile.url?.absoluteString, "https://example.test/api/layout/versions/a%2Fb%3Fc%23d%20%25e")
        XCTAssertEqual(hostile.timeoutInterval, 20)
    }

    // MARK: - Produkte

    func testProductSearchQueryOrderAndSizeBound() throws {
        let r = try request(ProductSearchEndpoint(query: "milch", size: 0, storeCode: nil))
        XCTAssertEqual(r.url?.absoluteString, "https://example.test/api/products/search?q=milch&size=1")
        XCTAssertEqual(r.timeoutInterval, 15)
        XCTAssertEqual(ProductSearchEndpoint(query: "x").retry, .idempotentRead)
    }

    func testProductSearchMatchesLegacyProductEndpointURL() throws {
        let legacy = ProductEndpoint.searchURL(base: "https://example.test/api", query: "milch", size: 50, storeCode: "SPAR-001")
        let r = try request(ProductSearchEndpoint(query: "milch", size: 50, storeCode: "SPAR-001"))
        XCTAssertEqual(r.url, legacy)
    }

    func testProductSearchTrimsAndOmitsBlankStoreCode() throws {
        let r = try request(ProductSearchEndpoint(query: "milch", size: 50, storeCode: "  SPAR-001 "))
        XCTAssertEqual(value("storeCode", in: r), "SPAR-001")
        let blank = try request(ProductSearchEndpoint(query: "milch", size: 50, storeCode: "   "))
        XCTAssertNil(value("storeCode", in: blank))
    }

    func testProductSearchEncodesReservedCharactersAndPlus() throws {
        let r = try request(ProductSearchEndpoint(query: "Milch & Käse +1", size: 50, storeCode: nil))
        XCTAssertEqual(value("q", in: r), "Milch & Käse +1", "Roundtrip der Suchzeichen")
        let absolute = r.url!.absoluteString
        XCTAssertTrue(absolute.contains("%2B1"), absolute)
        XCTAssertFalse(absolute.contains("+"), "Kein rohes + in \(absolute)")
        XCTAssertEqual(URLComponents(url: r.url!, resolvingAgainstBaseURL: false)?.queryItems?.count, 2)
    }

    func testProductListMatchesLegacyProductEndpointURL() throws {
        let legacy = ProductEndpoint.listURL(base: "https://example.test/api", size: 50, storeCode: "SPAR-001")
        let r = try request(ProductListEndpoint(size: 50, storeCode: "SPAR-001"))
        XCTAssertEqual(r.url, legacy)
        XCTAssertEqual(r.timeoutInterval, 15)

        let plain = try request(ProductListEndpoint(size: 50, storeCode: nil))
        XCTAssertEqual(plain.url, ProductEndpoint.listURL(base: "https://example.test/api", size: 50, storeCode: nil))
    }

    // MARK: - Rezepte

    func testRecipeListPagingAndTag() throws {
        let r = try request(RecipeListEndpoint(page: -1, size: 0, tag: "vegan"))
        XCTAssertEqual(r.url?.path, "/api/mobile/recipes")
        XCTAssertEqual(queryItems(r), [
            URLQueryItem(name: "page", value: "0"),
            URLQueryItem(name: "size", value: "1"),
            URLQueryItem(name: "tag", value: "vegan"),
        ])
        XCTAssertEqual(r.timeoutInterval, 15)
    }

    func testRecipeListWithoutTag() throws {
        let r = try request(RecipeListEndpoint(page: 2, size: 20))
        XCTAssertNil(value("tag", in: r))
        XCTAssertEqual(value("page", in: r), "2")
    }

    func testRecipeSearchTrimsQuery() throws {
        let r = try request(RecipeSearchEndpoint(searchText: "  Pasta ", page: 1, size: 10))
        XCTAssertEqual(r.url?.path, "/api/mobile/recipes/search")
        XCTAssertEqual(queryItems(r), [
            URLQueryItem(name: "q", value: "Pasta"),
            URLQueryItem(name: "page", value: "1"),
            URLQueryItem(name: "size", value: "10"),
        ])
        XCTAssertEqual(r.timeoutInterval, 15)
    }

    func testRecipeDetailPath() throws {
        let r = try request(RecipeDetailEndpoint(recipeID: recipeUUID))
        XCTAssertEqual(r.url?.absoluteString, "https://example.test/api/mobile/recipes/11111111-2222-4333-8444-555555555555")
        XCTAssertEqual(r.timeoutInterval, 15)
    }

    func testRecipeProductMappingQuery() throws {
        let r = try request(RecipeProductMappingEndpoint(recipeID: recipeUUID, storeID: storeUUID, storeCode: "SPAR-001"))
        XCTAssertEqual(r.url?.path, "/api/mobile/recipes/11111111-2222-4333-8444-555555555555/product-mapping")
        XCTAssertEqual(queryItems(r), [
            URLQueryItem(name: "storeId", value: "AD61389A-7486-48FA-AFA2-9B5E4132F6A8"),
            URLQueryItem(name: "storeCode", value: "SPAR-001"),
        ])
    }

    func testRecipeProductMappingWithoutStoreHasNoQuery() throws {
        let r = try request(RecipeProductMappingEndpoint(recipeID: recipeUUID))
        XCTAssertNil(r.url?.query)
    }

    // MARK: - Upsell (POST)

    func testUpsellPlanIsPostWithBodyAndNoRetry() throws {
        let endpoint = UpsellPlanEndpoint(request: .sample)
        let r = try request(endpoint)
        XCTAssertEqual(r.httpMethod, "POST")
        XCTAssertEqual(r.url?.absoluteString, "https://example.test/api/mobile/upsell/plan")
        XCTAssertEqual(r.timeoutInterval, 25)
        XCTAssertEqual(endpoint.retry, .none)
        XCTAssertEqual(r.value(forHTTPHeaderField: "Content-Type"), "application/json")

        let body = try XCTUnwrap(r.httpBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(json["source"] as? String, "tour")
        XCTAssertEqual(json["storeCode"] as? String, "SPAR-Leonding-001")
        XCTAssertNotNil(json["opportunities"] as? [Any])
        XCTAssertNil(json["latitude"], "Keine Positionsdaten im Plan-Body")
    }

    func testUpsellEventIsPostWithShortTimeoutAndNoRetry() throws {
        let endpoint = UpsellEventEndpoint(event: .sample)
        let r = try request(endpoint)
        XCTAssertEqual(r.httpMethod, "POST")
        XCTAssertEqual(r.url?.absoluteString, "https://example.test/api/mobile/upsell/events")
        XCTAssertEqual(r.timeoutInterval, 3)
        XCTAssertEqual(endpoint.retry, .none)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(r.httpBody)) as? [String: Any])
        XCTAssertEqual(json["eventType"] as? String, "shown")
    }

    func testUpsellDismissIsPostWithShortTimeoutAndNoRetry() throws {
        let endpoint = UpsellDismissEndpoint(dismissal: .sample)
        let r = try request(endpoint)
        XCTAssertEqual(r.httpMethod, "POST")
        XCTAssertEqual(r.url?.absoluteString, "https://example.test/api/mobile/upsell/dismiss")
        XCTAssertEqual(r.timeoutInterval, 3)
        XCTAssertEqual(endpoint.retry, .none)
    }

    // MARK: - Basis-URL

    func testTrailingSlashInBaseURLIsNotDoubled() throws {
        let slashed = APIEnvironment(baseURL: URL(string: "https://example.test/api/")!)
        let r = try ListStoresEndpoint().urlRequest(environment: slashed)
        XCTAssertEqual(r.url?.absoluteString, "https://example.test/api/mobile/stores")
    }

    func testEveryReadEndpointUsesIdempotentReadRetryAndNoBody() {
        // Reads sind GET: Wiederholung erlaubt, kein Body.
        XCTAssertEqual(ProductListEndpoint().method, .get)
        XCTAssertEqual(RecipeDetailEndpoint(recipeID: recipeUUID).retry, .idempotentRead)
        XCTAssertNil(LayoutHistoryEndpoint(limit: 1).body)
        XCTAssertNil(StoreByBeaconEndpoint(uuid: "x").body)
    }
}
