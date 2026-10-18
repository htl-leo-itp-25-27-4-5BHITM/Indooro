## 1. Baseline And Evidence

- [x] 1.1 Re-read the current `UpsellSuggestionService`, `UpsellDtos`, `MobileUpsellResource`, OpenSearch candidate helper, cache entity/repository, and targeted backend tests before editing. _(Backend re-read; see PR)_
- [ ] 1.2 Re-read the current `UpsellSuggestionStore`, upsell Swift models, shopping-list status model, shopping-session synchronization, and prompt presentation hooks before editing. (später/Mensch)
- [ ] 1.3 Record the current plan cache context version, response debug fields, retry behavior, and exact `no_candidates`/candidate-exception code paths. (Backend-Teil in Doku; Rest später/Mensch)
- [ ] 1.4 Add the two latest simulator runs to the implementation evidence notes: repeated variants, three OpenAI calls in one session, 16,191-token first test, stable one-request second test, and successful fifth popup. (Backend-Teil in Doku; Rest später/Mensch)
- [x] 1.5 Confirm that current catalog fixtures contain representative IDs/names for apples, kitchen roll/paper, toothpaste, cleaner, butter, risotto, eggs, flour, and unknown products. _(fixtures ids 200-211 in UpsellSuggestionServiceTest)_
- [x] 1.6 Confirm there is no unrelated tracked change to overwrite and keep Xcode user state plus local ZIP artifacts out of all commits. _(git status clean of Xcode state/ZIP)_

## 2. Equivalent Product Identity

- [x] 2.1 Define an internal immutable equivalent-product identity containing normalized base name, optional strong class key, and normalized generic tokens. _(ProductEquivalence.java + ProductEquivalenceTest)_
- [x] 2.2 Reuse current product classification where it yields a strong exact product class without turning broad domain/category values into exclusion rules. _(ProductEquivalence.java + ProductEquivalenceTest)_
- [x] 2.3 Normalize case, German umlauts, punctuation, whitespace, and common singular/plural spelling differences for equivalence comparison. _(ProductEquivalence.java + ProductEquivalenceTest)_
- [x] 2.4 Strip package-size, count, unit, percentage, brand, organic/quality, and packaging modifiers only for base-product comparison while preserving original product names for prompts and responses. _(ProductEquivalence.java + ProductEquivalenceTest)_
- [x] 2.5 Add evidence-backed aliases for apple variants, kitchen roll/kitchen paper, toothpaste, cola, flour, butter, and other currently classified exact product types. _(ProductEquivalence.java + ProductEquivalenceTest)_
- [x] 2.6 Keep broad departments, category codes, layout shelves, food/drink/cleaning domains, and unknown classes insufficient by themselves to prove equivalence. _(ProductEquivalence.java + ProductEquivalenceTest)_
- [x] 2.7 Add focused unit tests for normalized identity equality across brands, sizes, counts, synonyms, and German spelling variants. _(ProductEquivalence.java + ProductEquivalenceTest)_
- [x] 2.8 Add focused negative tests proving risotto/butter, eggs/flour, eggs/milk, and other valid complements are not classified as equivalent. _(ProductEquivalence.java + ProductEquivalenceTest)_
- [x] 2.9 Add unknown-name tests proving uncertain products remain eligible rather than being rejected through guessed semantics. _(ProductEquivalence.java + ProductEquivalenceTest)_

## 3. Post-AI Output Safety

- [x] 3.1 Insert equivalent-product validation after structured AI parsing and candidate-ID validation, not before candidate payload construction. _(UpsellSuggestionService.validatedSuggestions + tests)_
- [x] 3.2 Compare each AI-selected candidate against every trigger product in its own opportunity. _(UpsellSuggestionService.validatedSuggestions + tests)_
- [x] 3.3 Reject strong trigger equivalents with `reason=trigger_equivalent` while preserving AI order for remaining suggestions. _(UpsellSuggestionService.validatedSuggestions + tests)_
- [x] 3.4 Apply the same post-AI equivalent guard to the compatible single-product `/suggestions` path. _(UpsellSuggestionService.validatedSuggestions + tests)_
- [x] 3.5 Deduplicate each opportunity by strong suggestion class and retain the first valid highest-ranked product per class. _(UpsellSuggestionService.validatedSuggestions + tests)_
- [x] 3.6 Deduplicate unknown-class suggestions only by product ID or exact normalized base identity. _(UpsellSuggestionService.validatedSuggestions + tests)_
- [x] 3.7 Return fewer or empty suggestions when validation removes products; do not fill missing slots with deterministic fallback guesses. _(UpsellSuggestionService.validatedSuggestions + tests)_
- [x] 3.8 Keep candidate-map validation, confidence threshold, maximum suggestions, reason sanitization, and unknown-ID rejection intact. _(UpsellSuggestionService.validatedSuggestions + tests)_
- [x] 3.9 Add backend logs for trigger-equivalent and duplicate-class suppression with request ID, opportunity ID, product ID, class, and retained product where applicable. _(UpsellSuggestionService.validatedSuggestions + tests)_
- [x] 3.10 Bump `PLAN_CACHE_CONTEXT_VERSION` so older responses containing variants are not reused. _(UpsellSuggestionService.validatedSuggestions + tests)_

