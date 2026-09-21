## Why

Recent simulator runs show that the AI-first upsell transport, preloading, and cache flow are stable, but obvious substitute products can still pass through and shopping-state changes can trigger repeated 5,000-token plan calls for already handled opportunities. The system also treats a temporary catalog lookup failure (`no_candidates`) like a genuine empty recommendation result, which can suppress valid prompts for the rest of the cache lifetime.

## What Changes

- Keep OpenAI as the semantic recommender over the existing bounded shared store catalog; do not restore broad Java semantic prefiltering.
- Add a narrow post-AI safety validator that rejects obvious same-product alternatives across brands, package sizes, flavors, naming variants, and equivalent trigger product classes.
- Diversify each opportunity so multiple returned suggestions do not represent equivalent variants of one product class.
- Strengthen the OpenAI prompt with explicit positive and negative examples while still allowing empty suggestion arrays.
- Track opportunity lifecycle state in iOS so shown, dismissed, accepted, or intentionally completed-empty opportunities are not planned again until a real session reset.
- Normalize open and completed product IDs before request-signature construction so an ID is not sent in both sets and duplicates cannot create unstable contexts.
- Separate genuine AI-empty results from catalog lookup failures, avoid long-lived caching of transient `no_candidates` failures, and permit one bounded retry without creating an OpenAI retry loop.
- Expand debug output and tests so suppressed variants, deduplicated classes, handled opportunities, retry decisions, candidate lookup failures, request counts, and token usage can be verified.

## Capabilities

### New Capabilities

- `mobile-upsell-quality-control`: Defines post-AI equivalent-product rejection, suggestion diversity, opportunity lifecycle idempotency, shopping-state normalization, transient candidate failure handling, bounded retry behavior, and cost/debug requirements for mobile upsell plans.

### Modified Capabilities

None. Existing public product, shopping-list, and upsell API response shapes remain compatible.

## Impact

- Backend: `UpsellSuggestionService`, internal product classification/equivalence helpers, plan cache outcome handling, OpenAI prompt construction, debug metadata/logging, and targeted service/resource tests.
- iOS: `UpsellSuggestionStore` opportunity lifecycle state, plan filtering/signatures, retry eligibility, session reset behavior, and debug logging.
- Catalog/OpenSearch: no public route change; internal lookup failures must remain distinguishable from a successful empty candidate result.
- API: `/api/mobile/upsell/plan` remains response-compatible; optional debug fields may be extended without exposing secrets or customer identity.
- Documentation: update the AI flow, candidate-ranking, retry, cache, and manual verification documentation.
- Deployment: backend changes require a rebuilt GHCR image and LeoCloud rollout; iOS changes require a new app build.
