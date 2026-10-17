import Foundation

@MainActor
final class UpsellSuggestionStore: ObservableObject {
    @Published var activePrompt: UpsellPrompt?
    @Published private(set) var isLoading = false

    private struct PlanKey: Hashable {
        let opportunityId: String
        let listID: UUID
        let storeId: UUID?
        let storeCode: String?
        let source: String
    }

    private struct CachedOpportunity {
        let response: UpsellOpportunityResponse
        let responseSource: String
        let expiresAt: Date

        var isLoadedEmpty: Bool {
            response.suggestions.isEmpty
        }
    }

    private struct PendingOpportunity {
        let opportunityId: String
        let checkedItems: [ShoppingListItem]
        let list: ShoppingList
        let store: MobileStoreSummary?
        let source: String
        let requestedAt: Date
    }

    private struct OpportunitySignature: Hashable {
        let opportunityId: String
        let triggerProductIds: [Int]
    }

    private struct PlanRequestSignature: Hashable {
        let listID: UUID
        let storeId: UUID
        let storeCode: String?
        let source: String
        let currentProductIds: [Int]
        let completedProductIds: [Int]
        let opportunities: [OpportunitySignature]
    }

    private var apiBase: String { AppEnvironment.apiBaseURL.absoluteString }
    private let minSecondsBetweenPrompts: TimeInterval = 8
    private let maxPromptsPerSession = 10
    private let maxSuggestionsShown = 3
    private let minConfidence = 0.45
    private let maxPendingOpportunityAge: TimeInterval = 30
    private let debugEnabled = true
    private let decoder = JSONDecoder.indooro
    private let encoder = JSONEncoder()

    private var lastPromptShownAt: Date?
    private var shownCountForSession = 0
    private var dismissedProductIDs: Set<Int> = []
    private var planTask: URLSessionDataTask?
    private var latestPlanRequestID = UUID()
    private var cachedOpportunities: [PlanKey: CachedOpportunity] = [:]
    private var pendingOpportunities: [PlanKey: PendingOpportunity] = [:]
    private var authorizedStoreId: UUID?
    private var activePlanSignature: PlanRequestSignature?
    private var lastCompletedPlanSignature: PlanRequestSignature?

    func resetSession() {
        debugLog("resetSession cachedOpportunities=\(cachedOpportunities.count) activePrompt=\(activePrompt?.opportunityId ?? "nil")")
        planTask?.cancel()
        planTask = nil
        cachedOpportunities.removeAll()
        pendingOpportunities.removeAll()
        activePrompt = nil
        isLoading = false
        latestPlanRequestID = UUID()
        lastPromptShownAt = nil
        shownCountForSession = 0
        dismissedProductIDs.removeAll()
        authorizedStoreId = nil
        activePlanSignature = nil
        lastCompletedPlanSignature = nil
    }

    func clearPrompt(reason: String = "manual") {
        debugLog("clearPrompt reason=\(reason) activePrompt=\(activePrompt?.opportunityId ?? "nil")")
        activePrompt = nil
    }

    static func stationOpportunityId(for stop: ShoppingStop) -> String {
        "station:\(stop.id)"
    }

    static func itemOpportunityId(for item: ShoppingListItem) -> String {
        "item:\(item.id.uuidString)"
    }

    func authorizePlanPreloading(for store: MobileStoreSummary, reason: String) {
        guard AppEnvironment.allowsExtendedFeatures else { return }
        if authorizedStoreId != store.id {
            debugLog("authorizePlanPreloading store=\(storeDebug(store)) reason=\(reason) previous=\(authorizedStoreId?.uuidString ?? "nil") clearsCache=true")
            planTask?.cancel()
            planTask = nil
            latestPlanRequestID = UUID()
            isLoading = false
            cachedOpportunities.removeAll()
            pendingOpportunities.removeAll()
            activePlanSignature = nil
            lastCompletedPlanSignature = nil
        } else {
            debugLog("authorizePlanPreloading store=\(storeDebug(store)) reason=\(reason) alreadyAuthorized=true")
        }
        authorizedStoreId = store.id
    }