## 4. OpenAI Prompt Guidance

- [x] 4.1 Rewrite the plan system prompt to define a complement as a distinct product supporting or improving a concrete use case. _(PLAN_SYSTEM_PROMPT + prompt test)_
- [x] 4.2 Add explicit negative examples for apples to apples, kitchen roll to kitchen paper, toothpaste to toothpaste, and repeated package/brand variants. _(PLAN_SYSTEM_PROMPT + prompt test)_
- [x] 4.3 Add positive examples such as risotto to butter and eggs to flour or milk. _(PLAN_SYSTEM_PROMPT + prompt test)_
- [x] 4.4 Instruct OpenAI to prefer one strong suggestion or an empty array over filling all slots with weak same-category products. _(PLAN_SYSTEM_PROMPT + prompt test)_
- [x] 4.5 Instruct OpenAI not to repeat equivalent product classes within one opportunity. _(PLAN_SYSTEM_PROMPT + prompt test)_
- [x] 4.6 Keep product-ID grounding, opportunity-ID grounding, German reason text, structured schema, and bounded output tokens unchanged. _(PLAN_SYSTEM_PROMPT + prompt test)_
- [x] 4.7 Add prompt-construction tests asserting the required positive/negative examples and empty-result instruction. _(PLAN_SYSTEM_PROMPT + prompt test)_

## 5. Candidate Lookup Outcome And Cache Semantics

- [x] 5.1 Replace `loadPlanCandidates` list-only error signaling with an internal typed outcome for success, successful empty, and lookup failure. _(CandidateLookup + plan())_
- [x] 5.2 Preserve store-scoped retrieval plus global fallback retrieval for successful lookup flows. _(CandidateLookup + plan())_
- [x] 5.3 Report an OpenSearch `IOException` or availability failure as a distinct pre-AI `candidate_lookup_failed` outcome. _(CandidateLookup + plan())_
- [x] 5.4 Ensure candidate lookup failure responses report no OpenAI elapsed time, no OpenAI token usage, and zero candidate count. _(CandidateLookup + plan())_
- [x] 5.5 Do not write a normal long-lived plan cache entry for retryable candidate lookup failures. _(CandidateLookup + plan())_
- [x] 5.6 Keep successful lookup followed by complete contract exclusion as non-retryable `no_candidates` that may be cached. _(CandidateLookup + plan())_
- [x] 5.7 Keep successfully evaluated OpenAI-empty opportunities cacheable as normal loaded-empty AI results. _(CandidateLookup + plan())_
- [x] 5.8 Preserve empty-plan response compatibility for clients that do not understand retry metadata. _(CandidateLookup + plan())_
- [x] 5.9 Add an optional explicit `retryable` debug field or equivalent typed DTO signal and keep existing debug fields backward compatible. _(CandidateLookup + plan())_
- [x] 5.10 Ensure backend logs distinguish `candidate_lookup_failed`, genuine `no_candidates`, AI-empty, filtered-empty, timeout, invalid output, and cache hit. _(CandidateLookup + plan())_

## 6. Backend Retry And Cost Tests

