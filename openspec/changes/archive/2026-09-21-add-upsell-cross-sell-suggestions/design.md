## Context

Indooro's current backend is a Quarkus 3 / Java 17 service with PostgreSQL, Flyway, OpenSearch, RESTEasy Reactive, and OIDC for admin-only routes. Mobile routes under `/api/mobile/*` are public and anonymous. Existing product search is OpenSearch-backed through `ProductResource` and `OpenSearchService`.

Current product records are intentionally lean: `id`, `name`, `price`, `layoutCode`, `storeId`, and `storeCode`. There is no confirmed product `category`, `brand`, `imageUrl`, or dedicated public product-by-category route in the current contract. Category-like signals can be derived from the first segment of `layoutCode`, for example `430` from `430/1/1/1`, but this is an MVP approximation.

The final iOS app lives under `swift/indooro-EinkaeuferFinal/indooroApp`. Shopping lists are local app state managed by `ShoppingListManager`; shopping sessions are client-side and route open items through `ShoppingSessionManager`. Direct item completion happens in `ShoppingListsPage` by calling `updateItemStatus(..., status: .done)`. Active route-stop completion happens through `ShoppingSessionManager.markCurrentStopDone`, which marks all current stop items done and then resyncs the route.

OpenAI must be used server-side only. The official OpenAI API documentation currently recommends Structured Outputs through the Responses API `text.format` JSON schema format for schema-constrained model output, with older JSON object mode not preferred for models that support JSON schema.

Assumption: this change targets the existing anonymous mobile model and does not introduce customer accounts or server-backed shopping-list persistence.

Assumption: the MVP can use catalog-derived heuristics plus OpenAI ranking; it does not require admin-maintained product relationship tables before launch.

## Goals / Non-Goals

**Goals:**

- Suggest 1 to 3 useful add-on products after a customer checks off a product-backed item.
- Ensure every suggested product comes from existing catalog data and is revalidated after any AI step.
- Prefer suggestions available in the selected or detected store.
- Keep OpenAI credentials and OpenAI calls entirely backend-side.
- Preserve local shopping-list behavior, active shopping-session routing, store detection, recipes, beacons, and layouts.
- Avoid aggressive prompting through cooldown, session limits, and dismissal handling.
- Provide a backend fallback when OpenAI is disabled or unavailable.

**Non-Goals:**

- No personalized customer history, customer identity, or server-side customer tracking.
- No POS/ERP inventory integration, live stock status, price/margin optimization, A/B testing, or analytics dashboard.
- No admin campaign/rule engine in the MVP.
- No product image/brand/category expansion unless current product data already contains those fields at implementation time.
- No direct OpenAI API access from Swift/iOS.

## Decisions

### Decision: Add a dedicated mobile upsell API

Add `POST /api/mobile/upsell/suggestions` as the main endpoint instead of overloading product search or shopping-list routes.

Request shape:

```json
{
  "storeId": "uuid-or-null",
  "storeCode": "SPAR_POST",
  "checkedProductId": 123,
  "shoppingListId": "local-uuid-string",
  "currentListProductIds": [123, 456],
  "completedProductIds": [123],
  "source": "shopping_session",
  "recipeId": "uuid-or-null"
}
```

Response shape:

```json
{
  "checkedProductId": 123,
  "suggestions": [
    {
      "product": {
        "id": 789,
        "name": "Parmesan",
        "price": 2.99,
        "layoutCode": "525/1/1/1",
        "storeId": "uuid-or-null",
        "storeCode": "SPAR_POST",
        "brand": null,
        "category": null,
        "imageUrl": null,
        "hasLayoutPosition": true
      },
      "reason": "Passt gut zum gerade abgehakten Produkt.",
      "confidence": 0.86
    }
  ],
  "source": "openai",
  "expiresAt": "2026-06-02T12:00:00Z"
}
```

Add `POST /api/mobile/upsell/events` for accepted, shown, dismissed, and failed client-visible outcomes. Add `POST /api/mobile/upsell/dismiss` only if dismissal state needs a separate convenience endpoint; otherwise `events` can carry dismissal events.

Alternative considered: route suggestions through `/api/products/search`. This was rejected because upsell needs checked-product context, exclusion lists, OpenAI/fallback metadata, validation, and event logging that would blur the product search contract.

Follow-up decision: add `POST /api/mobile/upsell/plan` for active shopping sessions and store-based route preloading. The single-product `/suggestions` endpoint remains available for compatibility, but the iOS shopping flow uses `/plan` so OpenAI is called before the customer checks off a station.

Plan request shape:

```json
{
  "storeId": "uuid-or-null",
  "storeCode": "SPAR_POST",
  "shoppingListId": "local-uuid-string",
  "currentListProductIds": [101, 102, 103],
  "completedProductIds": [],
  "source": "shopping_session",
  "opportunities": [
    {
      "opportunityId": "station:shelf-430",
      "triggerProductIds": [101, 102],
      "triggerProductNames": ["Aepfel", "Bananen"]
    }
  ]
}
```

