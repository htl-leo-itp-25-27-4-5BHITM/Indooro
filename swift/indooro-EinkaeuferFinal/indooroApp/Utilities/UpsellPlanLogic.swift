import Foundation

// Pure, deterministic upsell plan logic (Foundation only).
// Kept out of UpsellModel so canonical shopping state, opportunity
// identity, handled-opportunity state and the one-retry rule are unit-testable.

// MARK: - Canonical shopping state

/// Deduplicated, sorted and disjoint product ID sets for one list snapshot.
/// The same arrays feed `PlanRequestSignature` and the `UpsellPlanRequest` payload.
nonisolated struct CanonicalShoppingState: Equatable {
    /// Sorted unique product IDs of open items.
    let currentProductIds: [Int]
    /// Sorted unique product IDs of completed items minus every open ID (open wins).
    let completedProductIds: [Int]
    let rawOpenCount: Int
    let rawCompletedCount: Int
    /// Distinct completed product IDs removed from the completed set because the same ID is still open.
    let overlapRemovedCount: Int
}

// MARK: - Opportunity identity and handled state

/// Identity of one upsell opportunity within a shopping session.
/// Sorted, deduplicated trigger IDs make a materially changed station a new identity.
nonisolated struct HandledOpportunityIdentity: Hashable {
    let listID: UUID
    let storeID: UUID?
    let source: String
    let opportunityID: String
    let triggerProductIds: [Int]

    init(
        listID: UUID,
        storeID: UUID?,
        source: String,
        opportunityID: String,
        triggerProductIds: [Int]
    ) {
        self.listID = listID
        self.storeID = storeID
        self.source = UpsellPlanLogic.canonicalSource(source)
        self.opportunityID = opportunityID
        self.triggerProductIds = UpsellPlanLogic.canonicalIds(triggerProductIds)
    }

    /// Debug summary without personal data: opportunity key, canonical source and product IDs only.
    var debugSummary: String {
        "opportunity=\(opportunityID) source=\(source) triggers=\(triggerProductIds)"
    }
}

/// Session-scoped set of opportunities that were shown, accepted or completed.
/// Independent of cached plan responses and pending requests.
nonisolated struct HandledOpportunitySet: Equatable {
    private(set) var identities: Set<HandledOpportunityIdentity> = []

    var count: Int {
        identities.count
    }

    func contains(_ identity: HandledOpportunityIdentity) -> Bool {
        identities.contains(identity)
    }

    /// Returns true when the identity was not handled before.
    @discardableResult
    mutating func insert(_ identity: HandledOpportunityIdentity) -> Bool {
        identities.insert(identity).inserted
    }

    mutating func removeAll() {
        identities.removeAll()
    }

    /// Drops every identity that does not belong to `storeID`. Returns the number of removed identities.
    @discardableResult
    mutating func removeIdentities(notForStore storeID: UUID) -> Int {
        let before = identities.count
        identities = identities.filter { $0.storeID == storeID }
        return before - identities.count
    }
}

// MARK: - Request signature

/// One opportunity inside a plan request, with canonical trigger IDs.
nonisolated struct PlanOpportunitySignature: Hashable {
    let opportunityId: String
    let triggerProductIds: [Int]

    init(opportunityId: String, triggerProductIds: [Int]) {
        self.opportunityId = opportunityId
        self.triggerProductIds = UpsellPlanLogic.canonicalIds(triggerProductIds)
    }
}

/// Canonical identity of one plan request. Built from the same canonical arrays that the payload uses.
nonisolated struct PlanRequestSignature: Hashable {
    let listID: UUID
    let storeId: UUID
    let storeCode: String?
    let source: String
    let currentProductIds: [Int]
    let completedProductIds: [Int]
    let opportunities: [PlanOpportunitySignature]

    init(
        listID: UUID,
        storeId: UUID,
        storeCode: String?,
        source: String,
        shoppingState: CanonicalShoppingState,
        opportunities: [PlanOpportunitySignature]
    ) {
        self.listID = listID
        self.storeId = storeId
        self.storeCode = storeCode
        self.source = source
        self.currentProductIds = shoppingState.currentProductIds
        self.completedProductIds = shoppingState.completedProductIds
        self.opportunities = opportunities.sorted { lhs, rhs in
            if lhs.opportunityId == rhs.opportunityId {
                return lhs.triggerProductIds.lexicographicallyPrecedes(rhs.triggerProductIds)
            }
            return lhs.opportunityId < rhs.opportunityId
        }
    }
}

// MARK: - Retry

/// Non-sensitive evidence taken from a plan response (debug object plus source).
nonisolated struct PlanResponseEvidence: Equatable {
    let responseSource: String?
    let fallbackReason: String?
    let retryable: Bool?
    let openAiElapsedMs: Int?
    let totalTokens: Int?
    let inputTokens: Int?
    let outputTokens: Int?

    init(
        responseSource: String? = nil,
        fallbackReason: String? = nil,
        retryable: Bool? = nil,
        openAiElapsedMs: Int? = nil,
        totalTokens: Int? = nil,
        inputTokens: Int? = nil,
        outputTokens: Int? = nil
    ) {
        self.responseSource = responseSource
        self.fallbackReason = fallbackReason
        self.retryable = retryable
        self.openAiElapsedMs = openAiElapsedMs
        self.totalTokens = totalTokens
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
    }

    /// True when the response shows OpenAI timing, token usage, or an OpenAI/cache source.
    var reportsOpenAIUsage: Bool {
        if openAiElapsedMs != nil || responseSource == "openai" || responseSource == "cache" {
            return true
        }
        return [totalTokens, inputTokens, outputTokens].contains { ($0 ?? 0) > 0 }
    }

    /// Only the explicit backend candidate-lookup failure, with no OpenAI usage, is retryable.
    var isRetryableCandidateLookupFailure: Bool {
        guard fallbackReason == UpsellPlanLogic.candidateLookupFailedReason,
              retryable == true,
              responseSource == nil || responseSource == "none" else {
            return false
        }
        return !reportsOpenAIUsage
    }
}