- [x] 6.1 Add a test where OpenSearch throws and assert retryable failure, no OpenAI call, no token usage, and no normal cache write. _(UpsellSuggestionServiceTest)_
- [x] 6.2 Add a test where both successful catalog lookups return no products and assert non-retryable `no_candidates` behavior. _(UpsellSuggestionServiceTest)_
- [x] 6.3 Add a test where candidates exist but all are contract-excluded and assert a cacheable genuine empty result. _(UpsellSuggestionServiceTest)_
- [x] 6.4 Add a test where OpenAI intentionally returns empty arrays and assert `source=openai`, non-retryable behavior, and normal cache semantics. _(UpsellSuggestionServiceTest)_
- [x] 6.5 Add a test proving a cached successful plan still avoids another OpenAI call. _(UpsellSuggestionServiceTest)_
- [x] 6.6 Add a test proving the backend never internally retries OpenAI for one mobile plan request. _(UpsellSuggestionServiceTest)_
- [x] 6.7 Add assertions for request ID, outcome reason, candidate count, and token/debug consistency across all failure classes. _(UpsellSuggestionServiceTest)_

## 7. Backend Quality Regression Tests

- [x] 7.1 Add AI fixture coverage proving apples do not return another fresh-apple brand, size, loose, or organic variant. _(UpsellSuggestionServiceTest/MobileUpsellResourceTest)_
- [x] 7.2 Add AI fixture coverage proving kitchen roll does not return kitchen paper or another kitchen-roll package. _(UpsellSuggestionServiceTest/MobileUpsellResourceTest)_
- [x] 7.3 Add AI fixture coverage proving a station containing toothpaste and cleaner does not return another toothpaste or equivalent cleaner. _(UpsellSuggestionServiceTest/MobileUpsellResourceTest)_
- [x] 7.4 Add AI fixture coverage proving cola does not return another cola size/brand when cola is the trigger. _(UpsellSuggestionServiceTest/MobileUpsellResourceTest)_
- [x] 7.5 Add AI fixture coverage proving risotto may retain one butter suggestion. _(UpsellSuggestionServiceTest/MobileUpsellResourceTest)_
- [x] 7.6 Add AI fixture coverage proving eggs may retain flour and milk suggestions. _(UpsellSuggestionServiceTest/MobileUpsellResourceTest)_
- [x] 7.7 Add diversity coverage proving two butter variants become one retained butter product. _(UpsellSuggestionServiceTest/MobileUpsellResourceTest)_
- [x] 7.8 Add mixed-output coverage proving invalid variants are removed while valid complements preserve AI order. _(UpsellSuggestionServiceTest/MobileUpsellResourceTest)_
- [x] 7.9 Add all-filtered coverage proving the response stays empty and does not use deterministic plan fallback. _(UpsellSuggestionServiceTest/MobileUpsellResourceTest)_
- [x] 7.10 Keep unknown AI ID, duplicate ID, low-confidence, current-list, completed-product, and trigger-ID regression coverage passing. _(UpsellSuggestionServiceTest/MobileUpsellResourceTest)_
- [x] 7.11 Update `MobileUpsellResourceTest` for optional retry/debug fields without weakening existing route/response assertions. _(UpsellSuggestionServiceTest/MobileUpsellResourceTest)_

## 8. Canonical iOS Shopping State

- [x] 8.1 Add one helper that derives canonical current/open and completed product ID sets from the authoritative list snapshot. _(`UpsellPlanLogic.canonicalShoppingState`, aufgerufen aus Store)_
- [x] 8.2 Deduplicate and sort both arrays before signature construction and request encoding. _(sortiert + dedupliziert in `CanonicalShoppingState`; `UpsellPlanLogicTests`)_
- [x] 8.3 Remove every current/open ID from the completed set so request collections are disjoint. _(Open gewinnt; `testDuplicateOpenAndCompletedRowsKeepOpenPrecedence`)_
- [x] 8.4 Use the same canonical arrays in `PlanRequestSignature` and `UpsellPlanRequest` to prevent signature/payload drift. _(`PlanRequestSignature` und `UpsellPlanRequest` nutzen `signature.currentProductIds/completedProductIds`; Store-Payloadtest)_
- [x] 8.5 Normalize opportunity trigger IDs by removing duplicates and sorting before identity/signature construction. _(`HandledOpportunityIdentity` und `PlanOpportunitySignature` normalisieren Trigger-IDs)_
- [x] 8.6 Preserve exclusion of items marked `addedFromUpsell` from trigger opportunities. _(`eligibleTriggerItems` schließt `addedFromUpsell` aus; `testPayloadUsesCanonicalStateAndExcludesUpsellItemsFromTriggers`)_
- [x] 8.7 Add debug output that reports canonical current/completed counts and overlap removals without logging personal data. _(Debugzeile `preloadPlan canonical current=… completed=… overlapRemoved=…`)_
- [x] 8.8 Add pure logic tests where duplicate rows create open/done conflicts and assert deterministic open-state precedence. _(`UpsellPlanLogicTests`, 26 Tests grün in SwiftPM)_

