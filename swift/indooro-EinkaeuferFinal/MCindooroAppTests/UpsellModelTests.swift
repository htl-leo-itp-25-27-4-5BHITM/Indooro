import IndooroModels
import XCTest
@testable import MCindooroApp

/// Answers plan requests with canned responses and records them. Other requests (upsell events) get 204.
final class UpsellStubURLProtocol: URLProtocol {
    private static let lock = NSLock()
    private static var planResponder: ((Int) -> (status: Int, body: Data))?
    private static var planBodies: [Data?] = []
    private static var eventCount = 0
    private static var recorded: [URLRequest] = []

    static func reset(planResponder: @escaping (Int) -> (status: Int, body: Data)) {
        lock.lock()
        defer { lock.unlock() }
        self.planResponder = planResponder
        planBodies = []
        eventCount = 0
        recorded = []
    }

    /// Alle Anfragen (Plan und Telemetrie) in Reihenfolge, mit Methode und Timeout.
    static func recordedRequests() -> [URLRequest] {
        lock.lock()
        defer { lock.unlock() }
        return recorded
    }

    static func clear() {
        lock.lock()
        defer { lock.unlock() }
        planResponder = nil
        planBodies = []
        eventCount = 0
    }

    static func planRequestCount() -> Int {
        lock.lock()
        defer { lock.unlock() }
        return planBodies.count
    }

    static func planRequestBodies() -> [Data?] {
        lock.lock()
        defer { lock.unlock() }
        return planBodies
    }

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        let path = request.url?.path ?? ""
        let isPlan = path.hasSuffix("/mobile/upsell/plan")
        let (status, body): (Int, Data)
        Self.lock.lock()
        Self.recorded.append(request)
        if isPlan {
            let index = Self.planBodies.count
            Self.planBodies.append(Self.body(of: request))
            let responder = Self.planResponder
            Self.lock.unlock()
            (status, body) = responder?(index) ?? (500, Data())
        } else {
            Self.eventCount += 1
            Self.lock.unlock()
            (status, body) = (204, Data())
        }

        guard let url = request.url,
              let response = HTTPURLResponse(
                url: url,
                statusCode: status,
                httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": "application/json"]
              ) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    /// URLSession hands the body to URLProtocol as a stream, so `httpBody` is usually nil here.
    private static func body(of request: URLRequest) -> Data? {
        if let body = request.httpBody {
            return body
        }
        guard let stream = request.httpBodyStream else {
            return nil
        }
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let read = stream.read(&buffer, maxLength: buffer.count)
            if read <= 0 {
                break
            }
            data.append(buffer, count: read)
        }
        return data
    }
}

/// Store-level lifecycle tests for UpsellModel (sections 9 to 11 of the upsell quality change).
/// Pure rules are covered in SwiftPM (UpsellPlanLogicTests); these tests check the wiring with a stubbed transport.
final class UpsellModelTests: XCTestCase {
    private var session: URLSession!
    private let mobileStoreID = UUID(uuidString: "aaaaaaaa-0000-4000-8000-000000000001")!

    override func setUp() {
        super.setUp()
        // Feature profile is read from UserDefaults in DEBUG builds; tests run as Debug.
        UserDefaults.standard.set("full", forKey: AppEnvironment.profileOverrideKey)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [UpsellStubURLProtocol.self]
        session = URLSession(configuration: configuration)
        UpsellStubURLProtocol.reset { _ in (500, Data()) }
    }

    override func tearDown() {
        session.invalidateAndCancel()
        session = nil
        UpsellStubURLProtocol.clear()
        UserDefaults.standard.removeObject(forKey: AppEnvironment.profileOverrideKey)
        super.tearDown()
    }

    // MARK: - Retry (10.x)