    func preloadPlan(
        for list: ShoppingList,
        stops: [ShoppingStop],
        unresolvedItems: [ShoppingListItem] = [],
        store: MobileStoreSummary?,
        source: String
    ) {
        guard AppEnvironment.allowsExtendedFeatures else { resetSession(); return }
        guard shownCountForSession < maxPromptsPerSession else {
            debugLog("preloadPlan skipped reason=session_limit shownCount=\(shownCountForSession) limit=\(maxPromptsPerSession)")
            return
        }
        guard let store else {
            debugLog("preloadPlan skipped reason=no_store source=\(source)")
            return
        }
        guard authorizedStoreId == store.id else {
            debugLog("preloadPlan skipped reason=store_not_authorized store=\(storeDebug(store)) authorizedStoreId=\(authorizedStoreId?.uuidString ?? "nil") source=\(source)")
            return
        }

        let opportunities = makeOpportunities(
            list: list,
            stops: stops,
            unresolvedItems: unresolvedItems
        )
        guard !opportunities.isEmpty else {
            debugLog("preloadPlan skipped reason=no_opportunities")
            return
        }
        let uncachedOpportunities = opportunities.filter { opportunity in
            !hasFreshCachedOpportunity(
                opportunityId: opportunity.opportunityId,
                listID: list.id,
                store: store,
                source: source
            )
        }
        guard !uncachedOpportunities.isEmpty else {
            debugLog("preloadPlan skipped reason=all_opportunities_cached list=\(list.id.uuidString) source=\(source) store=\(storeDebug(store)) opportunities=\(opportunities.map(\.opportunityId))")
            return
        }

        let signature = makePlanSignature(
            list: list,
            opportunities: uncachedOpportunities,
            store: store,
            source: source
        )
        if activePlanSignature == signature {
            debugLog("preloadPlan skipped reason=duplicate_in_flight signature=\(signatureDebug(signature))")
            return
        }
        if lastCompletedPlanSignature == signature {
            debugLog("preloadPlan skipped reason=duplicate_completed signature=\(signatureDebug(signature))")
            return
        }
        if planTask != nil {
            debugLog("preloadPlan skipped reason=in_flight_waiting signature=\(signatureDebug(signature)) activeSignature=\(activePlanSignature.map(signatureDebug) ?? "nil")")
            return
        }
        debugLog(
            "preloadPlan begin list=\(list.id.uuidString) source=\(source) store=\(storeDebug(store)) stops=\(stops.count) unresolved=\(unresolvedItems.count) opportunities=\(uncachedOpportunities.map(\.opportunityId)) cachedSkipped=\(opportunities.count - uncachedOpportunities.count)"
        )
        guard let urlRequest = makePlanRequest(
            list: list,
            opportunities: uncachedOpportunities,
            store: store,
            source: source
        ) else {
            debugLog("preloadPlan skipped reason=request_build_failed")
            return
        }

        let requestID = UUID()
        latestPlanRequestID = requestID
        activePlanSignature = signature
        isLoading = true
        debugLog("preloadPlan requestId=\(requestID.uuidString) timeout=\(urlRequest.timeoutInterval)s")

        let task = AppEnvironment.session.dataTask(with: urlRequest) { [weak self] data, response, error in
            Task { @MainActor in
                guard let self else { return }
                guard self.latestPlanRequestID == requestID else {
                    self.debugLog("preloadPlan staleResponse ignored requestId=\(requestID.uuidString)")
                    return
                }
                self.planTask = nil
                self.activePlanSignature = nil
                self.isLoading = false

                let statusCode = (response as? HTTPURLResponse)?.statusCode
                if let data, let raw = String(data: data, encoding: .utf8) {
                    self.debugLog("preloadPlan rawResponse requestId=\(requestID.uuidString) status=\(statusCode.map(String.init) ?? "nil") body=\(raw)")
                } else {
                    self.debugLog("preloadPlan rawResponse requestId=\(requestID.uuidString) status=\(statusCode.map(String.init) ?? "nil") body=nil")
                }

                guard error == nil,
                      let httpResponse = response as? HTTPURLResponse,
                      (200..<300).contains(httpResponse.statusCode),
                      let data,
                      let decoded = try? self.decoder.decode(UpsellPlanResponse.self, from: data) else {
                    self.reportEvent(
                        eventType: "failed",
                        checkedProductId: nil,
                        suggestedProductId: nil,
                        store: store,
                        source: source,
                        metadataJson: self.metadataJson([
                            "stage": "plan",
                            "reason": error == nil ? "http_or_decode" : "network"
                        ])
                    )
                    self.debugLog("preloadPlan failed requestId=\(requestID.uuidString) error=\(error?.localizedDescription ?? "http_or_decode")")
                    return
                }

                self.lastCompletedPlanSignature = signature
                let expiresAt = decoded.expiresAt ?? Date().addingTimeInterval(60)
                let responseSource = decoded.source ?? "unknown"
                self.debugLog(
                    "preloadPlan decoded requestId=\(requestID.uuidString) source=\(responseSource) debug=\(self.debugSummary(decoded.debug)) opportunities=\(decoded.opportunities.map { "\($0.opportunityId):\($0.suggestions.map { $0.product.id })" })"
                )
                var decodedKeys: Set<PlanKey> = []
                for opportunity in decoded.opportunities {
                    let key = self.makePlanKey(
                        opportunityId: opportunity.opportunityId,
                        listID: list.id,
                        store: store,
                        source: source
                    )
                    decodedKeys.insert(key)
                    self.cachedOpportunities[key] = CachedOpportunity(
                        response: opportunity,
                        responseSource: responseSource,
                        expiresAt: expiresAt
                    )
                    if opportunity.suggestions.isEmpty {
                        self.debugLog("preloadPlan cached loaded_empty key=\(self.keyDebug(key)) expiresAt=\(expiresAt)")
                    } else {
                        self.debugLog("preloadPlan cached loaded_with_suggestions key=\(self.keyDebug(key)) suggestions=\(opportunity.suggestions.map { "\($0.product.id):\($0.product.name)" }) expiresAt=\(expiresAt)")
                    }
                    self.showPendingOpportunityIfPossible(for: key)
                }
                self.dropPendingOpportunitiesResolvedByPlan(
                    decodedKeys: decodedKeys,
                    listID: list.id,
                    store: store,
                    source: source
                )
            }
        }
        planTask = task
        task.resume()
    }