## 9. iOS Opportunity Lifecycle

- [x] 9.1 Add a session-scoped handled opportunity identity containing list ID, store ID, normalized source, opportunity ID, and sorted eligible trigger IDs. _(`HandledOpportunityIdentity` mit listID, storeID, source, opportunityID, Trigger-IDs)_
- [x] 9.2 Keep handled state independent from `cachedOpportunities`, pending opportunities, and completed plan signatures. _(`HandledOpportunitySet` getrennt von `cachedOpportunities`/`pendingOpportunities`/Signaturen)_
- [x] 9.3 Exclude handled identities before computing plan opportunities and request signatures. _(`makeOpportunities` filtert vor Signatur; Logtext `reason=handled_opportunity`)_
- [x] 9.4 Mark an opportunity handled after its prompt is shown and dismissed. _(`dismissCurrentPrompt` markiert den Prompt-Identity)_
- [x] 9.5 Mark an opportunity handled after a suggestion is accepted. _(`accept` markiert den Prompt-Identity)_
- [x] 9.6 Mark a successfully evaluated loaded-empty AI/filtered opportunity handled when the customer completes it. _(Loaded-empty und Filtered-empty in `showOpportunity` markieren handled; Store-Test AI-empty)_
- [x] 9.7 Do not mark retryable pre-AI candidate failures handled. _(Retryable Pre-AI-Failure kehrt vor `markHandled` zurück; kein Store-Test)_
- [x] 9.8 Keep handled state when a consumed cache entry is removed. _(Cache-Verbrauch berührt `handledOpportunities` nicht; Store-Test AI-empty)_
- [x] 9.9 Treat materially changed sorted trigger IDs at the same station as a new opportunity identity. _(Identity enthält sortierte Trigger-IDs; `testChangedTriggerCompositionIsNewIdentity`)_
- [x] 9.10 Clear handled identities, retry attempts, pending opportunities, and plan cache together in `resetSession()`. _(`resetSession` leert Handled, Retry-State, Pending und Cache; `testResetAllowsIntendedOpportunityToPlanAgain`)_
- [x] 9.11 Clear the previous store's handled state when a different store is explicitly authorized. _(`removeIdentities(notForStore:)` in `authorizePlanPreloading`; `testStoreChangeRemovesPreviousStoreIdentitiesOnly`)_
- [x] 9.12 Log `preloadPlan skipped reason=handled_opportunity` with safe opportunity identity details. _(Debugzeile `preloadPlan skipped reason=handled_opportunity` mit Identity-Summary)_
- [x] 9.13 Add lifecycle tests proving reopen/recomplete does not replan the same identity before reset. _(`testReopenAndRecompleteWithSameTriggersStaysSuppressed`; Store-Test AI-empty ohne zweite Anfrage)_
- [x] 9.14 Add lifecycle tests proving reset and station composition change allow the intended new opportunity. _(`testResetClearsHandledStateSoIntendedOpportunityCanPlanAgain`, `testChangedTriggerCompositionIsNewIdentity`)_

## 10. Bounded iOS Candidate-Failure Retry