Plan response shape:

```json
{
  "source": "openai",
  "expiresAt": "2026-06-03T10:30:00Z",
  "opportunities": [
    {
      "opportunityId": "station:shelf-430",
      "triggerProductIds": [101, 102],
      "suggestions": [
        {
          "product": {
            "id": 789,
            "name": "Joghurt",
            "price": 1.29,
            "layoutCode": "445/1/1/1",
            "storeId": "uuid-or-null",
            "storeCode": "SPAR_POST",
            "brand": null,
            "category": "445",
            "imageUrl": null,
            "hasLayoutPosition": true
          },
          "reason": "Passt als frische Ergaenzung zu Obst.",
          "confidence": 0.81
        }
      ]
    }
  ]
}
```

The plan cache uses a separate context hash from the single-product suggestion cache and includes the opportunity ids and trigger ids. The app keys local prompt lookup by `station:<shelf-id>` for grouped route stops and `item:<uuid>` for non-routed list rows.

### Decision: Candidate retrieval is backend-owned and bounded

`UpsellSuggestionService` first resolves the checked product through `OpenSearchService.getProductById`. It then retrieves a bounded candidate pool from existing OpenSearch product data:

- Prefer current-store scope using `storeId` or `storeCode` where available.
- Exclude checked/current/completed product ids before AI.
- Prefer products with usable `layoutCode`.
- Use layout-code category prefixes and complementary category groups as an MVP heuristic.
- Cap candidate count, for example 30 to 60 products, before sending to OpenAI.

Implementation may add helper methods to `OpenSearchService`, such as `findUpsellCandidates(...)`, rather than creating public product-by-category routes.

Alternative considered: send the whole product database to OpenAI. This was rejected for latency, cost, privacy, prompt-injection exposure, and because the model should not decide product existence.

### Decision: Use OpenAI only as ranker/explainer

OpenAI receives the checked product plus the candidate product summaries and returns only candidate `productId` values with a short reason and confidence. The backend validates all returned ids against the candidate map and discards anything invalid.

Prompt outline:

- System: "Rank add-on supermarket products. You may only select productIds from the provided candidate list. Do not invent products. Return JSON only matching the schema."
- Developer/backend context: include constraints, max suggestions, language "German", concise customer-safe reasons, no personal data.
- User/content payload: checked product summary and candidate products.

Structured output schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["suggestions"],
  "properties": {
    "suggestions": {
      "type": "array",
      "maxItems": 3,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["productId", "reason", "confidence"],
        "properties": {
          "productId": { "type": "integer" },
          "reason": { "type": "string", "maxLength": 180 },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
        }
      }
    }
  }
}
```

Use the Responses API with `text.format`/`json_schema` and `strict: true` when supported by the chosen configured model. Model name must be configurable, not hardcoded into Swift. If Java SDK adoption is undesirable, a small REST client can call `POST https://api.openai.com/v1/responses`.

Alternative considered: generate product names from OpenAI and then search for them. This was rejected because it invites hallucinated products and ambiguous matching.

For `/plan`, OpenAI receives multiple opportunities and one bounded candidate list. The structured output is:

```json
{
  "opportunities": [
    {
      "opportunityId": "station:shelf-430",
      "suggestions": [
        { "productId": 789, "reason": "Kurzer deutscher Grund.", "confidence": 0.81 }
      ]
    }
  ]
}
```

The backend rejects unknown `opportunityId` values, unknown `productId` values, already-listed products, trigger products, and low-confidence results after parsing.

### Decision: Add lightweight persistence for cache and events

MVP database additions:

- `upsell_suggestion_cache`: id, checked_product_id, store_id, store_code, context_hash, response_json, source, expires_at, created_at.
- `upsell_events`: id, event_type, checked_product_id, suggested_product_id, store_id, store_code, session_hash, source, created_at, metadata_json.
- `upsell_dismissals`: id, checked_product_id, suggested_product_id nullable, store_id, session_hash, dismissal_count, suppressed_until, updated_at.

The cache prevents repeated OpenAI calls for the same product/store/exclusion context. Events are operational and anonymous. Dismissals support "not again for this product" and repeated dismissal suppression. A complex `product_relations` or `upsell_rules` table is later scope.

Alternative considered: no persistence. This is simpler but weakens rate control, cache reuse, and observability. The proposed persistence stays small and does not require customer identity.

### Decision: iOS adds a small `UpsellSuggestionStore`

Add iOS models:

- `UpsellRequest`
- `UpsellSuggestionResponse`
- `UpsellSuggestion`
- `UpsellProductSummary`
- `UpsellEventRequest`

Add `UpsellSuggestionStore: ObservableObject` with:

- `activePrompt`
- `isLoading`
- `lastPromptShownAt`
- `shownCountForSession`
- local dismissed-product tracking
- `requestSuggestions(checkedItem:list:store:source:)`
- `addSuggestion(...)`
- `dismissSuggestion(...)`

The store follows the existing direct `URLSession` pattern used by `ProductSearchStore` and `RecipeStore` to keep the change small.

