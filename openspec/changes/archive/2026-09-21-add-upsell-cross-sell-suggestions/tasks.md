## 1. Phase 1 Analyse

- [x] 1.1 Confirm the final iOS target path, Xcode project/scheme, and build command for `swift/indooro-EinkaeuferFinal/indooroApp`.
- [x] 1.2 Re-read current backend product, OpenSearch, mobile store, recipe mapping, and application config files before implementation.
- [x] 1.3 Re-read current iOS product search, shopping-list, shopping-session, store map, and content view files before implementation.
- [x] 1.4 Confirm whether current product index data has only `id`, `name`, `price`, `layoutCode`, `storeId`, and `storeCode`, or whether richer fields are available at implementation time.
- [x] 1.5 Confirm current official OpenAI API docs for Structured Outputs and Responses API before writing the OpenAI client.

## 2. Phase 2 Backend Datenmodell

- [x] 2.1 Add backend upsell DTO records for suggestion requests, product summaries, suggestion responses, AI ranking results, and event/dismiss requests.
- [x] 2.2 Add a Flyway migration for `upsell_suggestion_cache`, `upsell_events`, and `upsell_dismissals` if persistence remains in MVP scope.
- [x] 2.3 Add Panache entities and repositories for cache, events, and dismissals if the migration is implemented.
- [x] 2.4 Add config properties for upsell enablement, OpenAI model, timeout, max candidates, max suggestions, cache TTL, and prompt limits.

## 3. Phase 3 Backend Candidate Logic

- [x] 3.1 Add OpenSearch helper methods for bounded upsell candidate retrieval with optional `storeId` and `storeCode` filters.
- [x] 3.2 Implement checked product resolution and request validation for `checkedProductId`.
- [x] 3.3 Implement candidate filtering for checked product, current list product ids, completed product ids, duplicates, missing product data, and unusable records.
- [x] 3.4 Implement layout-code category extraction and MVP complementary category ranking.
- [x] 3.5 Implement suggestion-safe product summary mapping with null optional fields for unavailable brand, category, and image URL.

## 4. Phase 4 OpenAI Service

- [x] 4.1 Add a server-side OpenAI upsell ranking client using the Responses API and Structured Outputs JSON schema.
- [x] 4.2 Keep the OpenAI API key environment-backed and ensure it is never returned to clients or logged.
- [x] 4.3 Build the bounded prompt payload from checked product and candidate summaries only.
- [x] 4.4 Parse structured AI output and validate every returned `productId` against the backend candidate map.
- [x] 4.5 Implement fallback ranking for disabled, unconfigured, timed-out, refused, invalid, or rate-limited OpenAI calls.
- [x] 4.6 Ensure reason text length, confidence range, max suggestions, and minimum confidence are enforced after AI and fallback ranking.

## 5. Phase 5 Mobile API

- [x] 5.1 Add `MobileUpsellResource` with `POST /api/mobile/upsell/suggestions`.
- [x] 5.2 Add `POST /api/mobile/upsell/events` and dismissal handling according to the final persistence choice.
- [x] 5.3 Ensure new routes remain covered by the existing public `/api/mobile/*` permission without weakening admin-only routes.
- [x] 5.4 Add backend resource/service tests for successful suggestions, empty candidates, invalid checked product, exclusion filtering, invalid AI output, and fallback behavior.
- [x] 5.5 Add tests that prove unknown AI product ids and already-listed/completed products are not returned.

## 6. Phase 6 iOS Models/API Client

- [x] 6.1 Add Swift models for `UpsellRequest`, `UpsellSuggestionResponse`, `UpsellSuggestion`, `UpsellProductSummary`, and `UpsellEventRequest`.
- [x] 6.2 Add `UpsellSuggestionStore` following the existing `URLSession` and `ObservableObject` style.
- [x] 6.3 Implement request construction with current store id/code, checked product id, selected local list id, current open product ids, completed product ids, and source.
- [x] 6.4 Implement local cooldown, max prompts per session, minimum confidence, max suggestions shown, and repeated dismissal suppression.
- [x] 6.5 Implement event/dismiss reporting as best-effort so network failures do not affect shopping.

## 7. Phase 7 SwiftUI Upsell UI

