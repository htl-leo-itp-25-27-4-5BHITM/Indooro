## 1. Analysis And Baseline

- [x] 1.1 Re-read current `UpsellSuggestionService`, `OpenSearchService`, `UpsellDtos`, mobile upsell tests, and current iOS `UpsellSuggestionStore` before editing.
- [ ] 1.2 Capture current `/api/mobile/upsell/plan` behavior for representative products from logs or local tests, including `source`, `candidateCount`, `inputTokens`, `outputTokens`, and suggestion products.
- [x] 1.3 Document the current category-code assumptions from demo product `layoutCode` values, including at least fruit, sauce, pasta, cereal/oats, baking staples, dairy/butter, bread/bakery if available, and unknown categories.
- [x] 1.4 Identify the current backend cache context version used by plan responses and note the exact version bump needed to avoid reusing broad-candidate cached responses.
- [x] 1.5 Confirm no iOS model change is required for the planned response shape before backend implementation begins.

## 2. Backend Candidate Ranking Model

- [x] 2.1 Add a small internal representation for an upsell opportunity ranking input containing opportunity id, trigger product ids, trigger names, resolved trigger products, and derived trigger category codes.
- [x] 2.2 Add a small internal representation for a scored candidate containing product, derived category code, score, score reasons, and whether it matched current store context.
- [x] 2.3 Implement category extraction from `layoutCode` with safe handling for null, blank, and invalid values.
- [x] 2.4 Implement product-name normalization for keyword matching using lowercase, trimmed text and simple German character-safe matching.
- [x] 2.5 Implement hard exclusion helpers for current list product ids, completed product ids, trigger product ids, duplicate candidates, and invalid candidate records.
- [x] 2.6 Add unit tests for category extraction, name normalization, and hard exclusion behavior.

## 3. Complement Rules

- [x] 3.1 Define an initial category complement matrix for the current demo catalog category codes, including butter/dairy, pasta, sauces, fruit, cereal/oats, baking staples, bread/bakery where present, and fallback unknown categories.
- [x] 3.2 Define product keyword complement rules for common triggers: butter, pasta/spaghetti, oats/cereal, apples/bananas/berries, milk/yogurt, bread, coffee/tea, sauces, and baking staples.
- [x] 3.3 Define weak-association penalties so butter-like triggers rank pasta and tomato-sauce candidates below direct bread/baking/breakfast candidates when those candidates exist.
- [x] 3.4 Define alternative-product penalties so candidate products that are essentially the same class as the trigger are reduced unless the rule explicitly permits alternatives.
- [x] 3.5 Keep the first implementation in backend code or a simple config structure; do not add admin UI or database-managed rules in this change.
- [x] 3.6 Add focused unit tests for the category matrix and keyword complement scoring.

## 4. OpenSearch Candidate Retrieval

- [x] 4.1 Review `OpenSearchService.findUpsellCandidates(...)` and decide whether to keep the current bounded `matchAll` helper or add an internal category-aware helper.
- [x] 4.2 If adding helper behavior, keep it internal to backend services and do not expose a new public product-by-category endpoint.
- [x] 4.3 Ensure store-scoped lookup still prefers `storeId` and `storeCode` where product documents support those fields.
- [x] 4.4 Ensure a bounded non-store fallback pool can be merged when store-scoped lookup returns too few usable candidates.
- [x] 4.5 Ensure broad candidate retrieval remains capped by `upsell.max-candidates` or a new explicit broad-candidate config value.
- [x] 4.6 Add or update tests proving candidate retrieval remains bounded and returns an empty list rather than fabricated products when lookup fails.

## 5. Per-Opportunity Candidate Scoring

- [x] 5.1 Implement a method that scores candidates separately for each normalized `UpsellOpportunityRequest`.
- [x] 5.2 Apply hard exclusions before scoring and before any OpenAI payload construction.
- [x] 5.3 Apply store match, layout availability, category complement, keyword complement, alternative-product penalty, and weak-association penalty scores.
- [x] 5.4 Sort candidates by score descending, then store/layout preference, then deterministic product name/id fallback to keep tests stable.
- [x] 5.5 Add a configurable per-opportunity candidate limit, defaulting to a small value such as 10 or 12.
- [x] 5.6 Add a configurable minimum deterministic score threshold below which an opportunity may return no fallback suggestions.
- [x] 5.7 Add tests proving each opportunity receives its own candidate order rather than sharing one global top candidate list.

## 6. Plan Ranking Pipeline