    @MainActor
    func testCandidateLookupFailureRetriesExactlyOnce() async throws {
        let milk = makeItem(92, name: "Bio-Milch")
        let list = makeList([milk])
        let mobileStore = makeStore()
        let opportunityID = UpsellModel.itemOpportunityId(for: milk)
        UpsellStubURLProtocol.reset { _ in (200, Self.lookupFailureJSON(opportunityID: opportunityID)) }
        let store = UpsellModel(session: session, retryDelay: 0.05)

        store.authorizePlanPreloading(for: mobileStore, reason: "test")
        store.preloadPlan(for: list, stops: [], store: mobileStore, source: "shopping_list")

        try await waitUntil { UpsellStubURLProtocol.planRequestCount() == 2 && !store.isLoading }
        try await sleep(milliseconds: 250)
        XCTAssertEqual(UpsellStubURLProtocol.planRequestCount(), 2, "one initial request plus exactly one retry")

        // The retry budget for this signature is spent: an explicit preload must not send a third request.
        store.preloadPlan(for: list, stops: [], store: mobileStore, source: "shopping_list")
        try await sleep(milliseconds: 150)
        XCTAssertEqual(UpsellStubURLProtocol.planRequestCount(), 2)
    }

    @MainActor
    func testResetCancelsScheduledRetry() async throws {
        let milk = makeItem(92, name: "Bio-Milch")
        let list = makeList([milk])
        let mobileStore = makeStore()
        let opportunityID = UpsellModel.itemOpportunityId(for: milk)
        UpsellStubURLProtocol.reset { _ in (200, Self.lookupFailureJSON(opportunityID: opportunityID)) }
        let store = UpsellModel(session: session, retryDelay: 0.5)

        store.authorizePlanPreloading(for: mobileStore, reason: "test")
        store.preloadPlan(for: list, stops: [], store: mobileStore, source: "shopping_list")
        try await waitUntil { UpsellStubURLProtocol.planRequestCount() == 1 && !store.isLoading }

        store.resetSession()
        try await sleep(milliseconds: 800)

        XCTAssertEqual(UpsellStubURLProtocol.planRequestCount(), 1, "the scheduled retry must not run after reset")
    }

    // MARK: - Handled lifecycle (9.x, 11.6, 11.7)

    @MainActor
    func testAIEmptyCompletionIsHandledAndNeverRetriedOrReplanned() async throws {
        let milk = makeItem(92, name: "Bio-Milch")
        let list = makeList([milk])
        let mobileStore = makeStore()
        let opportunityID = UpsellModel.itemOpportunityId(for: milk)
        UpsellStubURLProtocol.reset { _ in (200, Self.aiEmptyJSON(opportunityID: opportunityID)) }
        let store = UpsellModel(session: session, retryDelay: 0.05)

        store.authorizePlanPreloading(for: mobileStore, reason: "test")
        store.preloadPlan(for: list, stops: [], store: mobileStore, source: "shopping_list")
        try await waitUntil { UpsellStubURLProtocol.planRequestCount() == 1 && !store.isLoading }
        try await sleep(milliseconds: 150)
        XCTAssertEqual(UpsellStubURLProtocol.planRequestCount(), 1, "a successful AI-empty result is never retried")

        // Complete the item: loaded-empty cache hit, no popup, and the opportunity becomes handled.
        store.showOpportunity(
            opportunityId: opportunityID,
            checkedItems: [milk],
            list: list,
            store: mobileStore,
            source: "shopping_list"
        )
        XCTAssertNil(store.activePrompt)

        // Reopen/recomplete and progress callbacks: no new OpenAI-backed request for the same identity.
        store.preloadPlan(for: list, stops: [], store: mobileStore, source: "shopping_list")
        store.preloadPlan(for: list, stops: [], store: mobileStore, source: "shopping_session")
        try await sleep(milliseconds: 150)
        XCTAssertEqual(UpsellStubURLProtocol.planRequestCount(), 1)
    }