    func showOpportunity(
        opportunityId: String,
        checkedItems: [ShoppingListItem],
        list: ShoppingList,
        store: MobileStoreSummary?,
        source: String
    ) {
        guard AppEnvironment.allowsExtendedFeatures else { return }
        let triggerItems = checkedItems.filter { $0.productID != nil && !$0.addedFromUpsell }
        debugLog(
            "showOpportunity requested opportunity=\(opportunityId) source=\(source) store=\(storeDebug(store)) checkedItems=\(checkedItems.map { "\($0.name)#\($0.productID.map(String.init) ?? "nil") upsell=\($0.addedFromUpsell)" })"
        )
        guard let firstTrigger = triggerItems.first,
              let checkedProductId = firstTrigger.productID else {
            debugLog("showOpportunity skipped opportunity=\(opportunityId) reason=no_trigger_items")
            return
        }
        if let blockReason = promptBlockReason(for: checkedProductId, source: source) {
            debugLog("showOpportunity skipped opportunity=\(opportunityId) reason=\(blockReason)")
            return
        }

        let key = makePlanKey(
            opportunityId: opportunityId,
            listID: list.id,
            store: store,
            source: source
        )
        guard let cached = cachedOpportunity(for: key) else {
            rememberPendingOpportunity(
                key: key,
                opportunityId: opportunityId,
                checkedItems: checkedItems,
                list: list,
                store: store,
                source: source
            )
            debugLog("showOpportunity skipped opportunity=\(opportunityId) reason=cache_miss key=\(keyDebug(key)) cachedKeys=\(cachedOpportunities.keys.map(keyDebug))")
            return
        }
        guard !cached.isLoadedEmpty else {
            cachedOpportunities[key] = nil
            pendingOpportunities[key] = nil
            debugLog("showOpportunity skipped opportunity=\(opportunityId) reason=no_suggestions key=\(keyDebug(key))")
            return
        }

        let currentListProductIds = Set(list.items.compactMap(\.productID))
        let triggerProductIds = triggerItems.compactMap(\.productID)
        let suggestions = cached.response.suggestions
            .filter { suggestion in
                suggestion.confidence >= minConfidence &&
                !currentListProductIds.contains(suggestion.product.id) &&
                !dismissedProductIDs.contains(suggestion.product.id)
            }
            .prefix(maxSuggestionsShown)

        guard !suggestions.isEmpty else {
            debugLog("showOpportunity skipped opportunity=\(opportunityId) reason=no_suggestions_after_filter currentListProductIds=\(Array(currentListProductIds).sorted()) cachedSuggestions=\(cached.response.suggestions.map { $0.product.id })")
            return
        }

        cachedOpportunities[key] = nil
        activePrompt = UpsellPrompt(
            opportunityId: opportunityId,
            checkedProductId: checkedProductId,
            checkedProductName: displayName(for: triggerItems),
            triggerProductIds: triggerProductIds,
            listID: list.id,
            store: store,
            source: source,
            suggestions: Array(suggestions)
        )
        debugLog("showOpportunity activePrompt opportunity=\(opportunityId) checkedProductId=\(checkedProductId) suggestions=\(suggestions.map { "\($0.product.id):\($0.product.name) conf=\($0.confidence)" })")
        lastPromptShownAt = Date()
        shownCountForSession += 1
        reportEvent(
            eventType: "shown",
            checkedProductId: checkedProductId,
            suggestedProductId: nil,
            store: store,
            source: source,
            metadataJson: metadataJson([
                "opportunityId": opportunityId,
                "triggerProductIds": triggerProductIds.map(String.init).joined(separator: ","),
                "responseSource": cached.responseSource,
                "preloaded": "true"
            ])
        )
    }