- [x] 6.1 Refactor `/api/mobile/upsell/plan` internals so broad OpenSearch candidates are transformed into per-opportunity ranked candidate lists.
- [x] 6.2 Preserve existing request validation, normalized opportunities, response shape, event/cache behavior, and exception behavior.
- [x] 6.3 Bump the plan cache context version so old broad-ranking cached responses are not reused.
- [x] 6.4 Include candidate scoring inputs in the plan context hash where necessary so different ranking limits/rules do not collide.
- [x] 6.5 Keep single-product `/api/mobile/upsell/suggestions` compatible, either by reusing the new candidate scorer for one synthetic opportunity or by preserving current behavior with tests.
- [x] 6.6 Add regression tests for cache hit behavior after the plan cache context version change.

## 7. OpenAI Payload And Structured Output

- [x] 7.1 Change the plan OpenAI payload from one global `candidateProducts` array to per-opportunity candidate arrays.
- [x] 7.2 Minimize AI candidate summaries to product id, product name, and derived category code unless tests prove another field is needed.
- [x] 7.3 Keep static instructions and JSON schema stable and dynamic product data last to benefit prompt caching where applicable.
- [x] 7.4 Update the Structured Outputs schema so OpenAI returns known opportunity ids and candidate product ids with concise German reasons and confidence.
- [x] 7.5 Validate AI product ids against the candidate set for that specific opportunity, not only against a global candidate map.
- [x] 7.6 Ensure unknown opportunity ids, product ids from another opportunity, duplicate suggestions, and low-confidence suggestions are discarded.
- [ ] 7.7 Add tests with fake OpenAI output proving cross-opportunity product ids are rejected.

## 8. Deterministic Fallback Quality

- [x] 8.1 Replace global fallback plan ranking with per-opportunity fallback ranking from each opportunity's scored candidates.
- [x] 8.2 Use product-safe German fallback reason text that does not overclaim a specific pairing when the relation is only rule-based.
- [x] 8.3 Return fewer than three suggestions or none when an opportunity does not have enough strong candidates.
- [x] 8.4 Preserve `source=fallback` and `debug.fallbackReason=openai_unavailable_timeout_or_invalid` or more specific fallback reasons where applicable.
- [x] 8.5 Add tests proving fallback for butter-like triggers does not prefer pasta/sauce when bread/baking/breakfast candidates exist.

## 9. Optional AI Skip For Strong Deterministic Matches

- [x] 9.1 Decide whether the first implementation should skip OpenAI for high-confidence deterministic opportunities or only prepare the code path for later.
- [ ] 9.2 If implemented, add a configurable auto-accept score threshold and minimum score margin.
- [ ] 9.3 If implemented, return a clear non-OpenAI source value such as `rules` or `fallback` and include debug metadata that explains no OpenAI call was made.
- [ ] 9.4 Add tests proving OpenAI is not called when deterministic scoring meets the configured auto-accept threshold.
- [x] 9.5 If not implemented, explicitly leave this task group documented as deferred in the final implementation notes.

## 10. Debugging And Observability

- [x] 10.1 Extend backend logs to include request id, response source, opportunity count, broad candidate count, per-opportunity candidate counts, elapsed time, OpenAI elapsed time, and token usage.
- [x] 10.2 Ensure debug logs never include the OpenAI API key or full sensitive headers.
- [x] 10.3 Consider adding optional response debug fields for per-opportunity candidate counts without breaking current Swift decoding.
- [x] 10.4 Keep iOS debug logging compatible with existing `preloadPlan decoded ... debug=...` output.
- [x] 10.5 Add a manual debug checklist explaining how to identify `source=openai`, `source=fallback`, `source=cache`, and no-candidate cases from console logs.

## 11. Evaluation Fixtures

- [x] 11.1 Create backend test fixtures for butter-like triggers with bread/baking/breakfast/dairy candidates and pasta/sauce distractors.
- [x] 11.2 Create backend test fixtures for pasta-like triggers with sauce/tomato candidates and unrelated distractors.
- [x] 11.3 Create backend test fixtures for fruit-like triggers with yogurt/oats/breakfast candidates and unrelated distractors.
- [x] 11.4 Create backend test fixtures for oats/cereal triggers with milk/yogurt/fruit candidates and unrelated distractors.
- [x] 11.5 Create backend test fixtures for unknown-category triggers that verify safe fallback or empty suggestions.
- [x] 11.6 Add assertions for excluded current-list, completed, trigger, and `addedFromUpsell`-equivalent products where represented in backend request inputs.
- [x] 11.7 Record expected ranking outcomes in test names or fixture comments so future maintainers understand why a product should rank high or low.

