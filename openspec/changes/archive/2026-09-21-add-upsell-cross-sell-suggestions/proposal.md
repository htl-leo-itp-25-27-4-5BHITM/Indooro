## Why

Indooro optimizes supermarket visits so well that it can reduce spontaneous in-store discovery. Supermarkets need a way to recommend useful add-on products without breaking the customer's shopping flow, while customers should receive only relevant suggestions that can actually be found in the current catalog and store context.

This change introduces bounded, validated upsell/cross-sell suggestions at the moment a customer marks a shopping-list item as completed. The feature must improve business value for stores without turning the iOS shopping session into an intrusive advertising surface.

## What Changes

- Add a mobile upsell suggestions API that accepts the checked product, current store context, current list products, completed products, and shopping-session source.
- Generate candidate products only from existing OpenSearch-backed product documents, preferring current-store products and products with usable layout positions.
- Add a server-side AI ranking step using the OpenAI API when configured; the AI may rank and explain only backend-provided candidate product IDs.
- Validate AI output after generation so unknown products, products outside the candidate set, duplicates, already-listed products, and already-completed products are discarded.
- Add a safe fallback path that returns rule-ranked catalog candidates or no suggestions when OpenAI is unavailable, rate-limited, disabled, or returns invalid data.
- Add lightweight backend persistence for suggestion caching, event logging, and dismissals where needed for spam control and observability.
- Add iOS models and an `UpsellSuggestionStore`-style manager that calls the backend when products are checked off.
- Add a small SwiftUI upsell prompt that shows at most three suggestions and lets the customer add a suggestion to the existing shopping list or dismiss it.
- Add cooldown/session limits so suggestions do not appear after every item and repeated dismissals reduce prompting.
- No breaking changes to existing mobile store detection, product search, layout, recipe, shopping-list, or routing behavior.

## Capabilities

### New Capabilities

- `mobile-upsell-suggestions`: Mobile-facing upsell/cross-sell suggestion generation, validation, AI ranking, fallback behavior, prompt throttling, and add-to-list interaction.

### Modified Capabilities

- `mobile-shopping-lists`: Shopping-list completion flows can request and display non-blocking upsell suggestions and can add accepted suggestions to the existing local list.
- `product-catalog-search`: Product catalog behavior is extended with bounded, store-aware candidate retrieval suitable for suggestion generation without inventing products or assuming a product-by-category endpoint.

## Impact

- Backend API: add `POST /api/mobile/upsell/suggestions`, `POST /api/mobile/upsell/events`, and optional `POST /api/mobile/upsell/dismiss` under anonymous mobile routes.
- Backend services: add an upsell service that uses `OpenSearchService`, optional PostgreSQL cache/event/dismissal repositories, and a server-side OpenAI client.
- Backend configuration: add OpenAI API key/model/timeout/rate-limit/enablement properties via environment-backed Quarkus config; never expose secrets to iOS.
- Backend data: possible Flyway migration for `upsell_suggestion_cache`, `upsell_events`, and `upsell_dismissals`; product relations/admin campaigns are explicitly later scope.
- iOS app: update the final app under `swift/indooro-EinkaeuferFinal/indooroApp` with request/response models, a suggestion manager, a bottom-sheet/card prompt, and hooks in direct list item completion plus active shopping-session stop completion.
- Product/search data: reuse existing OpenSearch product fields (`id`, `name`, `price`, `layoutCode`, `storeId`, `storeCode`) and derive category/location signals from `layoutCode` until richer category/brand/image fields are added.
- Security/privacy: OpenAI calls are backend-only, send minimal product context, avoid personal data, validate structured JSON output, log without sensitive customer identity, and keep mobile APIs resilient when AI is unavailable.
- Verification: add backend unit/resource tests for candidate filtering, validation, fallback, and response shape; add iOS compile/build checks and targeted logic tests where available.