    private func rememberPendingOpportunity(
        key: PlanKey,
        opportunityId: String,
        checkedItems: [ShoppingListItem],
        list: ShoppingList,
        store: MobileStoreSummary?,
        source: String
    ) {
        guard planTask != nil else {
            return
        }
        pendingOpportunities[key] = PendingOpportunity(
            opportunityId: opportunityId,
            checkedItems: checkedItems,
            list: list,
            store: store,
            source: source,
            requestedAt: Date()
        )
        debugLog("pendingOpportunity stored key=\(keyDebug(key))")
    }

    private func showPendingOpportunityIfPossible(for key: PlanKey) {
        guard let pending = pendingOpportunities.removeValue(forKey: key) else {
            return
        }
        if let cached = cachedOpportunity(for: key), cached.isLoadedEmpty {
            cachedOpportunities[key] = nil
            debugLog("pendingOpportunity dropped reason=loaded_empty key=\(keyDebug(key))")
            return
        }
        guard Date().timeIntervalSince(pending.requestedAt) <= maxPendingOpportunityAge else {
            debugLog("pendingOpportunity expired key=\(keyDebug(key))")
            return
        }
        debugLog("pendingOpportunity retry key=\(keyDebug(key))")
        showOpportunity(
            opportunityId: pending.opportunityId,
            checkedItems: pending.checkedItems,
            list: pending.list,
            store: pending.store,
            source: pending.source
        )
    }

    func accept(_ suggestion: UpsellSuggestion, prompt: UpsellPrompt?) {
        guard AppEnvironment.allowsExtendedFeatures else { return }
        let metadata: String?
        if let prompt {
            metadata = metadataJson([
                "opportunityId": prompt.opportunityId,
                "triggerProductIds": prompt.triggerProductIds.map(String.init).joined(separator: ",")
            ])
        } else {
            metadata = nil
        }

        debugLog("accept suggestion=\(suggestion.product.id):\(suggestion.product.name) prompt=\(prompt?.opportunityId ?? "nil")")
        reportEvent(
            eventType: "accepted",
            checkedProductId: prompt?.checkedProductId,
            suggestedProductId: suggestion.product.id,
            store: prompt?.store,
            source: prompt?.source,
            metadataJson: metadata
        )
        activePrompt = nil
    }

    func dismissCurrentPrompt(suppressProduct: Bool = false) {
        guard AppEnvironment.allowsExtendedFeatures else { return }
        guard let prompt = activePrompt else {
            debugLog("dismissCurrentPrompt skipped reason=no_active_prompt suppress=\(suppressProduct)")
            return
        }

        debugLog("dismissCurrentPrompt opportunity=\(prompt.opportunityId) suppress=\(suppressProduct)")
        if suppressProduct {
            dismissedProductIDs.formUnion(prompt.triggerProductIds)
            reportDismissal(prompt: prompt)
        }

        reportEvent(
            eventType: suppressProduct ? "suppressed" : "dismissed",
            checkedProductId: prompt.checkedProductId,
            suggestedProductId: nil,
            store: prompt.store,
            source: prompt.source,
            metadataJson: metadataJson([
                "opportunityId": prompt.opportunityId,
                "triggerProductIds": prompt.triggerProductIds.map(String.init).joined(separator: ",")
            ])
        )
        activePrompt = nil
    }