- [x] 7.1 Add a compact upsell bottom sheet/card component with title, product rows, reasons, add actions, dismiss action, and "not again for this product" action where supported.
- [x] 7.2 Ensure the component shows at most three suggestions and hides for empty or suppressed prompt state.
- [x] 7.3 Add accepted suggestions through `ShoppingListManager.addProduct`.
- [x] 7.4 Refresh `ShoppingSessionManager` after an accepted suggestion is added to the active list.
- [x] 7.5 Ensure products without usable layout codes are allowed on the list and appear unresolved rather than breaking routing.

## 8. Phase 8 Integration beim Produkt-Abhaken

- [x] 8.1 Wire direct shopping-list row completion to trigger an upsell request after marking a product-backed item done.
- [x] 8.2 Wire unresolved item completion/missing behavior so product-backed completions may trigger upsell while free entries do not.
- [x] 8.3 Wire active route-stop completion to evaluate only one prompt opportunity for the completed stop.
- [x] 8.4 Preserve existing session sync, route advancement, beacon behavior, layout behavior, and recipe-added shopping items.
- [x] 8.5 Ensure upsell network failures never undo item completion or block route advancement.

## 9. Phase 9 Tests

- [x] 9.1 Run backend unit/resource tests for upsell and existing mobile recipe/product/store coverage.
- [x] 9.2 Run `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
- [x] 9.3 Run iOS build for the final app target if the project/scheme is available locally.
- [x] 9.4 Manually verify the main iOS flows: add product, start tour, mark item done, see throttled prompt, add suggestion, dismiss suggestion, complete route stop. (Vom Team am 2026-09-21 als manuell bestanden bestätigt.)
- [x] 9.5 Verify no OpenAI key or sensitive OpenAI error details appear in Swift files, static resources, logs, or mobile responses.

## 10. Phase 10 Build/QA

- [x] 10.1 Check changed backend routes with representative HTTP requests for normal, no-candidate, and fallback responses.
- [x] 10.2 Check that existing mobile store routes, product search routes, recipe routes, and admin auth boundaries still work.
- [x] 10.3 Review prompt text, suggestion reasons, and UX frequency on a realistic shopping-list flow.
- [x] 10.4 Record final changed files, test commands, build results, skipped checks, and remaining risks before archive/verification.

## 11. Phase 11 Upsell Reliability Follow-Up

- [x] 11.1 Use the backend suggestion cache so repeated matching contexts return without another OpenAI call and expose accurate response source values.
- [x] 11.2 Prevent stale iOS upsell responses from showing prompts for a previously completed product/list context.
- [x] 11.3 Preload upcoming upsell opportunities during active shopping sessions so many prompts are ready before the customer checks or skips a stop.
- [x] 11.4 Ensure direct completion, missing/skipped completion, route-stop completion, and route-stop skip remain non-blocking and can still trigger valid suggestions.
- [x] 11.5 Verify latency, stale-response protection, backend cache behavior, and existing shopping flows after the reliability changes.

## 12. Phase 12 Station-Based Upsell Plan

- [x] 12.1 Add `POST /api/mobile/upsell/plan` so the backend can rank all current shopping opportunities in one bounded OpenAI request.
- [x] 12.2 Bind plan responses to explicit `opportunityId` values such as `station:<shelf-id>` and `item:<item-uuid>` so late or stale suggestions cannot appear for another station.
- [x] 12.3 Group all products from the same shopping stop into one station opportunity and show at most one prompt when that stop is completed or skipped.
- [x] 12.4 Update iOS preload logic to request the plan after store/layout/session context is available and display prompts from local cached plan data without a new network call on check-off.
- [x] 12.5 Mark products added from upsell suggestions and exclude them from future upsell trigger opportunities.
- [x] 12.6 Add backend service/resource tests for plan responses, station grouping, exclusion filtering, and cache hits.
- [x] 12.7 Verify backend tests and the final iOS app build after the plan rewrite.

## 13. Phase 13 Session Prompt Capacity

- [x] 13.1 Increase the iOS maximum from 4 to 10 actually shown upsell prompts per shopping session.
- [x] 13.2 Keep empty results, cache-only operations, and upsell-origin products from consuming the prompt count.
- [x] 13.3 Include the configured limit in session-limit debug output.
- [x] 13.4 Run the final iOS simulator build and strict OpenSpec validation.
