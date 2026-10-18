import IndooroModels
import Foundation
import IndooroNetworking
import Observation
import os

/// Upsell-Zustand der Einkaufssitzung (Prompt, Plan-Cache, Drosselung). Nur `activePrompt` und `isLoading` sind für Views beobachtbar.
@Observable
@MainActor
final class UpsellModel {
    var activePrompt: UpsellPrompt?
    private(set) var isLoading = false

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

    /// One scheduled retry for a retryable candidate-lookup failure. Holds the snapshot needed to re-validate it.
    private struct PendingPlanRetry {
        let id: UUID
        let signature: PlanRequestSignature
        let list: ShoppingList
        let opportunities: [UpsellOpportunityRequest]
        let store: MobileStoreSummary
        let source: String
        let epoch: UUID
        let retryNumber: Int
        let originalRequestID: UUID
    }

    @ObservationIgnored private let minSecondsBetweenPrompts: TimeInterval = 8
    @ObservationIgnored private let maxPromptsPerSession = 10
    @ObservationIgnored private let maxSuggestionsShown = 3
    @ObservationIgnored private let minConfidence = 0.45
    @ObservationIgnored private let maxPendingOpportunityAge: TimeInterval = 30
    @ObservationIgnored private let debugEnabled = true
    @ObservationIgnored private let decoder = JSONDecoder.indooro
    @ObservationIgnored private let encoder = JSONEncoder()
    @ObservationIgnored private let client: any APIClientProtocol

    @ObservationIgnored private var lastPromptShownAt: Date?
    @ObservationIgnored private var shownCountForSession = 0
    @ObservationIgnored private var dismissedProductIDs: Set<Int> = []
    @ObservationIgnored private var planTask: Task<Void, Never>?
    @ObservationIgnored private var latestPlanRequestID = UUID()
    @ObservationIgnored private var cachedOpportunities: [PlanKey: CachedOpportunity] = [:]
    @ObservationIgnored private var pendingOpportunities: [PlanKey: PendingOpportunity] = [:]
    @ObservationIgnored private var authorizedStoreId: UUID?
    @ObservationIgnored private var activePlanSignature: PlanRequestSignature?
    @ObservationIgnored private var lastCompletedPlanSignature: PlanRequestSignature?
    @ObservationIgnored private var handledOpportunities = HandledOpportunitySet()
    @ObservationIgnored private var retryState: PlanRetryState
    @ObservationIgnored private var pendingRetry: PendingPlanRetry?
    @ObservationIgnored private var retryTask: Task<Void, Never>?
    /// Changes on every reset or explicit store change so that delayed work from an older session is ignored.
    @ObservationIgnored private var sessionEpoch = UUID()

    init(
        session: URLSession = AppEnvironment.session,
        retryDelay: TimeInterval = UpsellPlanLogic.defaultRetryDelay,
        client: (any APIClientProtocol)? = nil
    ) {
        self.client = client ?? AppEnvironment.makeAPIClient(session: session)
        self.retryState = PlanRetryState(retryDelay: retryDelay)
    }

    func resetSession() {
        debugLog("resetSession cachedOpportunities=\(cachedOpportunities.count) handled=\(handledOpportunities.count) activePrompt=\(activePrompt?.opportunityId ?? "nil")")
        planTask?.cancel()
        planTask = nil
        cancelPendingRetry(reason: "session_reset")
        cachedOpportunities.removeAll()
        pendingOpportunities.removeAll()
        handledOpportunities.removeAll()
        retryState.removeAll()
        activePrompt = nil
        isLoading = false
        latestPlanRequestID = UUID()
        sessionEpoch = UUID()
        lastPromptShownAt = nil
        shownCountForSession = 0
        dismissedProductIDs.removeAll()
        authorizedStoreId = nil
        activePlanSignature = nil
        lastCompletedPlanSignature = nil
    }

