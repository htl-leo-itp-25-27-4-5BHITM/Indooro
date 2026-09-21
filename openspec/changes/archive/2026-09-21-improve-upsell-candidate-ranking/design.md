## Context

The current mobile upsell flow is station-plan based:

- iOS authorizes preloading only after a manual store tap.
- iOS sends one `/api/mobile/upsell/plan` request for current route opportunities.
- Backend loads a bounded product pool from OpenSearch with optional store filters.
- Backend filters products already open, completed, or used as triggers.
- OpenAI receives the opportunities plus a broad candidate list and returns structured JSON.
- Backend validates every returned product id against the candidate map.
- iOS caches suggestions by `station:<shelf-id>` or `item:<uuid>`.
- PendingOpportunity retry handles the case where a station is completed before the plan response arrives.

The weak point is candidate quality before OpenAI. `OpenSearchService.findUpsellCandidates(...)` currently uses a bounded `matchAll` query with optional `storeId`/`storeCode` filters. That avoids sending the full catalog, but it does not retrieve products specifically related to the trigger product or station. In `/plan`, candidates are then sorted primarily by store match, layout availability, and name. OpenAI must infer practical add-ons from a mixed pool, which can lead to weak suggestions such as pasta/sauce for butter and also increases token usage.

The current product model is lean: product id, name, price, layoutCode, storeId, and storeCode. There is no reliable explicit category name, brand, recipe relation, purchase history, inventory, popularity, or vector embedding table. The first layout-code segment is the available category-like signal.

This change should improve quality without introducing customer accounts, live inventory, admin campaign tooling, a new public product-by-category route, or direct OpenAI access from iOS.

## Goals / Non-Goals

**Goals:**

- Rank upsell candidates per opportunity before OpenAI sees them.
- Reduce OpenAI input tokens by sending a small, relevant candidate set per station/item.
- Improve suggestion quality for common products, including butter, pasta, fruit, breakfast items, dairy, sauces, baking staples, snacks, and unknown categories.
- Keep all suggestions grounded in existing catalog products and backend validation.
- Preserve current mobile API response compatibility and iOS cache behavior.
- Make fallback quality meaningfully better when OpenAI is unavailable.
- Add tests/evaluation fixtures so suggestion quality is reviewable and repeatable.

**Non-Goals:**

- No customer personalization, user identity, shopping-history learning, or server-side customer tracking.
- No admin UI for editing cross-sell rules in this change.
- No new product data ingestion pipeline, product ontology service, POS/ERP integration, stock data, margin optimization, or A/B testing dashboard.
- No iOS rewrite of the upsell flow; iOS should need little or no behavior change.
- No OpenAI fine-tuning or embeddings as the first implementation path.
- No claim that every product gets perfect business-quality recommendations; unknown categories must degrade safely.

## Decisions

### Decision: Add backend per-opportunity candidate scoring before OpenAI

The backend should build candidate sets per `UpsellOpportunityRequest`, not only a shared global candidate list. Each opportunity has trigger product ids/names; the backend can resolve trigger products, derive category codes, compute candidate scores, and keep only the strongest candidates for that opportunity.

Score inputs should include:

- hard exclusions: current list ids, completed ids, trigger ids, null/invalid products, duplicates
- store score: current store id/code match
- layout score: candidate has usable layoutCode
- category score: candidate category is explicitly complementary to a trigger category
- name/keyword score: product names match known complement patterns
- direct alternative penalty: candidate appears to be the same product class as the trigger unless the product class is intentionally allowed
- weak-association penalty: products that are only broad meal ideas should rank lower than practical supermarket complements

Rationale: This keeps OpenAI focused on plausible choices and improves deterministic fallback.

Alternative considered: only improve the prompt. This helps some cases but leaves OpenAI with a broad mixed pool and does not reduce tokens enough.

Alternative considered: use a larger OpenAI model. This may improve reasoning but costs more and still wastes tokens on low-quality candidates.

### Decision: Keep product relations as code/config rules for MVP

Implement a small rule set based on category codes and product-name keywords. It can live in backend code initially or in environment-backed configuration if that remains simple. It should be easy to test and evolve.

Example category complements:

- `525` butter/dairy-adjacent staples -> bread/bakery, baking staples, breakfast, dairy
- `430` pasta -> sauces, tomato products, cheese/oil/spices where available
- `420` sauces/preserved foods -> pasta, rice, cooking staples
- `310` fruit -> breakfast, yogurt/dairy, snacks
- `440` cereal/oats -> dairy, fruit
- `445` baking staples -> dairy, butter, eggs where available

Example product keyword complements:

- butter -> bread, toast, rolls, jam, honey, flour, sugar, eggs, milk, breakfast
- spaghetti/pasta -> sauce, tomato, pesto, parmesan/cheese, oil
- oats/cereal -> milk, yogurt, fruit, honey
- apples/bananas/berries -> yogurt, oats, cereal, dessert/baking companions
- coffee/tea -> milk, sugar, biscuits/snacks

Rationale: Current data does not contain a full taxonomy. Small explicit rules provide immediate quality improvements and are inspectable in tests.

Alternative considered: store relations in PostgreSQL with admin management. This is more scalable but too large for this follow-up.

### Decision: Send per-opportunity candidate lists to OpenAI

The OpenAI prompt payload should change from one global `candidateProducts` list to per-opportunity candidate products, for example:

```json
{
  "opportunities": [
    {
      "opportunityId": "station:shelf-525",
      "triggerProductNames": ["Butter 250g"],
      "candidateProducts": [
        { "id": 70, "name": "Toastbrot 500g", "cat": "510" },
        { "id": 49, "name": "Mehl 1kg", "cat": "445" }
      ]
    }
  ],
  "maxSuggestionsPerOpportunity": 3
}
```

Each candidate id remains validated against a backend candidate map. The structured output still returns only `opportunityId`, `productId`, reason, and confidence.

Rationale: It reduces cross-opportunity confusion and makes the model pick from relevant products only.

Alternative considered: call OpenAI once per opportunity. This can be simpler to reason about but increases request count and latency; one batched request with per-opportunity candidate lists preserves the current plan strategy.

### Decision: Keep candidate payload minimal

OpenAI does not need the full mobile product summary. Send only:

- product id
- name
- short category code derived from layoutCode
- optional boolean layout-position marker only if it materially helps ranking

Do not send price, store id, full layout code, image URL, brand, or unavailable metadata unless a measured quality issue requires it.

Rationale: Reduces tokens and avoids asking OpenAI to reason over fields the backend can enforce deterministically.

Alternative considered: include price/layout/store data for richer reasoning. Backend already handles store/layout filters; price-based upsell is not in scope.

### Decision: Make deterministic fallback opportunity-aware

Fallback should not reuse the same top candidates for every opportunity. It should use the same per-opportunity score output and return top validated candidates for that opportunity with generic but product-safe reason text.

Rationale: If OpenAI is disabled, slow, or invalid, the app should still feel reasonable instead of showing the same products at unrelated stations.

Alternative considered: return no suggestions when OpenAI fails. This is safe but loses the value of the feature and makes behavior unpredictable during latency spikes.

### Decision: Add confidence and score gates before showing

Backend should only send candidates above a minimum deterministic score or validated AI confidence. iOS already filters by minimum confidence, but backend should prevent low-quality responses from being cached as if they were useful.

Rationale: Fewer but better prompts are preferable to many weak prompts.

Alternative considered: always return three suggestions. This maximizes prompt density but harms trust.

### Decision: Keep iOS API response compatible

The `/api/mobile/upsell/plan` response should remain compatible with current iOS models. Additional debug metadata may be added only if it is optional and does not break Swift decoding.

Rationale: The quality improvement is backend-owned; iOS already has correct preloading, caching, PendingOpportunity retry, and `addedFromUpsell` exclusion.

Alternative considered: move more ranking to iOS. This would duplicate backend catalog logic and risks leaking implementation details.

### Decision: Add evaluation fixtures as tests, not manual-only checks

Create backend tests that verify expected candidate ordering/absence for representative triggers and plan opportunities. Tests should assert properties such as:

- butter candidates prefer bread/baking/breakfast over pasta/sauce when those products exist
- pasta candidates prefer sauce/tomato products
- fruit candidates prefer yogurt/oats/breakfast
- already-open/completed/trigger products never appear
- unknown category still returns safe, store-aware, layout-backed candidates or none
- fallback source uses opportunity-specific candidates

Rationale: Suggestion quality is otherwise subjective and easy to regress.

Alternative considered: rely on simulator testing. Simulator flows are useful but too slow and not deterministic enough for candidate-ranking changes.

## Risks / Trade-offs

- Rule bias becomes too rigid -> Keep OpenAI as a ranker/explainer inside a relevant pool and make rules easy to adjust.
- Unknown categories get mediocre suggestions -> Require safe fallback behavior, minimum score gates, and no invented products.
- Category code meanings are imperfect -> Treat layout-code category as an MVP signal, not a full taxonomy; tests should document assumptions.
- Smaller candidate pools may miss creative good suggestions -> Start with configurable per-opportunity candidate count and evaluate with real examples.
- Per-opportunity payload can duplicate candidates across stations -> Keep candidate summaries minimal and dedupe internally where possible without losing opportunity-specific context.
- Backend code grows in complexity -> Isolate scoring into helper classes/records with focused tests rather than burying it in `plan(...)`.
- Existing backend cache may reuse old broad-ranking responses -> Bump plan cache context version so new ranking behavior does not collide with old cached responses.
- Config changes may affect LeoCloud behavior -> Use safe defaults and document any environment variables needed before deployment.

## Migration Plan

1. Implement backend scoring helpers and tests behind current API contracts.
2. Bump plan cache context version so old broad candidate responses are not reused.
3. Keep iOS unchanged unless optional debug fields require model tolerance changes.
4. Run backend upsell tests and OpenSpec validation.
5. Run the final iOS build to verify response compatibility.
6. Deploy backend only after tests pass; no iOS deploy is required unless Swift model/debug changes are added.
7. Rollback by redeploying the previous backend image; the API response shape remains compatible.

## Open Questions

- Are current category-code meanings stable enough to encode a category matrix, or should the implementation document them as demo-catalog-specific?
- Should the complement matrix live in code for now, or should it be environment/config-file backed for easier tuning?
- What initial per-opportunity candidate limit should be used: 8, 10, or 12?
- Should backend return debug score information in non-production responses, or only log it server-side?
- Should OpenAI be skipped when deterministic scores are very strong, or should the first implementation always call OpenAI when enabled to preserve current behavior?
