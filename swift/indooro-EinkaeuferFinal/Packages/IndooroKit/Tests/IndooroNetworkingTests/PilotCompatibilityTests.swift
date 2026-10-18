import XCTest
@testable import IndooroNetworking

/// Phase 5 (task 6.4): Endpoints, die die Stores der Pilot-App ersetzen, muessen dieselben URLs,
/// Timeouts und Wiederholungsregeln liefern wie der bisherige Code, und ihre Antworten muessen
/// unveraendert als Bytes ankommen (die App dekodiert tolerant selbst).
final class PilotCompatibilityTests: XCTestCase {
    private let env = APIEnvironment(baseURL: URL(string: "https://example.test/api")!)
    private let storeUUID = UUID(uuidString: "AD61389A-7486-48FA-AFA2-9B5E4132F6A8")!
    private let recipeUUID = UUID(uuidString: "11111111-2222-4333-8444-555555555555")!

    override func tearDown() {
        StubRegistry.script = nil
        super.tearDown()
    }

    // MARK: - Produkt-Sammelroute (PilotSearchURL)

    func testProductCollectionURLMatchesPilotSearchURL() throws {
        let cases: [(query: String?, size: Int, storeID: UUID?, storeCode: String?)] = [
            ("milch", 50, storeUUID, "HA-01"),
            (nil, 500, nil, "SPAR-001"),
            ("Milch & Käse +1", 50, nil, nil),
            (nil, 500, storeUUID, nil),
            ("milch", 0, nil, "  SPAR-001 "),
        ]
        for item in cases {
            let endpoint = ProductCollectionEndpoint(
                searchText: item.query,
                size: item.size,
                storeID: item.storeID,
                storeCode: item.storeCode
            )
            let legacy = PilotSearchURL.make(
                base: env.baseURL,
                query: item.query,
                size: item.size,
                storeID: item.storeID,
                storeCode: ProductEndpoint.normalizedStoreCode(item.storeCode)
            )
            XCTAssertEqual(try endpoint.urlRequest(environment: env).url, legacy, "\(item)")
        }
    }

    func testProductCollectionPathsTimeoutAndRetryPolicy() throws {
        let search = ProductCollectionEndpoint(searchText: "milch", size: 50)
        let list = ProductCollectionEndpoint(searchText: nil, size: 500)

        let searchRequest = try search.urlRequest(environment: env)
        XCTAssertEqual(searchRequest.url?.path, "/api/products/search")
        XCTAssertEqual(searchRequest.httpMethod, "GET")
        XCTAssertEqual(searchRequest.timeoutInterval, 15)
        XCTAssertEqual(search.retry, .idempotentRead)

        let listRequest = try list.urlRequest(environment: env)
        XCTAssertEqual(listRequest.url?.path, "/api/products")
        XCTAssertEqual(listRequest.url?.absoluteString, "https://example.test/api/products?size=500")
        XCTAssertEqual(list.retry, .idempotentRead)
    }

    // MARK: - Rezept-Routen (URLComponents ohne `+`-Nachbearbeitung)

    func testRecipeListMatchesLegacyURLComponentsAndKeepsPlus() throws {
        var legacy = URLComponents(string: "https://example.test/api/mobile/recipes")
        legacy?.queryItems = [
            URLQueryItem(name: "page", value: "2"),
            URLQueryItem(name: "size", value: "20"),
            URLQueryItem(name: "tag", value: "a+b"),
        ]
        let request = try RecipeListEndpoint(page: 2, size: 20, tag: "a+b").urlRequest(environment: env)

        XCTAssertEqual(request.url, legacy?.url)
        XCTAssertTrue(request.url?.absoluteString.hasSuffix("&tag=a+b") ?? false, request.url?.absoluteString ?? "nil")
    }

    func testRecipeSearchKeepsPlusRawAsBefore() throws {
        var legacy = URLComponents(string: "https://example.test/api/mobile/recipes/search")
        legacy?.queryItems = [
            URLQueryItem(name: "q", value: "Pasta+Sauce"),
            URLQueryItem(name: "page", value: "0"),
            URLQueryItem(name: "size", value: "20"),
        ]
        let request = try RecipeSearchEndpoint(searchText: "Pasta+Sauce").urlRequest(environment: env)

        XCTAssertEqual(request.url, legacy?.url)
        XCTAssertTrue(request.url?.absoluteString.contains("q=Pasta+Sauce") ?? false)
    }

    func testRecipeProductMappingWithoutStoreMatchesLegacyURL() throws {
        let request = try RecipeProductMappingEndpoint(recipeID: recipeUUID).urlRequest(environment: env)

        XCTAssertEqual(request.url?.absoluteString, "https://example.test/api/mobile/recipes/\(recipeUUID.uuidString)/product-mapping")
    }