    func clearPrompt(reason: String = "manual") {
        debugLog("clearPrompt reason=\(reason) activePrompt=\(activePrompt?.opportunityId ?? "nil")")
        // A closed prompt was shown, so its own opportunity counts as handled. No other opportunity is touched.
        if let prompt = activePrompt {
            markHandled(promptIdentity(prompt), reason: "prompt_closed_\(reason)")
        }
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
            let removedHandled = handledOpportunities.removeIdentities(notForStore: store.id)
            debugLog("authorizePlanPreloading store=\(storeDebug(store)) reason=\(reason) previous=\(authorizedStoreId?.uuidString ?? "nil") clearsCache=true clearsHandled=\(removedHandled)")
            planTask?.cancel()
            planTask = nil
            cancelPendingRetry(reason: "store_changed")
            retryState.removeAll()
            sessionEpoch = UUID()
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
            unresolvedItems: unresolvedItems,
            store: store,
            source: source
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

        let shoppingState = canonicalShoppingState(for: list)
        debugLog(
            "preloadPlan canonical current=\(shoppingState.currentProductIds.count) completed=\(shoppingState.completedProductIds.count) overlapRemoved=\(shoppingState.overlapRemovedCount) rawOpen=\(shoppingState.rawOpenCount) rawCompleted=\(shoppingState.rawCompletedCount)"
        )
        let signature = makePlanSignature(
            list: list,
            shoppingState: shoppingState,
            opportunities: uncachedOpportunities,
            store: store,
            source: source
        )
        if let pending = pendingRetry {
            if pending.signature == signature {
                debugLog("preloadPlan skipped reason=retry_pending signature=\(signatureDebug(signature))")
                return
            }
            cancelPendingRetry(reason: "signature_obsolete")
        }
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
        if retryState.isExhausted(signature) {
            debugLog("preloadPlan skipped reason=candidate_lookup_retry_exhausted signature=\(signatureDebug(signature))")
            return
        }
        let discarded = retryState.discardObsolete(except: signature)
        if discarded > 0 {
            debugLog("retry state discarded reason=signature_obsolete count=\(discarded)")
        }

        debugLog(
            "preloadPlan begin list=\(list.id.uuidString) source=\(source) store=\(storeDebug(store)) stops=\(stops.count) unresolved=\(unresolvedItems.count) opportunities=\(uncachedOpportunities.map(\.opportunityId)) cachedSkipped=\(opportunities.count - uncachedOpportunities.count)"
        )
        startPlanRequest(
            list: list,
            opportunities: uncachedOpportunities,
            store: store,
            source: source,
            signature: signature,
            retryNumber: nil
        )
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
        let identity = opportunityIdentity(
            opportunityId: opportunityId,
            checkedItems: checkedItems,
            list: list,
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
            // Successfully evaluated by OpenAI with no suggestion: completing it ends the opportunity for this session.
            cachedOpportunities[key] = nil
            pendingOpportunities[key] = nil
            markHandled(identity, reason: "loaded_empty_completed")
            debugLog("showOpportunity skipped opportunity=\(opportunityId) reason=no_suggestions key=\(keyDebug(key))")
            return
        }

        let currentListProductIds = Set(list.items.compactMap(\.productID))
        let eligibleTriggerProductIds = eligibleTriggerItems(triggerItems).compactMap(\.productID)
        let suggestions = cached.response.suggestions
            .filter { suggestion in
                suggestion.confidence >= minConfidence &&
                !currentListProductIds.contains(suggestion.product.id) &&
                !dismissedProductIDs.contains(suggestion.product.id)
            }
            .prefix(maxSuggestionsShown)

        guard !suggestions.isEmpty else {
            // Successful AI result that the local filters emptied: handled like a loaded-empty result.
            markHandled(identity, reason: "filtered_empty_completed")
            debugLog("showOpportunity skipped opportunity=\(opportunityId) reason=no_suggestions_after_filter currentListProductIds=\(Array(currentListProductIds).sorted()) cachedSuggestions=\(cached.response.suggestions.map { $0.product.id })")
            return
        }

        cachedOpportunities[key] = nil
        activePrompt = UpsellPrompt(
            opportunityId: opportunityId,
            checkedProductId: checkedProductId,
            checkedProductName: displayName(for: triggerItems),
            triggerProductIds: eligibleTriggerProductIds,
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
                "triggerProductIds": eligibleTriggerProductIds.map(String.init).joined(separator: ","),
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
            markHandled(
                opportunityIdentity(
                    opportunityId: pending.opportunityId,
                    checkedItems: pending.checkedItems,
                    list: pending.list,
                    store: pending.store,
                    source: pending.source
                ),
                reason: "pending_loaded_empty_completed"
            )
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
        if let prompt {
            markHandled(promptIdentity(prompt), reason: "accepted")
        }
        activePrompt = nil
    }

    func dismissCurrentPrompt(suppressProduct: Bool = false) {
        guard AppEnvironment.allowsExtendedFeatures else { return }
        guard let prompt = activePrompt else {
            debugLog("dismissCurrentPrompt skipped reason=no_active_prompt suppress=\(suppressProduct)")
            return
        }

        debugLog("dismissCurrentPrompt opportunity=\(prompt.opportunityId) suppress=\(suppressProduct)")
        markHandled(promptIdentity(prompt), reason: suppressProduct ? "suppressed" : "dismissed")
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
        unresolvedItems: [ShoppingListItem],
        store: MobileStoreSummary,
        source: String
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

        // Handled opportunities are excluded before the request signature is computed.
        return opportunities.filter { opportunity in
            let identity = makeIdentity(
                listID: list.id,
                store: store,
                source: source,
                opportunityId: opportunity.opportunityId,
                triggerProductIds: opportunity.triggerProductIds
            )
            guard let reason = suppressionReason(for: identity) else {
                return true
            }
            debugLog("preloadPlan skipped reason=\(reason) \(identity.debugSummary)")
            return false
        }
    }

    private func eligibleTriggerItems(_ items: [ShoppingListItem]) -> [ShoppingListItem] {
        items.filter { item in
            guard let productID = item.productID else { return false }
            return !item.addedFromUpsell && !dismissedProductIDs.contains(productID)
        }
    }

    /// Starts one plan request. The payload uses the signature's canonical arrays.
    private func startPlanRequest(
        list: ShoppingList,
        opportunities: [UpsellOpportunityRequest],
        store: MobileStoreSummary,
        source: String,
        signature: PlanRequestSignature,
        retryNumber: Int?
    ) {
        guard let endpoint = makePlanRequest(
            list: list,
            opportunities: opportunities,
            store: store,
            source: source,
            signature: signature
        ) else {
            debugLog("preloadPlan skipped reason=request_build_failed")
            return
        }

        let requestID = UUID()
        latestPlanRequestID = requestID
        activePlanSignature = signature
        isLoading = true
        debugLog("preloadPlan requestId=\(requestID.uuidString) timeout=25s retryAttempt=\(retryNumber.map(String.init) ?? "none")")

        let client = client
        let task = Task { [weak self] in
            let result = await client.sendResult(endpoint.asRaw)
            guard let self else { return }
            guard self.latestPlanRequestID == requestID else {
                self.debugLog("preloadPlan staleResponse ignored requestId=\(requestID.uuidString)")
                return
            }
            self.planTask = nil
            self.activePlanSignature = nil
            self.isLoading = false
            self.handlePlanResult(
                result,
                requestID: requestID,
                list: list,
                opportunities: opportunities,
                store: store,
                source: source,
                signature: signature,
                retryNumber: retryNumber
            )
        }
        planTask = task
    }

    /// Verarbeitet die Antwort des aktuellen Plan-Aufrufs. Die Dekodierung bleibt hier (tolerant, wie vorher).
    private func handlePlanResult(
        _ result: Result<RawJSON, APIError>,
        requestID: UUID,
        list: ShoppingList,
        opportunities: [UpsellOpportunityRequest],
        store: MobileStoreSummary,
        source: String,
        signature: PlanRequestSignature,
        retryNumber: Int?
    ) {
        let decoded: UpsellPlanResponse
        switch result {
        case .failure(let error):
            var statusLabel = "nil"
            if case .http(let status, _) = error {
                statusLabel = String(status)
            }
            debugLog("preloadPlan rawResponse requestId=\(requestID.uuidString) status=\(statusLabel) body=nil")
            reportEvent(
                eventType: "failed",
                checkedProductId: nil,
                suggestedProductId: nil,
                store: store,
                source: source,
                metadataJson: metadataJson([
                    "stage": "plan",
                    "reason": error.isNetworkFailure ? "network" : "http_or_decode"
                ])
            )
            debugLog("preloadPlan failed requestId=\(requestID.uuidString) error=\(error)")
            return
        case .success(let raw):
            if let body = String(data: raw.data, encoding: .utf8) {
                debugLog("preloadPlan rawResponse requestId=\(requestID.uuidString) status=ok body=\(body)")
            } else {
                debugLog("preloadPlan rawResponse requestId=\(requestID.uuidString) status=ok body=nil")
            }
            guard let value = try? decoder.decode(UpsellPlanResponse.self, from: raw.data) else {
                reportEvent(
                    eventType: "failed",
                    checkedProductId: nil,
                    suggestedProductId: nil,
                    store: store,
                    source: source,
                    metadataJson: metadataJson([
                        "stage": "plan",
                        "reason": "http_or_decode"
                    ])
                )
                debugLog("preloadPlan failed requestId=\(requestID.uuidString) error=http_or_decode")
                return
            }
            decoded = value
        }

        let debug = decoded.debug
        let evidence = PlanResponseEvidence(
            responseSource: debug?.responseSource ?? decoded.source,
            fallbackReason: debug?.fallbackReason,
            retryable: debug?.retryable,
            openAiElapsedMs: debug?.openAiElapsedMs,
            totalTokens: debug?.totalTokens,
            inputTokens: debug?.inputTokens,
            outputTokens: debug?.outputTokens
        )
        if evidence.isRetryableCandidateLookupFailure {
            // Transient pre-AI failure: not cached, not marked handled, not recorded as completed.
            self.handleRetryableCandidateLookupFailure(
                requestID: requestID,
                retryNumber: retryNumber,
                signature: signature,
                list: list,
                opportunities: opportunities,
                store: store,
                source: source,
                evidence: evidence
            )
            return
        }

        self.lastCompletedPlanSignature = signature
        self.retryState.clear(signature)
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

    private func handleRetryableCandidateLookupFailure(
        requestID: UUID,
        retryNumber: Int?,
        signature: PlanRequestSignature,
        list: ShoppingList,
        opportunities: [UpsellOpportunityRequest],
        store: MobileStoreSummary,
        source: String,
        evidence: PlanResponseEvidence
    ) {
        debugLog("preloadPlan candidateLookupFailed requestId=\(requestID.uuidString) retryAttempt=\(retryNumber.map(String.init) ?? "none") signature=\(signatureDebug(signature)) openAiCalled=false")
        switch retryState.decision(for: evidence, signature: signature) {
        case .stop(let reason):
            debugLog("retry stop reason=\(reason) requestId=\(requestID.uuidString) signature=\(signatureDebug(signature))")
        case .scheduleRetry(let delay, let nextRetryNumber):
            cancelPendingRetry(reason: "replaced")
            let retry = PendingPlanRetry(
                id: UUID(),
                signature: signature,
                list: list,
                opportunities: opportunities,
                store: store,
                source: source,
                epoch: sessionEpoch,
                retryNumber: nextRetryNumber,
                originalRequestID: requestID
            )
            let retryID = retry.id
            pendingRetry = retry
            debugLog("retry scheduled originalRequestId=\(requestID.uuidString) originalSignature=\(signatureDebug(signature)) attempt=\(nextRetryNumber) delay=\(delay)s")
            let nanoseconds = UInt64(delay * 1_000_000_000)
            retryTask = Task { [weak self] in
                do {
                    try await Task.sleep(nanoseconds: nanoseconds)
                } catch {
                    return
                }
                self?.runPendingRetry(id: retryID)
            }
        }
    }

    /// Runs the scheduled retry only if the session, store, list snapshot, and unhandled opportunities are unchanged.
    private func runPendingRetry(id: UUID) {
        guard let retry = pendingRetry, retry.id == id else {
            return
        }
        pendingRetry = nil
        retryTask = nil

        let retryOpportunities = retry.opportunities.filter { opportunity in
            let identity = makeIdentity(
                listID: retry.list.id,
                store: retry.store,
                source: retry.source,
                opportunityId: opportunity.opportunityId,
                triggerProductIds: opportunity.triggerProductIds
            )
            return suppressionReason(for: identity) == nil && !hasFreshCachedOpportunity(
                opportunityId: opportunity.opportunityId,
                listID: retry.list.id,
                store: retry.store,
                source: retry.source
            )
        }
        let recomputedSignature: PlanRequestSignature? = retryOpportunities.isEmpty
            ? nil
            : makePlanSignature(
                list: retry.list,
                shoppingState: canonicalShoppingState(for: retry.list),
                opportunities: retryOpportunities,
                store: retry.store,
                source: retry.source
            )
        if let reason = UpsellPlanLogic.retryBlockReason(
            scheduled: retry.signature,
            recomputed: recomputedSignature,
            hasActiveRequest: planTask != nil || activePlanSignature != nil,
            sessionMatches: retry.epoch == sessionEpoch,
            storeStillAuthorized: authorizedStoreId == retry.store.id && AppEnvironment.allowsExtendedFeatures
        ) {
            debugLog("retry cancelled reason=\(reason) originalRequestId=\(retry.originalRequestID.uuidString) attempt=\(retry.retryNumber) originalSignature=\(signatureDebug(retry.signature))")
            return
        }

        let attempt = retryState.recordRetryStarted(for: retry.signature)
        debugLog("retry started attempt=\(attempt) delay=\(retryState.retryDelay)s originalRequestId=\(retry.originalRequestID.uuidString) originalSignature=\(signatureDebug(retry.signature))")
        startPlanRequest(
            list: retry.list,
            opportunities: retryOpportunities,
            store: retry.store,
            source: retry.source,
            signature: retry.signature,
            retryNumber: attempt
        )
    }

    private func cancelPendingRetry(reason: String) {
        guard let retry = pendingRetry else {
            return
        }
        retryTask?.cancel()
        retryTask = nil
        pendingRetry = nil
        debugLog("retry cancelled reason=\(reason) originalRequestId=\(retry.originalRequestID.uuidString) attempt=\(retry.retryNumber) originalSignature=\(signatureDebug(retry.signature))")
    }

    private func makePlanRequest(
        list: ShoppingList,
        opportunities: [UpsellOpportunityRequest],
        store: MobileStoreSummary,
        source: String,
        signature: PlanRequestSignature
    ) -> UpsellPlanEndpoint? {
        let request = UpsellPlanRequest(
            storeId: store.id,
            storeCode: store.storeCode,
            shoppingListId: list.id.uuidString,
            currentListProductIds: signature.currentProductIds,
            completedProductIds: signature.completedProductIds,
            source: source,
            opportunities: opportunities
        )

        do {
            let body = try encoder.encode(request)
            if let raw = String(data: body, encoding: .utf8) {
                debugLog("preloadPlan requestBody=\(raw)")
            }
        } catch {
            debugLog("preloadPlan encodeFailed error=\(error.localizedDescription)")
            return nil
        }
        return UpsellPlanEndpoint(body: request)
    }

    private func canonicalShoppingState(for list: ShoppingList) -> CanonicalShoppingState {
        UpsellPlanLogic.canonicalShoppingState(
            openProductIds: list.items.compactMap { item in
                item.status == .open ? item.productID : nil
            },
            completedProductIds: list.items.compactMap { item in
                item.status.isCompleted ? item.productID : nil
            }
        )
    }

    private func makePlanSignature(
        list: ShoppingList,
        shoppingState: CanonicalShoppingState,
        opportunities: [UpsellOpportunityRequest],
        store: MobileStoreSummary,
        source: String
    ) -> PlanRequestSignature {
        PlanRequestSignature(
            listID: list.id,
            storeId: store.id,
            storeCode: store.storeCode.lowercased(),
            source: source,
            shoppingState: shoppingState,
            opportunities: opportunities.map { opportunity in
                PlanOpportunitySignature(
                    opportunityId: opportunity.opportunityId,
                    triggerProductIds: opportunity.triggerProductIds
                )
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
                    if let pending = pendingOpportunities[key] {
                        markHandled(
                            opportunityIdentity(
                                opportunityId: pending.opportunityId,
                                checkedItems: pending.checkedItems,
                                list: pending.list,
                                store: pending.store,
                                source: pending.source
                            ),
                            reason: "pending_loaded_empty_completed"
                        )
                    }
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

    // MARK: - Handled opportunity lifecycle

    private func makeIdentity(
        listID: UUID,
        store: MobileStoreSummary?,
        source: String,
        opportunityId: String,
        triggerProductIds: [Int]
    ) -> HandledOpportunityIdentity {
        HandledOpportunityIdentity(
            listID: listID,
            storeID: store?.id,
            source: source,
            opportunityID: opportunityId,
            triggerProductIds: triggerProductIds
        )
    }

    private func opportunityIdentity(
        opportunityId: String,
        checkedItems: [ShoppingListItem],
        list: ShoppingList,
        store: MobileStoreSummary?,
        source: String
    ) -> HandledOpportunityIdentity {
        makeIdentity(
            listID: list.id,
            store: store,
            source: source,
            opportunityId: opportunityId,
            triggerProductIds: eligibleTriggerItems(checkedItems).compactMap(\.productID)
        )
    }

    private func promptIdentity(_ prompt: UpsellPrompt) -> HandledOpportunityIdentity {
        makeIdentity(
            listID: prompt.listID,
            store: prompt.store,
            source: prompt.source,
            opportunityId: prompt.opportunityId,
            triggerProductIds: prompt.triggerProductIds
        )
    }

    private func suppressionReason(for identity: HandledOpportunityIdentity) -> String? {
        UpsellPlanLogic.suppressionReason(
            for: identity,
            handled: handledOpportunities,
            activeIdentity: activePrompt.map { promptIdentity($0) }
        )
    }

    private func markHandled(_ identity: HandledOpportunityIdentity, reason: String) {
        let inserted = handledOpportunities.insert(identity)
        debugLog("handled reason=\(reason) inserted=\(inserted) \(identity.debugSummary) count=\(handledOpportunities.count)")
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
        sendBestEffort(UpsellEventEndpoint(body: request))
    }

    private func reportDismissal(prompt: UpsellPrompt) {
        let request = UpsellDismissRequest(
            checkedProductId: prompt.checkedProductId,
            suggestedProductId: nil,
            storeId: prompt.store?.id,
            storeCode: prompt.store?.storeCode,
            sessionId: nil,
            suppressMinutes: 24 * 60
        )
        sendBestEffort(UpsellDismissEndpoint(body: request))
    }

    private func sendBestEffort<E: Endpoint>(_ endpoint: E) {
        guard AppEnvironment.allowsExtendedFeatures else { return }
        let client = client
        Task { await client.fire(endpoint) }
    }

    private func metadataJson(_ values: [String: String]) -> String? {
        guard let data = try? JSONSerialization.data(withJSONObject: values, options: [.sortedKeys]) else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    private func debugLog(_ message: String) {
        #if DEBUG
        guard debugEnabled else {
            return
        }
        AppLog.upsell.debug("\(message, privacy: .private(mask: .hash))")
        #endif
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

    private func debugSummary(_ debug: UpsellPlanDebug?) -> String {
        guard let debug else {
            return "nil"
        }
        return "requestId=\(debug.requestId ?? "nil") model=\(debug.model ?? "nil") source=\(debug.responseSource ?? "nil") elapsedMs=\(debug.elapsedMs.map(String.init) ?? "nil") openAiElapsedMs=\(debug.openAiElapsedMs.map(String.init) ?? "nil") inputTokens=\(debug.inputTokens.map(String.init) ?? "nil") outputTokens=\(debug.outputTokens.map(String.init) ?? "nil") totalTokens=\(debug.totalTokens.map(String.init) ?? "nil") cachedInputTokens=\(debug.cachedInputTokens.map(String.init) ?? "nil") reasoningTokens=\(debug.reasoningTokens.map(String.init) ?? "nil") fallbackReason=\(debug.fallbackReason ?? "nil") retryable=\(debug.retryable.map(String.init) ?? "nil") opportunities=\(debug.opportunityCount.map(String.init) ?? "nil") candidates=\(debug.candidateCount.map(String.init) ?? "nil")"
    }
}

private extension APIError {
    /// Transportfehler ohne HTTP-Status und ohne Dekodierung (Telemetrie-Grund `network`).
    var isNetworkFailure: Bool {
        switch self {
        case .offline, .transport, .cancelled: true
        case .http, .decoding: false
        }
    }
}