## 12. Backend Tests

- [x] 12.1 Update `UpsellSuggestionServiceTest` for per-opportunity candidate ranking.
- [x] 12.2 Update `MobileUpsellResourceTest` only if response debug shape or validation expectations change.
- [ ] 12.3 Add tests for OpenAI success using per-opportunity candidate arrays.
- [ ] 12.4 Add tests for OpenAI invalid product ids, cross-opportunity product ids, invalid opportunity ids, duplicate ids, and low-confidence ids.
- [ ] 12.5 Add tests for fallback when OpenAI is disabled, unconfigured, times out, or returns invalid output.
- [x] 12.6 Add tests for backend cache source values and context hash changes.
- [x] 12.7 Ensure all new tests use deterministic product fixtures and do not require network access.

## 13. iOS Compatibility Check

- [x] 13.1 Verify current Swift `UpsellPlanResponse` models decode responses after backend debug additions, or avoid debug shape changes if Swift is strict.
- [x] 13.2 Verify `UpsellSuggestionStore` local cache keys still match unchanged `opportunityId` values.
- [x] 13.3 Verify PendingOpportunity retry still works when the backend returns improved plan suggestions after a station was already completed.
- [x] 13.4 Verify products added from suggestions still use `addedFromUpsell=true` and are excluded from future trigger opportunities.
- [x] 13.5 Run the final iOS build after backend contract checks even if no Swift files change.

## 14. Token And Latency Verification

- [ ] 14.1 Measure or log current baseline `inputTokens`, `outputTokens`, `totalTokens`, `elapsedMs`, and `openAiElapsedMs` for representative plan requests before the ranking change.
- [ ] 14.2 Measure the same metrics after per-opportunity candidate payload changes.
- [ ] 14.3 Confirm input token count decreases for multi-station plans with broad candidate pools.
- [ ] 14.4 Confirm response latency stays within the existing mobile/backend timeout expectations.
- [ ] 14.5 Confirm prompt caching-friendly structure keeps static prompt/schema before dynamic opportunity/product data.

## 15. Manual QA

- [ ] 15.1 Manually test a shopping tour containing butter and verify suggestions prefer direct complements over pasta/sauce when those complements exist.
- [ ] 15.2 Manually test a shopping tour containing pasta and verify sauce/tomato-style complements remain available.
- [ ] 15.3 Manually test a shopping tour containing fruit and verify breakfast/yogurt/oats-style complements rank well.
- [ ] 15.4 Manually test a fast check-off before plan response and verify PendingOpportunity retry still shows the correct station prompt.
- [ ] 15.5 Manually test OpenAI-disabled or API-key-missing fallback behavior and verify suggestions are opportunity-specific or empty.
- [ ] 15.6 Manually test repeated route station completions and verify there are no extra `/plan` requests beyond current duplicate/cache logic.

## 16. Verification Commands

- [x] 16.1 Run `sh ./mvnw test -Dtest=UpsellSuggestionServiceTest,MobileUpsellResourceTest` from `backend/indooro_server`.
- [ ] 16.2 Run any broader backend test set needed if shared OpenSearch or product DTO behavior changes.
- [x] 16.3 Run `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
- [x] 16.4 Run `xcodebuild -project swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj -scheme MCindooroApp -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build`.
- [x] 16.5 Run `git diff --check`.
- [x] 16.6 Run a secret scan over changed backend/iOS files for OpenAI key patterns before commit.

## 17. Deployment And Rollback Notes

- [x] 17.1 Document whether the implementation changes only backend behavior or also requires an iOS app update.
- [ ] 17.2 If backend-only, build and publish the backend image according to the repository's existing deployment process.
- [ ] 17.3 Deploy to LeoCloud only after tests and local smoke checks pass.
- [ ] 17.4 Verify live `/api/mobile/upsell/plan` response source/debug behavior after deployment using a representative request.
- [x] 17.5 Record rollback instructions: redeploy the previous backend image; no database rollback should be required unless implementation adds persistence, which is currently out of scope.

## 18. Documentation And Handoff

- [x] 18.1 Update implementation notes or relevant documentation with the candidate ranking architecture and how to interpret debug logs.
- [x] 18.2 Document initial complement rules and category assumptions so future changes can tune them intentionally.
- [x] 18.3 Document any new environment variables and their defaults.
- [ ] 18.4 Summarize final changed files, tests run, manual QA results, token/latency comparison, remaining risks, and any deferred items.
- [ ] 18.5 Mark this OpenSpec change ready for verification/archive only after implementation, tests, manual QA, and deployment notes are complete.