    @MainActor
    func testResetAllowsIntendedOpportunityToPlanAgain() async throws {
        let milk = makeItem(92, name: "Bio-Milch")
        let list = makeList([milk])
        let mobileStore = makeStore()
        let opportunityID = UpsellModel.itemOpportunityId(for: milk)
        UpsellStubURLProtocol.reset { _ in (200, Self.aiEmptyJSON(opportunityID: opportunityID)) }
        let store = UpsellModel(session: session, retryDelay: 0.05)

        store.authorizePlanPreloading(for: mobileStore, reason: "test")
        store.preloadPlan(for: list, stops: [], store: mobileStore, source: "shopping_list")
        try await waitUntil { UpsellStubURLProtocol.planRequestCount() == 1 && !store.isLoading }
        store.showOpportunity(
            opportunityId: opportunityID,
            checkedItems: [milk],
            list: list,
            store: mobileStore,
            source: "shopping_list"
        )

        store.resetSession()
        store.authorizePlanPreloading(for: mobileStore, reason: "test_restart")
        store.preloadPlan(for: list, stops: [], store: mobileStore, source: "shopping_list")

        try await waitUntil { UpsellStubURLProtocol.planRequestCount() == 2 && !store.isLoading }
    }

    // MARK: - Canonical payload and addedFromUpsell (8.4, 8.6, 11.4)

    @MainActor
    func testPlanIsPostWithLegacyTimeoutAndIsNeverRetriedByTheClient() async throws {
        let milk = makeItem(92, name: "Bio-Milch")
        let list = makeList([milk])
        let mobileStore = makeStore()
        UpsellStubURLProtocol.reset { _ in (503, Data()) }
        let store = UpsellModel(session: session, retryDelay: 0.05)

        store.authorizePlanPreloading(for: mobileStore, reason: "test")
        store.preloadPlan(for: list, stops: [], store: mobileStore, source: "shopping_list")
        try await waitUntil { UpsellStubURLProtocol.planRequestCount() == 1 && !store.isLoading }
        try await sleep(milliseconds: 300)

        XCTAssertEqual(UpsellStubURLProtocol.planRequestCount(), 1, "POST wird vom Client nie wiederholt")
        let plan = try XCTUnwrap(UpsellStubURLProtocol.recordedRequests().first { $0.url?.path.hasSuffix("/mobile/upsell/plan") == true })
        XCTAssertEqual(plan.httpMethod, "POST")
        XCTAssertEqual(plan.timeoutInterval, 25)
        XCTAssertEqual(plan.value(forHTTPHeaderField: "Content-Type"), "application/json")
    }