    private func makeOpportunities(
        list: ShoppingList,
        stops: [ShoppingStop],
        unresolvedItems: [ShoppingListItem]
    ) -> [UpsellOpportunityRequest] {
        var opportunities: [UpsellOpportunityRequest] = []

        for stop in stops {
            let items = eligibleTriggerItems(stop.items)
            guard !items.isEmpty else { continue }
            opportunities.append(UpsellOpportunityRequest(
                opportunityId: Self.stationOpportunityId(for: stop),
                triggerProductIds: items.compactMap(\.productID),
                triggerProductNames: items.map(\.name)
            ))
        }

        let itemLevelInputs = stops.isEmpty
            ? list.items.filter { $0.status == .open }
            : unresolvedItems

        for item in eligibleTriggerItems(itemLevelInputs) {
            guard let productID = item.productID else { continue }
            opportunities.append(UpsellOpportunityRequest(
                opportunityId: Self.itemOpportunityId(for: item),
                triggerProductIds: [productID],
                triggerProductNames: [item.name]
            ))
        }

        return opportunities
    }

    private func eligibleTriggerItems(_ items: [ShoppingListItem]) -> [ShoppingListItem] {
        items.filter { item in
            guard let productID = item.productID else { return false }
            return !item.addedFromUpsell && !dismissedProductIDs.contains(productID)
        }
    }

    private func makePlanRequest(
        list: ShoppingList,
        opportunities: [UpsellOpportunityRequest],
        store: MobileStoreSummary?,
        source: String
    ) -> URLRequest? {
        guard let url = URL(string: "\(apiBase)/mobile/upsell/plan") else {
            return nil
        }

        let request = UpsellPlanRequest(
            storeId: store?.id,
            storeCode: store?.storeCode,
            shoppingListId: list.id.uuidString,
            currentListProductIds: list.items.compactMap { item in
                item.status == .open ? item.productID : nil
            },
            completedProductIds: list.items.compactMap { item in
                item.status.isCompleted ? item.productID : nil
            },
            source: source,
            opportunities: opportunities
        )

        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.timeoutInterval = 25

        do {
            urlRequest.httpBody = try encoder.encode(request)
            if let body = urlRequest.httpBody,
               let raw = String(data: body, encoding: .utf8) {
                debugLog("preloadPlan requestBody=\(raw)")
            }
            return urlRequest
        } catch {
            debugLog("preloadPlan encodeFailed error=\(error.localizedDescription)")
            return nil
        }
    }

    private func makePlanSignature(
        list: ShoppingList,
        opportunities: [UpsellOpportunityRequest],
        store: MobileStoreSummary,
        source: String
    ) -> PlanRequestSignature {
        PlanRequestSignature(
            listID: list.id,
            storeId: store.id,
            storeCode: store.storeCode.lowercased(),
            source: source,
            currentProductIds: normalizedIds(list.items.compactMap { item in
                item.status == .open ? item.productID : nil
            }),
            completedProductIds: normalizedIds(list.items.compactMap { item in
                item.status.isCompleted ? item.productID : nil
            }),
            opportunities: opportunities
                .map { opportunity in
                    OpportunitySignature(
                        opportunityId: opportunity.opportunityId,
                        triggerProductIds: normalizedIds(opportunity.triggerProductIds)
                    )
                }
                .sorted { lhs, rhs in
                    if lhs.opportunityId == rhs.opportunityId {
                        return lhs.triggerProductIds.lexicographicallyPrecedes(rhs.triggerProductIds)
                    }
                    return lhs.opportunityId < rhs.opportunityId
                }
        )
    }

    private func cachedOpportunity(for key: PlanKey) -> CachedOpportunity? {
        guard let lookup = freshCachedOpportunity(for: key, logMiss: true) else {
            return nil
        }
        let cached = lookup.cached
        if lookup.key != key {
            cachedOpportunities[key] = cached
            cachedOpportunities[lookup.key] = nil
            debugLog("cache source_key_fallback requested=\(keyDebug(key)) found=\(keyDebug(lookup.key))")
        }
        if cached.expiresAt <= Date() {
            cachedOpportunities[lookup.key] = nil
            debugLog("cache expired key=\(keyDebug(key)) expiresAt=\(cached.expiresAt)")
            return nil
        }
        let state = cached.isLoadedEmpty ? "loaded_empty" : "loaded_with_suggestions"
        debugLog("cache hit key=\(keyDebug(key)) state=\(state) source=\(cached.responseSource) suggestions=\(cached.response.suggestions.map { $0.product.id })")
        return cached
    }

