> **Status: Superseded (2026-09-21).** This change is replaced by `harden-upsell-prefilter-quality` (AI-first ranking, no deterministic plan fallback) and `stabilize-upsell-quality-and-request-lifecycle`. It is archived with `--skip-specs`; its requirements are intentionally not part of `openspec/specs`. Open tasks are abandoned, not completed.

## Why

The current upsell plan flow already works, but candidate retrieval is too broad: OpenSearch returns a bounded store/catalog pool and OpenAI must infer relevance from mixed products. This can produce weak suggestions such as pasta or tomato sauce for butter, increases prompt tokens, and makes quality hard to reason about.

This change improves upsell quality and cost control by adding backend-owned, per-opportunity candidate ranking before OpenAI is called. OpenAI remains a server-side ranker/explainer, but it receives only the strongest catalog candidates for each completed station or item.

## What Changes

- Add deterministic backend candidate scoring for upsell opportunities using product/category signals, store scope, layout-position availability, exclusion context, and configurable complement rules.
- Change the `/api/mobile/upsell/plan` ranking path so each opportunity gets its own top candidate set instead of sharing one broad global candidate list.
- Reduce OpenAI input tokens by sending minimal per-opportunity candidate summaries and a smaller candidate count per opportunity.
- Keep OpenAI optional: if the backend ranking is sufficiently strong or OpenAI is disabled/slow/invalid, the backend can return deterministic fallback suggestions without breaking the shopping flow.
- Add explicit quality guardrails so suggestions are direct supermarket complements rather than broad meal-association guesses.
- Add evaluation fixtures/tests for representative products such as butter, pasta, fruit, breakfast items, dairy, baking staples, sauces, and unknown categories.
- Preserve all existing mobile behavior: store-tap authorization, plan preloading, PendingOpportunity retry, local cache lookup, station grouping, `addedFromUpsell` exclusion, and best-effort event reporting.
- No breaking API change is intended for iOS; response shape remains compatible. Backend OpenAI payload internals may change.

## Capabilities

### New Capabilities
- `mobile-upsell-candidate-ranking`: Defines backend-owned per-opportunity candidate scoring, OpenAI token-budget constraints, fallback ranking quality, and evaluation expectations for mobile upsell/cross-sell suggestions.

### Modified Capabilities
- `product-catalog-search`: Adds backend catalog helper behavior for bounded category-aware candidate retrieval without adding a new public product-by-category route.

## Impact

- Backend:
  - `UpsellSuggestionService`
  - `OpenSearchService`
  - Upsell DTO internals if needed for per-opportunity candidate payloads/debug data
  - Upsell service/resource tests
  - Application config for candidate limits, score thresholds, and complement rules where appropriate
- iOS:
  - No required API contract change.
  - Optional debug display/logging may consume existing `source`/`debug` fields but is not required for this change.
- OpenAI:
  - Responses API remains server-side.
  - Structured Outputs remain required.
  - Prompt payload should become smaller, more stable, and more deterministic.
- Data/security:
  - No OpenAI key in Swift.
  - No customer identity or server-side customer tracking.
  - No invented product IDs, names, categories, brands, or inventory data.