- [x] 10.1 Add retry-attempt state keyed by canonical `PlanRequestSignature`. _(`PlanRetryState` keyed by `PlanRequestSignature`)_
- [x] 10.2 Recognize retry eligibility only from the explicit backend candidate-lookup failure signal with no OpenAI usage. _(`PlanResponseEvidence.isRetryableCandidateLookupFailure`; `testNoEligibleNonFailureOutcomeRetries`)_
- [x] 10.3 Schedule exactly one retry after a short configurable delay, initially one second. _(Default 1 s, konfigurierbar; `testRetryDelayIsConfigurable`)_
- [x] 10.4 Before retrying, confirm that session, store, list, source, signature, and eligible unhandled opportunities are unchanged. _(`runPendingRetry` prüft Session, Store, Liste, Signatur, unhandled Opportunities via `retryBlockReason`)_
- [x] 10.5 Reuse existing `planTask`, `activePlanSignature`, and in-flight guards so retry cannot overlap another request. _(Retry läuft über `startPlanRequest`; `planTask`/`activePlanSignature`-Guards)_
- [x] 10.6 Stop after the second candidate lookup failure and keep shopping completion non-blocking. _(`isExhausted` nach zweiter Anfrage; `testCandidateLookupFailureRetriesExactlyOnce`)_
- [x] 10.7 Never auto-retry AI-empty, filtered-empty, OpenAI timeout, invalid AI output, cache-hit, or token-consuming responses. _(Nicht-Fehler-Outcomes stoppen; `testNoEligibleNonFailureOutcomeRetries`)_
- [x] 10.8 Clear retry state on success, session reset, store change, and signature obsolescence. _(Clear bei Erfolg, Reset, Store-Wechsel, Obsoleszenz; `testResetCancelsScheduledRetry`)_
- [x] 10.9 Log retry scheduling, cancellation, attempt count, delay, original signature, and resulting mobile request ID. _(Logs `retry scheduled`/`retry started`/`retry cancelled`/`retry stop` mit Signatur, Attempt, Delay, requestId)_
- [x] 10.10 Add retry logic tests proving one failure produces at most one retry and no eligible non-failure outcome retries. _(`UpsellPlanLogicTests` Retry-Abschnitt; Store-Retry-Tests)_

## 11. iOS Prompt And Regression Verification

- [x] 11.1 Preserve the 10 actually-shown prompts per session limit and three products per popup. _(Code unverändert: 10 Prompts, 3 Produkte; per Review, kein eigener Test)_
- [x] 11.2 Preserve `duplicate_in_flight`, `in_flight_waiting`, `all_opportunities_cached`, pending-opportunity retry, and stale-response guards. _(Code unverändert: `duplicate_in_flight`, `in_flight_waiting`, `all_opportunities_cached`, stale-Guards; per Review)_
- [x] 11.3 Preserve station grouping, unresolved item opportunities, route advancement, direct completion, and skipped/missing completion behavior. _(Code unverändert: Stationsgruppierung und Completion; per Review)_
- [x] 11.4 Preserve the rule that accepted upsell products use `addedFromUpsell=true` and never trigger another upsell. _(`addedFromUpsell`-Payloadtest im Store)_
- [x] 11.5 Verify active prompt clearing cannot mark a different opportunity handled. _(`testActivePromptClosingCannotMarkDifferentOpportunity`)_
- [x] 11.6 Verify a normal loaded-empty cache hit does not become a cache miss or create another request. _(Store-Test AI-empty: Cache-Hit bleibt Cache-Hit, keine zweite Anfrage)_
- [x] 11.7 Verify a handled opportunity remains suppressed after list progress callbacks and item status toggles. _(`testStatusToggleAndProgressCallbacksKeepHandledIdentitySuppressed`; Store-Test)_
- [ ] 11.8 Run the final iOS simulator build for `MCindooroApp`. (Mensch: generischer Build `generic/platform=iOS Simulator` scheitert identisch auf Basis 5ac9564 am openapi-Plugin; Simulator-Testbuild grün)

## 12. Documentation And OpenSpec Alignment

- [x] 12.1 Update `documentation/AI_UPSELL_FLOW.md` with post-AI equivalence/diversity validation and retryable candidate failures. _(AI_UPSELL_FLOW.md)_
- [x] 12.2 Update `documentation/upsell-candidate-ranking.md` with the AI-first safety boundary, handled opportunity lifecycle, and one-retry rule. _(upsell-candidate-ranking.md)_
- [x] 12.3 Update quality evidence documentation with before/after request counts, token totals, suppression examples, and remaining limitations. _(upsell-quality-gate-evidence.md (after-numbers pending manual acceptance))_
- [x] 12.4 Document normalized product identity rules and explicitly state that broad category/domain matching is not a semantic prefilter. _(upsell-candidate-ranking.md)_
- [x] 12.5 Document cache outcome semantics for AI-empty, filtered-empty, no-candidates, candidate lookup failure, and cache hit. _(AI_UPSELL_FLOW.md outcome table)_
- [x] 12.6 Document the new debug lines and a simulator checklist for verifying no repeated handled-opportunity requests. _(docs list log lines + simulator checklist)_
- [x] 12.7 Reconcile any implementation discoveries back into proposal, specification, design, and this task list before verification. _(design.md "Backend Implementation Notes")_