Follow-up decision: `UpsellSuggestionStore` now owns a station plan cache. It preloads the plan after store/layout/session context is available, then `showOpportunity(...)` only reads local cached plan data when the user completes or skips a stop. Suggested products added through the prompt are stored with `addedFromUpsell = true` and are not used as future upsell triggers.

Integration points:

- In `ContentView`, create one `@StateObject private var upsellStore`.
- Pass it to `ShoppingListsPage` and `StoreMapPage` or pass callback closures.
- Direct list completion calls a helper that marks the item done, refreshes session if needed, then triggers upsell for product-backed items.
- Route-stop completion captures the current stop items before marking done, advances the session, then triggers one upsell request for the best eligible product in that stop.
- Accepted suggestions call existing `ShoppingListManager.addProduct` and then `ShoppingSessionManager.sync` if the active session targets the selected list.

Alternative considered: put upsell logic inside `ShoppingListManager`. This was rejected because the manager is local state/persistence logic; network calls and prompt state are cleaner in a separate store.

### Decision: Use a bottom sheet/card with strict UX limits

The prompt is a compact SwiftUI bottom sheet or overlay:

- Title: "Passt gut dazu"
- Show max 3 suggestions.
- Each suggestion shows product name, optional price/layout hint, reason, and add button.
- Include "Nein danke" and optional "Nicht mehr fuer dieses Produkt".
- Do not show if suggestions are empty, cooldown is active, session limit is reached, or the checked product has been suppressed.

Suggested MVP config:

- `minSecondsBetweenUpsellPrompts = 45`
- `maxSuggestionsPerSession = 10`
- `maxSuggestionsShown = 3`
- `minConfidence = 0.45`
- request timeout around 3 to 5 seconds on mobile/backend boundary

Alternative considered: full-screen modal. This was rejected because it interrupts the shopping route and makes the feature feel like advertising.

## AI / OpenAI Implementation Notes

OpenAI configuration:

- `openai.api-key=${OPENAI_API_KEY:}`
- `openai.upsell.enabled=${OPENAI_UPSELL_ENABLED:false}`
- `openai.upsell.model=${OPENAI_UPSELL_MODEL:<configured-model>}`
- `openai.upsell.timeout-ms=${OPENAI_UPSELL_TIMEOUT_MS:3000}`
- `openai.upsell.max-candidates=${OPENAI_UPSELL_MAX_CANDIDATES:50}`

Security:

- Never add the API key to Swift, `Info.plist`, static resources, logs, or client responses.
- Redact OpenAI errors before client responses.
- Treat product names and user-provided notes as untrusted strings in prompts.
- Send only product ids/names/layout/store/category-code signals, not customer identity or full shopping-list text.
- Validate OpenAI output after schema parsing.

Fallback algorithm:

- Rank complementary category groups derived from `layoutCode` prefixes.
- Prefer products in same store.
- Prefer products with layout code.
- Prefer products not in current or completed product id sets.
- Use generic German reason text, for example "Ergaenzt den gerade erledigten Artikel."

## Migration Plan

1. Add backend DTOs, service, mobile resource, OpenAI client/fallback implementation, config, and tests.
2. Add Flyway migration for cache/events/dismissals if persistence is implemented in MVP.
3. Ensure `/api/mobile/*` public permission already covers the new routes; no admin auth change is expected.
4. Add iOS models/store/UI and wire direct item completion plus route-stop completion.
5. Run backend tests and OpenSpec validation.
6. Run iOS build for the final app target if the local Xcode project/scheme is available.

Rollback:

- Disable AI through `OPENAI_UPSELL_ENABLED=false`.
- If necessary, remove or hide the iOS prompt while leaving item completion behavior unchanged.
- Database tables can remain unused; they do not affect existing product/search/store APIs.

## Risks / Trade-offs

- AI suggests invalid products -> backend candidate-id validation and post-validation discard.
- Feature feels annoying -> cooldown, session cap, dismissal suppression, bottom-sheet UX, and no prompt for empty/low-confidence suggestions.
- OpenAI latency slows shopping -> completion remains local/immediate; backend timeout and fallback are bounded.
- Current product model lacks category/brand/image -> MVP derives category code from `layoutCode` and returns missing optional metadata as null.
- Store-specific product filtering is incomplete -> prefer available `storeId`/`storeCode` filters and document fallback to system-wide catalog candidates.
- Recalculating routes unexpectedly -> accepted suggestions use existing add-product path and explicit session sync only after the customer adds a product.
- Anonymous events still become sensitive over time -> store minimal fields, avoid customer identity, and hash ephemeral session/device identifiers if used.

## Open Questions

- Which OpenAI model should production use for cost/latency once deployment credentials are available?
- Should upsell be globally enabled by config only, or should stores be able to opt in/out in a later admin feature?
- Should "Nicht mehr fuer dieses Produkt" persist only locally, only backend-session scoped, or both?
- Are richer product fields such as brand, image URL, explicit category, or availability planned for the product index before implementation?
