import XCTest
@testable import IndooroNavigationCore

/// Pure upsell plan logic: canonical shopping state (8.8), handled opportunity lifecycle (9.13, 9.14),
/// one-retry rule (10.10) and the lifecycle regressions behind 11.5 to 11.7.
final class UpsellPlanLogicTests: XCTestCase {

    private let listID = UUID(uuidString: "11111111-1111-1111-1111-111111111111")!
    private let storeID = UUID(uuidString: "22222222-2222-2222-2222-222222222222")!
    private let otherStoreID = UUID(uuidString: "33333333-3333-3333-3333-333333333333")!

    // MARK: - Canonical shopping state (8.8)

    func testDuplicateOpenAndCompletedRowsKeepOpenPrecedence() {
        let state = UpsellPlanLogic.canonicalShoppingState(
            openProductIds: [92, 92, 93],
            completedProductIds: [93, 94, 94, 95]
        )

        XCTAssertEqual(state.currentProductIds, [92, 93])
        XCTAssertEqual(state.completedProductIds, [94, 95])
        XCTAssertEqual(state.overlapRemovedCount, 1, "93 is open and done; only the completed copy is removed")
        XCTAssertEqual(state.rawOpenCount, 3)
        XCTAssertEqual(state.rawCompletedCount, 4)
    }

    func testOpenAndCompletedSetsAreDisjointAndSorted() {
        let state = UpsellPlanLogic.canonicalShoppingState(
            openProductIds: [300, 5, 300, 42],
            completedProductIds: [42, 7, 300, 7, 1]
        )

        XCTAssertEqual(state.currentProductIds, [5, 42, 300])
        XCTAssertEqual(state.completedProductIds, [1, 7])
        XCTAssertTrue(Set(state.currentProductIds).isDisjoint(with: state.completedProductIds))
    }

    func testCanonicalStateIsIndependentOfRowOrderAndDuplicates() {
        let first = UpsellPlanLogic.canonicalShoppingState(openProductIds: [92, 93], completedProductIds: [94])
        let second = UpsellPlanLogic.canonicalShoppingState(openProductIds: [93, 92, 93, 92], completedProductIds: [94, 94])

        XCTAssertEqual(first.currentProductIds, second.currentProductIds)
        XCTAssertEqual(first.completedProductIds, second.completedProductIds)
        XCTAssertEqual(first.overlapRemovedCount, 0)
        XCTAssertEqual(second.overlapRemovedCount, 0)
    }

    func testTriggerIdsAreNormalizedInIdentityAndSignature() {
        let unsorted = HandledOpportunityIdentity(
            listID: listID, storeID: storeID, source: "shopping_list",
            opportunityID: "station:shelf-1", triggerProductIds: [93, 92, 92]
        )
        let canonical = HandledOpportunityIdentity(
            listID: listID, storeID: storeID, source: "shopping_list",
            opportunityID: "station:shelf-1", triggerProductIds: [92, 93]
        )
        XCTAssertEqual(unsorted, canonical)
        XCTAssertEqual(unsorted.triggerProductIds, [92, 93])

        let signatureA = makeSignature(opportunityTriggers: [93, 92, 92])
        let signatureB = makeSignature(opportunityTriggers: [92, 93])
        XCTAssertEqual(signatureA, signatureB)
    }

    func testStatusOnlyRepeatsProduceSameSignature() {
        let first = makeSignature(
            open: [92, 93, 93],
            completed: [94],
            opportunityTriggers: [92]
        )
        let repeated = makeSignature(
            open: [93, 92],
            completed: [94, 93, 94],
            opportunityTriggers: [92, 92]
        )
        XCTAssertEqual(first, repeated, "93 is open in both calls, so it is not part of the completed set")
    }

