import XCTest
@testable import IndooroNetworking

/// Dekodiert die Fixtures aus `SP/Fixtures` ueber den echten `APIClient`-Pfad (Stub-Transport).
/// Ergaenzt `GeneratedContractDecodingTests`, das den Decoder direkt prueft.
final class EndpointFixtureDecodingTests: XCTestCase {
    override func tearDown() {
        StubRegistry.script = nil
        super.tearDown()
    }

    private func client(serving fixture: String, status: Int = 200) throws -> (APIClient, StubScript) {
        let script = StubScript()
        script.enqueue([.respond(status: status, body: try fixtureData(fixture))])
        return (StubClient.make(script: script), script)
    }

    func testStoresFixture() async throws {
        let (client, _) = try client(serving: "stores.json")
        let stores = try await client.send(ListStoresEndpoint())

        XCTAssertEqual(stores.count, 4)
        XCTAssertEqual(stores.first?.storeCode, "SPAR-Leonding-001")
        XCTAssertEqual(stores.first?.latitude ?? 0, 48.2680495, accuracy: 1e-7)
    }

    func testProductSearchFixture() async throws {
        let (client, script) = try client(serving: "products-search-milch.json")
        let products = try await client.send(ProductSearchEndpoint(query: "milch", size: 50, storeCode: "SPAR-Leonding-001"))

        XCTAssertEqual(products.map(\.id), [92, 93])
        XCTAssertEqual(products.first?.name, "Naturpur Bio-Milch 1L")
        XCTAssertEqual(script.recordedRequests.first?.url?.query?.contains("storeCode=SPAR-Leonding-001"), true)
    }

    func testRecipeListFixture() async throws {
        let (client, _) = try client(serving: "recipes.json")
        let page = try await client.send(RecipeListEndpoint(page: 0, size: 20))

        XCTAssertEqual(page.content.count, 20)
        XCTAssertEqual(page.totalElements, 26)
        XCTAssertEqual(page.content.first?.status?.rawValue, "PUBLISHED")
    }

    func testRecipeDetailFixture() async throws {
        let (client, _) = try client(serving: "recipe-detail.json")
        let detail = try await client.send(RecipeDetailEndpoint(recipeID: UUID(uuidString: "00000000-0000-0000-0000-000000000119")!))

        XCTAssertEqual(detail.id, "00000000-0000-0000-0000-000000000119")
        XCTAssertEqual(detail.title, "Apfel-Hafer-Crumble")
        XCTAssertEqual(detail.servings, 4)
    }

    func testRecipeProductMappingFixture() async throws {
        let (client, _) = try client(serving: "recipe-product-mapping.json")
        let mapping = try await client.send(RecipeProductMappingEndpoint(
            recipeID: UUID(uuidString: "00000000-0000-0000-0000-000000000119")!,
            storeID: UUID(uuidString: "AD61389A-7486-48FA-AFA2-9B5E4132F6A8")!
        ))

        XCTAssertEqual(mapping.recipeId, "00000000-0000-0000-0000-000000000119")
        XCTAssertFalse(mapping.ingredients?.isEmpty ?? true)
        XCTAssertEqual(mapping.ingredients?.first?.status?.rawValue, "MAPPED")
    }

    func testUpsellPlanFixture() async throws {
        let script = StubScript()
        script.enqueue([.respond(status: 200, body: try fixtureData("upsell-plan.json"))])
        let client = StubClient.make(script: script)

        let plan = try await client.send(UpsellPlanEndpoint(request: .sample))

        XCTAssertEqual(plan.opportunities?.count, 1)
        XCTAssertEqual(plan.opportunities?.first?.suggestions?.first?.product?.id, 93)
        XCTAssertEqual(plan.source?.rawValue, "openai")
        XCTAssertNotNil(plan.expiresAt)
    }

    /// Layouts bleiben unveraendert: `RawJSON` liefert exakt die Bytes der Antwort.
    func testStoreLayoutFixtureIsPassedThroughUnchanged() async throws {
        let bytes = try fixtureData("store-layout-current.json")
        let script = StubScript()
        script.enqueue([.respond(status: 200, body: bytes)])
        let client = StubClient.make(script: script)

        let raw = try await client.send(StoreLayoutEndpoint(storeID: UUID(uuidString: "AD61389A-7486-48FA-AFA2-9B5E4132F6A8")!))

        XCTAssertEqual(raw.data, bytes)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: raw.data) as? [String: Any])
        XCTAssertEqual(object["layoutId"] as? String, "66f0d81f-7abe-4552-b572-b4e5bb6d501b")
    }

    func testEmptyResponseIgnoresBody() async throws {
        let script = StubScript()
        script.enqueue([.respond(status: 200, body: Data("{\"accepted\":true}".utf8))])
        let client = StubClient.make(script: script)

        let response = try await client.send(UpsellEventEndpoint(event: .sample))

        XCTAssertEqual(response, EmptyResponse())
    }

    func testRawJSONFallbackDecodingRoundTrips() throws {
        let raw = try JSONDecoder().decode(RawJSON.self, from: Data(#"{"a":1,"b":[true,null,"x"]}"#.utf8))
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: raw.data) as? [String: Any])

        XCTAssertEqual(object["a"] as? Int, 1)
        XCTAssertEqual((object["b"] as? [Any])?.count, 3)
    }
}