    private func hasFreshCachedOpportunity(
        opportunityId: String,
        listID: UUID,
        store: MobileStoreSummary,
        source: String
    ) -> Bool {
        let key = makePlanKey(
            opportunityId: opportunityId,
            listID: listID,
            store: store,
            source: source
        )
        guard let lookup = freshCachedOpportunity(for: key, logMiss: false) else {
            return false
        }
        let cached = lookup.cached
        if cached.expiresAt <= Date() {
            cachedOpportunities[lookup.key] = nil
            debugLog("preloadPlan cached opportunity expired key=\(keyDebug(key)) expiresAt=\(cached.expiresAt)")
            return false
        }
        return true
    }

    private struct CachedOpportunityLookup {
        let key: PlanKey
        let cached: CachedOpportunity
    }

    private func freshCachedOpportunity(for key: PlanKey, logMiss: Bool) -> CachedOpportunityLookup? {
        if let cached = cachedOpportunities[key] {
            return CachedOpportunityLookup(key: key, cached: cached)
        }
        for alternateKey in equivalentSourceKeys(for: key) {
            if let cached = cachedOpportunities[alternateKey] {
                return CachedOpportunityLookup(key: alternateKey, cached: cached)
            }
        }
        if logMiss {
            debugLog("cache miss key=\(keyDebug(key))")
        }
        return nil
    }

    private func equivalentSourceKeys(for key: PlanKey) -> [PlanKey] {
        let equivalentSources: [String]
        switch key.source {
        case "shopping_session":
            equivalentSources = ["shopping_list"]
        case "shopping_list":
            equivalentSources = ["shopping_session"]
        default:
            equivalentSources = ["shopping_session", "shopping_list"].filter { $0 != key.source }
        }
        return equivalentSources.map { source in
            PlanKey(
                opportunityId: key.opportunityId,
                listID: key.listID,
                storeId: key.storeId,
                storeCode: key.storeCode,
                source: source
            )
        }
    }

    private func dropPendingOpportunitiesResolvedByPlan(
        decodedKeys: Set<PlanKey>,
        listID: UUID,
        store: MobileStoreSummary,
        source: String
    ) {
        let pendingKeys = pendingOpportunities.keys.filter { key in
            key.listID == listID &&
            key.storeId == store.id &&
            key.storeCode == store.storeCode.lowercased() &&
            (key.source == source || equivalentSourceKeys(for: key).contains { decodedKeys.contains($0) })
        }
        for key in pendingKeys {
            if decodedKeys.contains(key) || equivalentSourceKeys(for: key).contains(where: { decodedKeys.contains($0) }) {
                if let cached = cachedOpportunity(for: key), cached.isLoadedEmpty {
                    pendingOpportunities[key] = nil
                    cachedOpportunities[key] = nil
                    debugLog("pendingOpportunity dropped reason=loaded_empty key=\(keyDebug(key))")
                }
            } else {
                pendingOpportunities[key] = nil
                debugLog("pendingOpportunity dropped reason=not_in_plan key=\(keyDebug(key))")
            }
        }
    }

    private func promptBlockReason(for checkedProductId: Int, source: String) -> String? {
        guard activePrompt == nil else {
            return "active_prompt=\(activePrompt?.opportunityId ?? "unknown")"
        }
        guard shownCountForSession < maxPromptsPerSession else {
            return "session_limit shownCount=\(shownCountForSession) limit=\(maxPromptsPerSession)"
        }
        guard !dismissedProductIDs.contains(checkedProductId) else {
            return "dismissed_product checkedProductId=\(checkedProductId)"
        }
        guard source != "shopping_session" else {
            return nil
        }
        if let lastPromptShownAt,
           Date().timeIntervalSince(lastPromptShownAt) < minSecondsBetweenPrompts {
            return "cooldown remaining=\(String(format: "%.2f", minSecondsBetweenPrompts - Date().timeIntervalSince(lastPromptShownAt)))s"
        }
        return nil
    }