/// Retry bookkeeping keyed by canonical `PlanRequestSignature`. At most `maxRetries` retries per signature.
nonisolated struct PlanRetryState: Equatable {
    enum Decision: Equatable {
        case scheduleRetry(delay: TimeInterval, retryNumber: Int)
        case stop(reason: String)
    }

    let retryDelay: TimeInterval
    let maxRetries: Int
    /// Number of retry requests actually started per signature.
    private(set) var startedRetries: [PlanRequestSignature: Int] = [:]

    init(
        retryDelay: TimeInterval = UpsellPlanLogic.defaultRetryDelay,
        maxRetries: Int = UpsellPlanLogic.maxRetriesPerSignature
    ) {
        self.retryDelay = max(0, retryDelay)
        self.maxRetries = max(0, maxRetries)
    }

    /// Pure decision after a plan response for `signature`. Does not mutate state.
    func decision(for evidence: PlanResponseEvidence, signature: PlanRequestSignature) -> Decision {
        guard evidence.isRetryableCandidateLookupFailure else {
            return .stop(reason: "not_retryable")
        }
        let started = startedRetries[signature] ?? 0
        guard started < maxRetries else {
            return .stop(reason: "retry_exhausted")
        }
        return .scheduleRetry(delay: retryDelay, retryNumber: started + 1)
    }

    /// True after the retry budget for `signature` has been spent. Blocks further automatic requests for it.
    func isExhausted(_ signature: PlanRequestSignature) -> Bool {
        let started = startedRetries[signature] ?? 0
        return started > 0 && started >= maxRetries
    }

    /// Records that a retry request really started. Returns the new retry count for the signature.
    @discardableResult
    mutating func recordRetryStarted(for signature: PlanRequestSignature) -> Int {
        let next = (startedRetries[signature] ?? 0) + 1
        startedRetries[signature] = next
        return next
    }

    /// Clears state for one signature, e.g. after a successful plan for it.
    mutating func clear(_ signature: PlanRequestSignature) {
        startedRetries[signature] = nil
    }

    mutating func removeAll() {
        startedRetries.removeAll()
    }

    /// Keeps only the state of the current signature. Returns the number of discarded entries.
    @discardableResult
    mutating func discardObsolete(except current: PlanRequestSignature) -> Int {
        let before = startedRetries.count
        startedRetries = startedRetries.filter { $0.key == current }
        return before - startedRetries.count
    }
}

// MARK: - Helpers

nonisolated enum UpsellPlanLogic {
    static let candidateLookupFailedReason = "candidate_lookup_failed"
    static let defaultRetryDelay: TimeInterval = 1.0
    static let maxRetriesPerSignature = 1

    /// Sorted unique product IDs.
    static func canonicalIds(_ ids: [Int]) -> [Int] {
        Array(Set(ids)).sorted()
    }

    /// Trims and lowercases the source. `shopping_session` and `shopping_list` describe the same
    /// list state for upsell purposes, so both map to `shopping_list` (same rule as the plan cache).
    static func canonicalSource(_ source: String) -> String {
        let normalized = source.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return normalized == "shopping_session" ? "shopping_list" : normalized
    }

    /// Open IDs win over completed IDs. Both outputs are sorted, unique and disjoint.
    static func canonicalShoppingState(
        openProductIds: [Int],
        completedProductIds: [Int]
    ) -> CanonicalShoppingState {
        let current = Set(openProductIds)
        let completedRaw = Set(completedProductIds)
        let completed = completedRaw.subtracting(current)
        return CanonicalShoppingState(
            currentProductIds: current.sorted(),
            completedProductIds: completed.sorted(),
            rawOpenCount: openProductIds.count,
            rawCompletedCount: completedProductIds.count,
            overlapRemovedCount: completedRaw.intersection(current).count
        )
    }

    /// Returns why an opportunity must not be planned or prompted again, or nil if it may proceed.
    static func suppressionReason(
        for identity: HandledOpportunityIdentity,
        handled: HandledOpportunitySet,
        activeIdentity: HandledOpportunityIdentity?
    ) -> String? {
        if handled.contains(identity) {
            return "handled_opportunity"
        }
        if identity == activeIdentity {
            return "active_prompt_opportunity"
        }
        return nil
    }

    /// Returns nil when a scheduled retry may run. Otherwise a short reason for the debug log.
    static func retryBlockReason(
        scheduled: PlanRequestSignature,
        recomputed: PlanRequestSignature?,
        hasActiveRequest: Bool,
        sessionMatches: Bool,
        storeStillAuthorized: Bool
    ) -> String? {
        guard sessionMatches else {
            return "session_reset"
        }
        guard storeStillAuthorized else {
            return "store_not_authorized"
        }
        guard !hasActiveRequest else {
            return "request_in_flight"
        }
        guard let recomputed else {
            return "no_unhandled_opportunities"
        }
        guard recomputed == scheduled else {
            return "signature_changed"
        }
        return nil
    }
}