    func testRecipeDetailKeepsPlusEncodingDefault() {
        XCTAssertTrue(RecipeDetailEndpoint(recipeID: recipeUUID).encodesPlusInQuery)
        XCTAssertFalse(RecipeListEndpoint().encodesPlusInQuery)
        XCTAssertFalse(RecipeSearchEndpoint(searchText: "x").encodesPlusInQuery)
        XCTAssertFalse(RecipeProductMappingEndpoint(recipeID: recipeUUID).encodesPlusInQuery)
    }

    // MARK: - Rohe Antworten

    func testRawResponseReturnsBytesUnchanged() async throws {
        let body = Data(" [ {\"id\": 1,  \"name\":\"Milch\"} ]\n".utf8)
        let script = StubScript()
        script.enqueue([.respond(status: 200, body: body)])
        let client = StubClient.make(script: script)

        let raw = try await client.send(ProductCollectionEndpoint(searchText: "milch", size: 50))

        XCTAssertEqual(raw.data, body)
    }

    func testAsRawKeepsRequestPropertiesAndReturnsBytes() async throws {
        let body = Data("{\"content\":[],\"totalElements\":0}".utf8)
        let script = StubScript()
        script.enqueue([.respond(status: 200, body: body)])
        let client = StubClient.make(script: script)
        let endpoint = RecipeListEndpoint(page: 1, size: 5, tag: "vegan")

        let raw = try await client.send(endpoint.asRaw)

        XCTAssertEqual(raw.data, body)
        let expected = try endpoint.urlRequest(environment: env)
        let actual = try endpoint.asRaw.urlRequest(environment: env)
        XCTAssertEqual(actual.url, expected.url)
        XCTAssertEqual(actual.httpMethod, expected.httpMethod)
        XCTAssertEqual(actual.timeoutInterval, expected.timeoutInterval)
        XCTAssertEqual(endpoint.asRaw.retry, .idempotentRead)
        XCTAssertEqual(script.recordedRequests.first?.url, expected.url)
    }

    func testSendResultReturnsSuccessAndFailureWithoutThrowing() async throws {
        let script = StubScript()
        script.enqueue([
            .respond(status: 200, body: Data("[]".utf8)),
            .respond(status: 404, body: Data("{\"error\":\"Nicht gefunden\"}".utf8)),
        ])
        let client = StubClient.make(script: script)

        let success = await client.sendResult(ProductCollectionEndpoint(searchText: nil, size: 500))
        XCTAssertEqual(try success.get().data, Data("[]".utf8))

        let failure = await client.sendResult(ProductCollectionEndpoint(searchText: nil, size: 500))
        guard case .failure(let error) = failure else {
            return XCTFail("Fehler erwartet")
        }
        XCTAssertEqual(error, .http(status: 404, message: "Nicht gefunden"))
    }

    // MARK: - Upsell (POST, Body der App-Modelle)

    func testUpsellPlanGenericBodyIsEncodedLikeTheAppModel() throws {
        let body = SampleBody(name: "Milch", ids: [92, 93])
        let request = try UpsellPlanEndpoint(body: body).urlRequest(environment: env)

        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.httpBody, try JSONEncoder().encode(body))
        XCTAssertEqual(request.timeoutInterval, 25)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
        XCTAssertEqual(UpsellPlanEndpoint(body: body).retry, .none)
    }

    func testUpsellPlanIsNeverRetriedByTheClient() async throws {
        let script = StubScript()
        script.enqueue([.respond(status: 503), .respond(status: 200, body: Data("{}".utf8))])
        let sleeper = RecordingSleeper()
        let client = StubClient.make(script: script, sleeper: sleeper)

        await assertThrowsAPIError(.http(status: 503, message: nil)) {
            _ = try await client.send(UpsellPlanEndpoint(body: SampleBody(name: "x", ids: [])).asRaw)
        }
        XCTAssertEqual(script.requestCount, 1)
        let durations = await sleeper.durations
        XCTAssertTrue(durations.isEmpty)
    }

    func testUpsellEventIsFireAndForgetWithThreeSecondTimeout() async throws {
        let script = StubScript()
        script.enqueue([.respond(status: 503)])
        let sleeper = RecordingSleeper()
        let client = StubClient.make(script: script, sleeper: sleeper)

        await client.fire(UpsellEventEndpoint(body: SampleBody(name: "shown", ids: [])))

        XCTAssertEqual(script.requestCount, 1)
        XCTAssertEqual(script.recordedRequests.first?.httpMethod, "POST")
        XCTAssertEqual(script.recordedRequests.first?.timeoutInterval, 3)
        let durations = await sleeper.durations
        XCTAssertTrue(durations.isEmpty)
    }

    // MARK: - Helfer

    private struct SampleBody: Encodable, Sendable {
        let name: String
        let ids: [Int]
    }

    private func assertThrowsAPIError(_ expected: APIError, file: StaticString = #filePath, line: UInt = #line, _ operation: () async throws -> Void) async {
        do {
            try await operation()
            XCTFail("APIError \(expected) erwartet", file: file, line: line)
        } catch let error as APIError {
            XCTAssertEqual(error, expected, file: file, line: line)
        } catch {
            XCTFail("Unerwarteter Fehler \(error)", file: file, line: line)
        }
    }
}