    @MainActor
    func testFailedPlanReportsFailedEventWithShortTimeout() async throws {
        let milk = makeItem(92, name: "Bio-Milch")
        let list = makeList([milk])
        let mobileStore = makeStore()
        UpsellStubURLProtocol.reset { _ in (503, Data()) }
        let store = UpsellModel(session: session, retryDelay: 0.05)

        store.authorizePlanPreloading(for: mobileStore, reason: "test")
        store.preloadPlan(for: list, stops: [], store: mobileStore, source: "shopping_list")
        try await waitUntil {
            UpsellStubURLProtocol.recordedRequests().contains { $0.url?.path.hasSuffix("/mobile/upsell/events") == true }
        }

        let event = try XCTUnwrap(UpsellStubURLProtocol.recordedRequests().first { $0.url?.path.hasSuffix("/mobile/upsell/events") == true })
        XCTAssertEqual(event.httpMethod, "POST")
        XCTAssertEqual(event.timeoutInterval, 3)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(Self.body(of: event))) as? [String: Any])
        XCTAssertEqual(json["eventType"] as? String, "failed")
        XCTAssertEqual((json["metadataJson"] as? String)?.contains("http_or_decode"), true)
    }

    @MainActor
    func testPayloadUsesCanonicalStateAndExcludesUpsellItemsFromTriggers() async throws {
        let milk = makeItem(92, name: "Bio-Milch")
        let duplicateMilkDone = makeItem(92, name: "Bio-Milch", status: .done)
        let eggs = makeItem(40, name: "Eier", status: .done)
        let upsellBread = makeItem(93, name: "Brot", fromUpsell: true)
        let list = makeList([milk, duplicateMilkDone, eggs, upsellBread])
        let mobileStore = makeStore()
        let opportunityID = UpsellModel.itemOpportunityId(for: milk)
        UpsellStubURLProtocol.reset { _ in (200, Self.aiEmptyJSON(opportunityID: opportunityID)) }
        let store = UpsellModel(session: session, retryDelay: 0.05)

        store.authorizePlanPreloading(for: mobileStore, reason: "test")
        store.preloadPlan(for: list, stops: [], store: mobileStore, source: "shopping_list")
        try await waitUntil { UpsellStubURLProtocol.planRequestCount() == 1 && !store.isLoading }

        let body = try XCTUnwrap(UpsellStubURLProtocol.planRequestBodies().first ?? nil)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        // Open precedence: 92 is open (and also done in a duplicate row), so it is only in the current set.
        // The open upsell item 93 stays in the current set as before; it is excluded from triggers only.
        XCTAssertEqual(json["currentListProductIds"] as? [Int], [92, 93])
        XCTAssertEqual(json["completedProductIds"] as? [Int], [40])
        let opportunities = try XCTUnwrap(json["opportunities"] as? [[String: Any]])
        XCTAssertEqual(opportunities.count, 1, "the addedFromUpsell item must not become a trigger")
        XCTAssertEqual(opportunities.first?["triggerProductIds"] as? [Int], [92])
    }

    // MARK: - Model state (10.4, 13.3)

    @MainActor
    func testRateLimitedPlanYieldsNoSuggestionsAndIsNeverRetried() async throws {
        let milk = makeItem(92, name: "Bio-Milch")
        let list = makeList([milk])
        let mobileStore = makeStore()
        UpsellStubURLProtocol.reset { _ in (429, Data()) }
        let model = UpsellModel(session: session, retryDelay: 0.05)

        model.authorizePlanPreloading(for: mobileStore, reason: "test")
        model.preloadPlan(for: list, stops: [], store: mobileStore, source: "shopping_list")
        try await waitUntil { UpsellStubURLProtocol.planRequestCount() == 1 && !model.isLoading }
        try await sleep(milliseconds: 300)

        model.showOpportunity(
            opportunityId: UpsellModel.itemOpportunityId(for: milk),
            checkedItems: [milk],
            list: list,
            store: mobileStore,
            source: "shopping_list"
        )
        XCTAssertNil(model.activePrompt, "429 means empty suggestions")
        XCTAssertEqual(UpsellStubURLProtocol.planRequestCount(), 1, "429 is not retried")
    }

    @MainActor
    func testLoadedPlanIsServedFromCacheOnceWithoutNewRequest() async throws {
        let milk = makeItem(92, name: "Bio-Milch")
        let list = makeList([milk])
        let mobileStore = makeStore()
        let opportunityID = UpsellModel.itemOpportunityId(for: milk)
        UpsellStubURLProtocol.reset { _ in (200, Self.suggestionJSON([(opportunityID, 92, 200)])) }
        let model = UpsellModel(session: session, retryDelay: 0.05)

        model.authorizePlanPreloading(for: mobileStore, reason: "test")
        model.preloadPlan(for: list, stops: [], store: mobileStore, source: "shopping_list")
        try await waitUntil { UpsellStubURLProtocol.planRequestCount() == 1 && !model.isLoading }

        model.showOpportunity(opportunityId: opportunityID, checkedItems: [milk], list: list, store: mobileStore, source: "shopping_list")
        XCTAssertEqual(model.activePrompt?.opportunityId, opportunityID)
        XCTAssertEqual(model.activePrompt?.suggestions.map(\.product.id), [200])

        model.clearPrompt()
        model.showOpportunity(opportunityId: opportunityID, checkedItems: [milk], list: list, store: mobileStore, source: "shopping_list")
        XCTAssertNil(model.activePrompt, "the cached plan is consumed by the first prompt")
        XCTAssertEqual(UpsellStubURLProtocol.planRequestCount(), 1)
        // Let the fire-and-forget "shown" event finish before tearDown invalidates the session.
        try await sleep(milliseconds: 200)
    }

    @MainActor
    func testOpportunityRequestedWhilePlanIsLoadingIsShownWhenPlanArrives() async throws {
        let milk = makeItem(92, name: "Bio-Milch")
        let list = makeList([milk])
        let mobileStore = makeStore()
        let opportunityID = UpsellModel.itemOpportunityId(for: milk)
        UpsellStubURLProtocol.reset { _ in (200, Self.suggestionJSON([(opportunityID, 92, 200)])) }
        let model = UpsellModel(session: session, retryDelay: 0.05)

        model.authorizePlanPreloading(for: mobileStore, reason: "test")
        model.preloadPlan(for: list, stops: [], store: mobileStore, source: "shopping_list")
        model.showOpportunity(opportunityId: opportunityID, checkedItems: [milk], list: list, store: mobileStore, source: "shopping_list")
        XCTAssertNil(model.activePrompt, "plan not loaded yet: opportunity stays pending")

        try await waitUntil { model.activePrompt != nil }
        XCTAssertEqual(model.activePrompt?.opportunityId, opportunityID)
        // Let the fire-and-forget "shown" event finish before tearDown invalidates the session.
        try await sleep(milliseconds: 200)
    }

    @MainActor
    func testSecondPromptWithinCooldownIsThrottled() async throws {
        let milk = makeItem(92, name: "Bio-Milch")
        let eggs = makeItem(40, name: "Eier")
        let list = makeList([milk, eggs])
        let mobileStore = makeStore()
        let milkID = UpsellModel.itemOpportunityId(for: milk)
        let eggsID = UpsellModel.itemOpportunityId(for: eggs)
        UpsellStubURLProtocol.reset { _ in (200, Self.suggestionJSON([(milkID, 92, 200), (eggsID, 40, 201)])) }
        let model = UpsellModel(session: session, retryDelay: 0.05)

        model.authorizePlanPreloading(for: mobileStore, reason: "test")
        model.preloadPlan(for: list, stops: [], store: mobileStore, source: "shopping_list")
        try await waitUntil { UpsellStubURLProtocol.planRequestCount() == 1 && !model.isLoading }

        model.showOpportunity(opportunityId: milkID, checkedItems: [milk], list: list, store: mobileStore, source: "shopping_list")
        XCTAssertNotNil(model.activePrompt)
        model.clearPrompt()

        model.showOpportunity(opportunityId: eggsID, checkedItems: [eggs], list: list, store: mobileStore, source: "shopping_list")
        XCTAssertNil(model.activePrompt, "8 s cooldown between prompts")
        // Let the fire-and-forget "shown" event finish before tearDown invalidates the session.
        try await sleep(milliseconds: 200)
    }

    @MainActor
    func testResetSessionClearsPromptCacheAndLoadingState() async throws {
        let milk = makeItem(92, name: "Bio-Milch")
        let list = makeList([milk])
        let mobileStore = makeStore()
        let opportunityID = UpsellModel.itemOpportunityId(for: milk)
        UpsellStubURLProtocol.reset { _ in (200, Self.suggestionJSON([(opportunityID, 92, 200)])) }
        let model = UpsellModel(session: session, retryDelay: 0.05)

        model.authorizePlanPreloading(for: mobileStore, reason: "test")
        model.preloadPlan(for: list, stops: [], store: mobileStore, source: "shopping_list")
        try await waitUntil { UpsellStubURLProtocol.planRequestCount() == 1 && !model.isLoading }
        model.showOpportunity(opportunityId: opportunityID, checkedItems: [milk], list: list, store: mobileStore, source: "shopping_list")
        XCTAssertNotNil(model.activePrompt)

        model.resetSession()
        XCTAssertNil(model.activePrompt)
        XCTAssertFalse(model.isLoading)

        // Cache is gone and the cooldown is reset: without a new plan nothing is shown.
        model.showOpportunity(opportunityId: opportunityID, checkedItems: [milk], list: list, store: mobileStore, source: "shopping_list")
        XCTAssertNil(model.activePrompt)
        // Let the fire-and-forget "shown" event finish before tearDown invalidates the session.
        try await sleep(milliseconds: 200)
    }

    // MARK: - Helpers

    @MainActor
    private func makeStore() -> MobileStoreSummary {
        MobileStoreSummary(id: mobileStoreID, storeCode: "HA-01", name: "Test Markt", city: "Linz")
    }

    private func makeList(_ items: [ShoppingListItem]) -> ShoppingList {
        var list = ShoppingList(name: "Upsell-Test")
        list.items = items
        return list
    }

    private func makeItem(
        _ productID: Int,
        name: String,
        status: ShoppingListItemStatus = .open,
        fromUpsell: Bool = false
    ) -> ShoppingListItem {
        var item = ShoppingListItem(product: Product(id: productID, name: name, price: 1.0, layoutCode: "520/2/1/1"))
        item.status = status
        item.addedFromUpsell = fromUpsell
        return item
    }

    private static func suggestionJSON(_ entries: [(opportunityID: String, trigger: Int, suggested: Int)]) -> Data {
        let opportunities = entries.map { entry in
            """
            {"opportunityId":"\(entry.opportunityID)","triggerProductIds":[\(entry.trigger)],"suggestions":[
              {"product":{"id":\(entry.suggested),"name":"Vorschlag \(entry.suggested)","price":1.5,"layoutCode":"520/2/1/1","hasLayoutPosition":true},
               "reason":"passt dazu","confidence":0.9}]}
            """
        }.joined(separator: ",")
        return Data("""
        {"opportunities":[\(opportunities)],"source":"openai","expiresAt":null,
         "debug":{"requestId":"req-test","responseSource":"openai","fallbackReason":null,"retryable":false}}
        """.utf8)
    }

    private static func lookupFailureJSON(opportunityID: String) -> Data {
        Data("""
        {"opportunities":[{"opportunityId":"\(opportunityID)","triggerProductIds":[92],"suggestions":[]}],
         "source":"none","expiresAt":null,
         "debug":{"requestId":"req-test","responseSource":"none","fallbackReason":"candidate_lookup_failed","retryable":true}}
        """.utf8)
    }

    private static func aiEmptyJSON(opportunityID: String) -> Data {
        Data("""
        {"opportunities":[{"opportunityId":"\(opportunityID)","triggerProductIds":[92],"suggestions":[]}],
         "source":"openai","expiresAt":null,
         "debug":{"requestId":"req-test","responseSource":"openai","openAiElapsedMs":800,"totalTokens":400,"fallbackReason":null,"retryable":false}}
        """.utf8)
    }

    @MainActor
    private func waitUntil(timeout: TimeInterval = 3, _ condition: () -> Bool) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition() {
            if Date() > deadline {
                XCTFail("Condition not reached within \(timeout)s")
                return
            }
            try await sleep(milliseconds: 15)
        }
    }

    private func sleep(milliseconds: UInt64) async throws {
        try await Task.sleep(nanoseconds: milliseconds * 1_000_000)
    }

    private static func body(of request: URLRequest) -> Data? {
        if let body = request.httpBody {
            return body
        }
        guard let stream = request.httpBodyStream else {
            return nil
        }
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let read = stream.read(&buffer, maxLength: buffer.count)
            if read <= 0 {
                break
            }
            data.append(buffer, count: read)
        }
        return data
    }
}