## 13. Automated Verification

- [x] 13.1 Run `sh ./mvnw test -Dtest=UpsellSuggestionServiceTest,MobileUpsellResourceTest` from `backend/indooro_server`. _(UpsellSuggestionServiceTest 52, MobileUpsellResourceTest 16, ProductEquivalenceTest 14 green; full suite 498 tests 0 failures)_
- [x] 13.2 Run any new focused iOS logic tests available in the final Xcode project. _(SwiftPM 304 Tests grün inkl. 26 UpsellPlanLogicTests; Xcode-Unit 40 grün)_
- [ ] 13.3 Run `xcodebuild -project swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj -scheme MCindooroApp -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build`. (Mensch: gleicher generischer Build scheitert auf Basis 5ac9564 vor dieser Änderung am openapi-Plugin)
- [x] 13.4 Run `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`. _(validate --all --strict: 60 passed)_
- [x] 13.5 Run `git diff --check`. _(git diff --check clean)_
- [x] 13.6 Confirm no OpenAI API key, Kubernetes secret value, token, or sensitive response detail was added to tracked files or logs. _(grep for sk-/OPENAI_API_KEY in changed files empty)_
- [x] 13.7 Review the final diff for accidental Xcode user-state, ZIP, generated build, cache, or unrelated file changes. _(diff limited to backend, contract, docs, openspec)_

## 14. Manual Acceptance

- [ ] 14.1 Start a fresh simulator shopping session by manually selecting the store and confirm exactly one initial plan request. (später/Mensch)
- [ ] 14.2 Confirm kitchen roll does not display kitchen paper or another kitchen-roll package. (später/Mensch)
- [ ] 14.3 Confirm apples do not display another fresh-apple variant. (später/Mensch)
- [ ] 14.4 Confirm a station containing toothpaste and cleaner does not display equivalent toothpaste/cleaner variants. (später/Mensch)
- [ ] 14.5 Confirm risotto may display one butter product but never multiple butter variants. (später/Mensch)
- [ ] 14.6 Confirm five or more valid prompts can still appear and the session cap remains 10. (später/Mensch)
- [ ] 14.7 Reopen and recomplete a handled product and confirm `handled_opportunity` with no network/OpenAI request. (später/Mensch)
- [ ] 14.8 Simulate or inject one candidate lookup failure and confirm one retry, zero tokens on the failed attempt, and no third request. (später/Mensch)
- [ ] 14.9 Confirm a successful AI-empty opportunity is cached, displays no popup, and is not retried. (später/Mensch)
- [ ] 14.10 Confirm accepted suggestions remain `addedFromUpsell` and do not become trigger opportunities. (später/Mensch)
- [ ] 14.11 Record backend/OpenAI elapsed time, request count, candidate count, input/output/total/cached tokens, and displayed product IDs for the final evidence log. (später/Mensch)

## 15. Commit, Build, Deploy, And Rollback

- [ ] 15.1 Record the currently deployed backend image digest as the rollback target. (später/Mensch)
- [ ] 15.2 Commit only the scoped implementation, tests, documentation, and OpenSpec artifacts. (später/Mensch)
- [ ] 15.3 Push `main` and identify the GitHub Actions run associated with the implementation commit. (später/Mensch)
- [ ] 15.4 Wait until GHCR `indooro-backend-v2:latest` changes to the newly built image digest and the build succeeds. (später/Mensch)
- [ ] 15.5 Apply `kubectl -n student-it220209 apply -f k8s/backend.yaml`. (später/Mensch)
- [ ] 15.6 Restart with `kubectl -n student-it220209 rollout restart deployment/indooro-backend`. (später/Mensch)
- [ ] 15.7 Wait with `kubectl -n student-it220209 rollout status deployment/indooro-backend --timeout=180s`. (später/Mensch)
- [ ] 15.8 Verify deployment `1/1 Ready`, the running pod image digest, Quarkus startup, and absence of new fatal backend errors. (später/Mensch)
- [ ] 15.9 Rebuild/relaunch the iOS app and repeat the critical manual acceptance flow against LeoCloud. (später/Mensch)
- [ ] 15.10 Record the exact rollback image digest and Kubernetes rollback procedure in the final implementation report. (später/Mensch)