    private func makePlanKey(
        opportunityId: String,
        listID: UUID,
        store: MobileStoreSummary?,
        source: String
    ) -> PlanKey {
        PlanKey(
            opportunityId: opportunityId,
            listID: listID,
            storeId: store?.id,
            storeCode: store?.storeCode.lowercased(),
            source: source
        )
    }

    private func displayName(for items: [ShoppingListItem]) -> String {
        let names = items.map(\.name)
        if names.count <= 2 {
            return names.joined(separator: ", ")
        }
        return "\(names.prefix(2).joined(separator: ", ")) +\(names.count - 2)"
    }

    private func reportEvent(
        eventType: String,
        checkedProductId: Int?,
        suggestedProductId: Int?,
        store: MobileStoreSummary?,
        source: String?,
        metadataJson: String?
    ) {
        guard let url = URL(string: "\(apiBase)/mobile/upsell/events") else {
            return
        }

        let request = UpsellEventRequest(
            eventType: eventType,
            checkedProductId: checkedProductId,
            suggestedProductId: suggestedProductId,
            storeId: store?.id,
            storeCode: store?.storeCode,
            sessionId: nil,
            source: source,
            metadataJson: metadataJson
        )
        sendBestEffort(request, to: url)
    }

    private func reportDismissal(prompt: UpsellPrompt) {
        guard let url = URL(string: "\(apiBase)/mobile/upsell/dismiss") else {
            return
        }

        let request = UpsellDismissRequest(
            checkedProductId: prompt.checkedProductId,
            suggestedProductId: nil,
            storeId: prompt.store?.id,
            storeCode: prompt.store?.storeCode,
            sessionId: nil,
            suppressMinutes: 24 * 60
        )
        sendBestEffort(request, to: url)
    }

    private func sendBestEffort<T: Encodable>(_ request: T, to url: URL) {
        guard AppEnvironment.allowsExtendedFeatures else { return }
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.timeoutInterval = 3

        do {
            urlRequest.httpBody = try encoder.encode(request)
        } catch {
            return
        }

        AppEnvironment.session.dataTask(with: urlRequest).resume()
    }

    private func metadataJson(_ values: [String: String]) -> String? {
        guard let data = try? JSONSerialization.data(withJSONObject: values, options: [.sortedKeys]) else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    private func debugLog(_ message: String) {
        guard debugEnabled else {
            return
        }
        print("[UpsellDebug] \(message)")
    }

    private func keyDebug(_ key: PlanKey) -> String {
        "\(key.opportunityId)|list=\(key.listID.uuidString)|store=\(key.storeId?.uuidString ?? key.storeCode ?? "nil")|source=\(key.source)"
    }

    private func signatureDebug(_ signature: PlanRequestSignature) -> String {
        let opportunities = signature.opportunities
            .map { "\($0.opportunityId):\($0.triggerProductIds)" }
            .joined(separator: ";")
        return "list=\(signature.listID.uuidString)|store=\(signature.storeId.uuidString)|source=\(signature.source)|current=\(signature.currentProductIds)|completed=\(signature.completedProductIds)|opps=\(opportunities)"
    }

    private func storeDebug(_ store: MobileStoreSummary?) -> String {
        guard let store else {
            return "nil"
        }
        return "\(store.name)#\(store.id.uuidString)#\(store.storeCode)"
    }

    private func normalizedIds(_ ids: [Int]) -> [Int] {
        Array(Set(ids)).sorted()
    }

    private func debugSummary(_ debug: UpsellPlanDebug?) -> String {
        guard let debug else {
            return "nil"
        }
        return "requestId=\(debug.requestId ?? "nil") model=\(debug.model ?? "nil") source=\(debug.responseSource ?? "nil") elapsedMs=\(debug.elapsedMs.map(String.init) ?? "nil") openAiElapsedMs=\(debug.openAiElapsedMs.map(String.init) ?? "nil") inputTokens=\(debug.inputTokens.map(String.init) ?? "nil") outputTokens=\(debug.outputTokens.map(String.init) ?? "nil") totalTokens=\(debug.totalTokens.map(String.init) ?? "nil") cachedInputTokens=\(debug.cachedInputTokens.map(String.init) ?? "nil") reasoningTokens=\(debug.reasoningTokens.map(String.init) ?? "nil") fallbackReason=\(debug.fallbackReason ?? "nil") opportunities=\(debug.opportunityCount.map(String.init) ?? "nil") candidates=\(debug.candidateCount.map(String.init) ?? "nil")"
    }
}