    func testRequestPayloadUsesSignatureArrays() throws {
        let state = UpsellPlanLogic.canonicalShoppingState(openProductIds: [93, 92, 93], completedProductIds: [92, 95])
        let signature = PlanRequestSignature(
            listID: listID,
            storeId: storeID,
            storeCode: "ha-01",
            source: "shopping_session",
            shoppingState: state,
            opportunities: [PlanOpportunitySignature(opportunityId: "item:a", triggerProductIds: [93])]
        )
        let request = UpsellPlanRequest(
            storeId: storeID,
            storeCode: "HA-01",
            shoppingListId: listID.uuidString,
            currentListProductIds: signature.currentProductIds,
            completedProductIds: signature.completedProductIds,
            source: "shopping_session",
            opportunities: []
        )

        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: Any]
        XCTAssertEqual(json?["currentListProductIds"] as? [Int], [92, 93])
        XCTAssertEqual(json?["completedProductIds"] as? [Int], [95])
        XCTAssertEqual(signature.currentProductIds, [92, 93])
        XCTAssertEqual(signature.completedProductIds, [95])
    }

    func testCanonicalSourceTreatsSessionAndListAsOneBucket() {
        XCTAssertEqual(UpsellPlanLogic.canonicalSource("shopping_session"), "shopping_list")
        XCTAssertEqual(UpsellPlanLogic.canonicalSource(" Shopping_List "), "shopping_list")
        XCTAssertEqual(UpsellPlanLogic.canonicalSource("other"), "other")
    }

    // MARK: - Handled opportunity lifecycle (9.13, 9.14, 11.5, 11.7)

    func testReopenAndRecompleteWithSameTriggersStaysSuppressed() {
        var handled = HandledOpportunitySet()
        let completed = identity(opportunity: "item:milk", triggers: [92])
        XCTAssertTrue(handled.insert(completed))

        // Reopen and complete again: same identity, insert reports it was already handled.
        let recompleted = identity(opportunity: "item:milk", triggers: [92])
        XCTAssertFalse(handled.insert(recompleted))
        XCTAssertEqual(
            UpsellPlanLogic.suppressionReason(for: recompleted, handled: handled, activeIdentity: nil),
            "handled_opportunity"
        )
    }

    func testStatusToggleAndProgressCallbacksKeepHandledIdentitySuppressed() {
        var handled = HandledOpportunitySet()
        handled.insert(identity(opportunity: "station:shelf-7", triggers: [10, 11]))

        // Progress callbacks rebuild the same identity from unchanged station composition.
        for _ in 0..<3 {
            let rebuilt = identity(opportunity: "station:shelf-7", triggers: [11, 10, 11])
            XCTAssertEqual(
                UpsellPlanLogic.suppressionReason(for: rebuilt, handled: handled, activeIdentity: nil),
                "handled_opportunity"
            )
        }
    }

    func testChangedTriggerCompositionIsNewIdentity() {
        var handled = HandledOpportunitySet()
        handled.insert(identity(opportunity: "station:shelf-7", triggers: [10, 11]))

        let changed = identity(opportunity: "station:shelf-7", triggers: [10, 12])
        XCTAssertNil(UpsellPlanLogic.suppressionReason(for: changed, handled: handled, activeIdentity: nil))
        XCTAssertEqual(handled.count, 1, "the previous composition stays handled")
    }

    func testResetClearsHandledStateSoIntendedOpportunityCanPlanAgain() {
        var handled = HandledOpportunitySet()
        let milk = identity(opportunity: "item:milk", triggers: [92])
        handled.insert(milk)

        handled.removeAll()

        XCTAssertNil(UpsellPlanLogic.suppressionReason(for: milk, handled: handled, activeIdentity: nil))
        XCTAssertEqual(handled.count, 0)
    }

    func testStoreChangeRemovesPreviousStoreIdentitiesOnly() {
        var handled = HandledOpportunitySet()
        let previousStore = identity(opportunity: "item:milk", triggers: [92])
        let otherStore = HandledOpportunityIdentity(
            listID: listID, storeID: otherStoreID, source: "shopping_list",
            opportunityID: "item:bread", triggerProductIds: [93]
        )
        handled.insert(previousStore)
        handled.insert(otherStore)

        let removed = handled.removeIdentities(notForStore: otherStoreID)

        XCTAssertEqual(removed, 1)
        XCTAssertNil(UpsellPlanLogic.suppressionReason(for: previousStore, handled: handled, activeIdentity: nil))
        XCTAssertNotNil(UpsellPlanLogic.suppressionReason(for: otherStore, handled: handled, activeIdentity: nil))
    }

    func testSessionAndListSourcesShareHandledIdentity() {
        var handled = HandledOpportunitySet()
        handled.insert(HandledOpportunityIdentity(
            listID: listID, storeID: storeID, source: "shopping_session",
            opportunityID: "item:milk", triggerProductIds: [92]
        ))

        let fromList = identity(opportunity: "item:milk", triggers: [92])
        XCTAssertTrue(handled.contains(fromList))
    }

    func testActivePromptClosingCannotMarkDifferentOpportunity() {
        // 11.5: only the closed prompt's identity is inserted; other opportunities stay plannable.
        var handled = HandledOpportunitySet()
        let activePrompt = identity(opportunity: "station:shelf-1", triggers: [92, 93])
        let other = identity(opportunity: "station:shelf-2", triggers: [92, 93])

        handled.insert(activePrompt)

        XCTAssertNil(UpsellPlanLogic.suppressionReason(for: other, handled: handled, activeIdentity: nil))
        XCTAssertFalse(handled.contains(other))
    }

    func testActivePromptIdentityIsSuppressedWhileShown() {
        let handled = HandledOpportunitySet()
        let shown = identity(opportunity: "item:eggs", triggers: [40])

        XCTAssertEqual(
            UpsellPlanLogic.suppressionReason(for: shown, handled: handled, activeIdentity: shown),
            "active_prompt_opportunity"
        )
    }

    func testLoadedEmptyCacheHitCompletedOnceStaysHandledAcrossSignatures() {
        // 11.6: a loaded-empty result is consumed once; the handled identity keeps the opportunity out of later plans.
        var handled = HandledOpportunitySet()
        let empty = identity(opportunity: "item:risotto", triggers: [70])
        handled.insert(empty)

        // A later list state (extra open item) produces a different request signature for the same opportunity identity.
        let original = makeSignature(open: [70], completed: [], opportunityTriggers: [70])
        let laterSignature = makeSignature(open: [70, 80], completed: [], opportunityTriggers: [70])
        XCTAssertNotEqual(original, laterSignature)
        XCTAssertEqual(
            UpsellPlanLogic.suppressionReason(for: empty, handled: handled, activeIdentity: nil),
            "handled_opportunity"
        )
    }

    // MARK: - Retry (10.10)

    func testCandidateLookupFailureSchedulesExactlyOneRetry() {
        let signature = makeSignature(open: [92], opportunityTriggers: [92])
        var state = PlanRetryState()
        let failure = PlanResponseEvidence(
            responseSource: "none",
            fallbackReason: "candidate_lookup_failed",
            retryable: true
        )

        XCTAssertEqual(state.decision(for: failure, signature: signature), .scheduleRetry(delay: 1.0, retryNumber: 1))
        state.recordRetryStarted(for: signature)

        XCTAssertEqual(state.decision(for: failure, signature: signature), .stop(reason: "retry_exhausted"))
        XCTAssertTrue(state.isExhausted(signature))
    }

    func testRetryBudgetIsKeyedByCanonicalSignature() {
        let first = makeSignature(open: [92], opportunityTriggers: [92])
        let second = makeSignature(open: [92, 93], opportunityTriggers: [92])
        var state = PlanRetryState()
        let failure = PlanResponseEvidence(responseSource: "none", fallbackReason: "candidate_lookup_failed", retryable: true)

        state.recordRetryStarted(for: first)

        XCTAssertEqual(state.decision(for: failure, signature: second), .scheduleRetry(delay: 1.0, retryNumber: 1))
        XCTAssertFalse(state.isExhausted(second))
    }

    func testRetryDelayIsConfigurable() {
        let signature = makeSignature(open: [92], opportunityTriggers: [92])
        let failure = PlanResponseEvidence(responseSource: "none", fallbackReason: "candidate_lookup_failed", retryable: true)

        XCTAssertEqual(PlanRetryState().retryDelay, 1.0)
        XCTAssertEqual(
            PlanRetryState(retryDelay: 0.25).decision(for: failure, signature: signature),
            .scheduleRetry(delay: 0.25, retryNumber: 1)
        )
    }

    func testNoEligibleNonFailureOutcomeRetries() {
        let signature = makeSignature(open: [92], opportunityTriggers: [92])
        let state = PlanRetryState()
        let outcomes: [(String, PlanResponseEvidence)] = [
            ("ai_empty", PlanResponseEvidence(responseSource: "openai", fallbackReason: nil, retryable: nil, openAiElapsedMs: 800, totalTokens: 400)),
            ("filtered_empty_is_openai", PlanResponseEvidence(responseSource: "openai", fallbackReason: nil, retryable: false)),
            ("openai_timeout", PlanResponseEvidence(responseSource: "fallback", fallbackReason: "openai_timeout", retryable: false, openAiElapsedMs: 25_000)),
            ("invalid_ai_output", PlanResponseEvidence(responseSource: "fallback", fallbackReason: "invalid_ai_output", retryable: false, totalTokens: 300)),
            ("cache_hit", PlanResponseEvidence(responseSource: "cache", fallbackReason: "candidate_lookup_failed", retryable: true)),
            ("token_consuming", PlanResponseEvidence(responseSource: "none", fallbackReason: "candidate_lookup_failed", retryable: true, totalTokens: 5000)),
            ("openai_timing_only", PlanResponseEvidence(responseSource: "none", fallbackReason: "candidate_lookup_failed", retryable: true, openAiElapsedMs: 120)),
            ("no_candidates", PlanResponseEvidence(responseSource: "none", fallbackReason: "no_candidates", retryable: false)),
            ("retryable_flag_missing", PlanResponseEvidence(responseSource: "none", fallbackReason: "candidate_lookup_failed", retryable: nil)),
            ("empty_evidence", PlanResponseEvidence())
        ]

        for (name, evidence) in outcomes {
            XCTAssertEqual(
                state.decision(for: evidence, signature: signature),
                .stop(reason: "not_retryable"),
                "\(name) must not retry"
            )
        }
    }

    func testExplicitLookupFailureWithoutOpenAiUsageIsRetryable() {
        let evidence = PlanResponseEvidence(
            responseSource: "none",
            fallbackReason: "candidate_lookup_failed",
            retryable: true,
            openAiElapsedMs: nil,
            totalTokens: nil
        )
        XCTAssertTrue(evidence.isRetryableCandidateLookupFailure)
    }

    func testSuccessfulRetryClearsBudgetForSignature() {
        let signature = makeSignature(open: [92], opportunityTriggers: [92])
        var state = PlanRetryState()
        let failure = PlanResponseEvidence(responseSource: "none", fallbackReason: "candidate_lookup_failed", retryable: true)
        state.recordRetryStarted(for: signature)

        state.clear(signature)

        XCTAssertFalse(state.isExhausted(signature))
        XCTAssertEqual(state.decision(for: failure, signature: signature), .scheduleRetry(delay: 1.0, retryNumber: 1))
    }

    func testObsoleteSignatureDiscardsRetryState() {
        let old = makeSignature(open: [92], opportunityTriggers: [92])
        let current = makeSignature(open: [92, 93], opportunityTriggers: [92])
        var state = PlanRetryState()
        state.recordRetryStarted(for: old)

        let discarded = state.discardObsolete(except: current)

        XCTAssertEqual(discarded, 1)
        XCTAssertFalse(state.isExhausted(old))
    }

    func testRetryBlockReasonsCoverEachPreconditionAndAllowValidRetry() {
        let scheduled = makeSignature(open: [92], opportunityTriggers: [92])
        let changed = makeSignature(open: [92, 93], opportunityTriggers: [92])

        XCTAssertEqual(UpsellPlanLogic.retryBlockReason(scheduled: scheduled, recomputed: scheduled, hasActiveRequest: false, sessionMatches: false, storeStillAuthorized: true), "session_reset")
        XCTAssertEqual(UpsellPlanLogic.retryBlockReason(scheduled: scheduled, recomputed: scheduled, hasActiveRequest: false, sessionMatches: true, storeStillAuthorized: false), "store_not_authorized")
        XCTAssertEqual(UpsellPlanLogic.retryBlockReason(scheduled: scheduled, recomputed: scheduled, hasActiveRequest: true, sessionMatches: true, storeStillAuthorized: true), "request_in_flight")
        XCTAssertEqual(UpsellPlanLogic.retryBlockReason(scheduled: scheduled, recomputed: nil, hasActiveRequest: false, sessionMatches: true, storeStillAuthorized: true), "no_unhandled_opportunities")
        XCTAssertEqual(UpsellPlanLogic.retryBlockReason(scheduled: scheduled, recomputed: changed, hasActiveRequest: false, sessionMatches: true, storeStillAuthorized: true), "signature_changed")
        XCTAssertNil(UpsellPlanLogic.retryBlockReason(scheduled: scheduled, recomputed: scheduled, hasActiveRequest: false, sessionMatches: true, storeStillAuthorized: true))
    }

    func testRetryableResponseDecodesFromBackendShape() throws {
        let json = """
        {
          "opportunities": [{"opportunityId": "item:milk", "triggerProductIds": [92], "suggestions": []}],
          "source": "none",
          "expiresAt": null,
          "debug": {
            "requestId": "req-1", "model": null, "responseSource": "none",
            "elapsedMs": 4, "openAiElapsedMs": null, "inputTokens": null, "outputTokens": null,
            "totalTokens": null, "cachedInputTokens": null, "reasoningTokens": null,
            "fallbackReason": "candidate_lookup_failed", "opportunityCount": null,
            "candidateCount": null, "retryable": true
          }
        }
        """
        let decoded = try JSONDecoder().decode(UpsellPlanResponse.self, from: Data(json.utf8))
        let debug = try XCTUnwrap(decoded.debug)
        let evidence = PlanResponseEvidence(
            responseSource: debug.responseSource,
            fallbackReason: debug.fallbackReason,
            retryable: debug.retryable,
            openAiElapsedMs: debug.openAiElapsedMs,
            totalTokens: debug.totalTokens,
            inputTokens: debug.inputTokens,
            outputTokens: debug.outputTokens
        )
        XCTAssertTrue(evidence.isRetryableCandidateLookupFailure)
    }

    func testLegacyDebugWithoutRetryableDecodesAsNotRetryable() throws {
        let json = """
        {
          "opportunities": [],
          "source": "openai",
          "expiresAt": null,
          "debug": {"requestId": "req-2", "responseSource": "openai", "fallbackReason": null}
        }
        """
        let decoded = try JSONDecoder().decode(UpsellPlanResponse.self, from: Data(json.utf8))
        XCTAssertNil(decoded.debug?.retryable)
    }

    // MARK: - Helpers

    private func identity(opportunity: String, triggers: [Int]) -> HandledOpportunityIdentity {
        HandledOpportunityIdentity(
            listID: listID,
            storeID: storeID,
            source: "shopping_session",
            opportunityID: opportunity,
            triggerProductIds: triggers
        )
    }

    private func makeSignature(
        open: [Int] = [92],
        completed: [Int] = [],
        opportunityTriggers: [Int]
    ) -> PlanRequestSignature {
        PlanRequestSignature(
            listID: listID,
            storeId: storeID,
            storeCode: "ha-01",
            source: "shopping_session",
            shoppingState: UpsellPlanLogic.canonicalShoppingState(openProductIds: open, completedProductIds: completed),
            opportunities: [PlanOpportunitySignature(opportunityId: "item:x", triggerProductIds: opportunityTriggers)]
        )
    }
}
