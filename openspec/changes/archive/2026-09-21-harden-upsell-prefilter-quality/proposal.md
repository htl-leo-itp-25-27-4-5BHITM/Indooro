## Why

The upsell transport flow is now stable enough to preload and cache station suggestions, but simulator tests showed two remaining problems:

- The iOS client could time out after 6 seconds while the backend/OpenAI request was still valid, then send another plan request and waste tokens.
- Server-side semantic prefiltering was too brittle for the current catalog data. It improved some obvious bad cases, but also produced poor pools such as Gouda to oats/rice or eggs to fruit because Java rules were trying to be the recommender.

The current direction is therefore AI-first ranking: the backend provides a bounded store catalog and strict ID/status validation, while OpenAI decides which products actually fit each shopping opportunity. If OpenAI cannot answer, the backend returns empty suggestions instead of deterministic fallback guesses.

## What Changes

- Increase the iOS plan-request timeout so the client does not abort a valid backend response too early.
- Prevent iOS from cancelling an in-flight upsell plan and starting a second OpenAI-backed request while the first request is still running.
- Keep pending opportunities alive long enough for the longer plan request to return.
- Send OpenAI one shared bounded `candidateProducts` catalog for the store instead of per-opportunity semantic server-prefiltered candidates.
- Keep server protection focused on catalog and state safety: exclude trigger/current/completed products, validate returned product IDs, reject duplicates, and keep the OpenAI key server-side.
- Remove deterministic plan fallback suggestions when OpenAI is unavailable, invalid, or times out; empty suggestions are the fallback.
- Bump the plan cache context to avoid reusing older prefilter-based responses.
- Update documentation and tests to describe the AI-first contract and the new timeout behavior.

## Capabilities

### New Capabilities

- `mobile-upsell-quality-gates`: Defines AI-first upsell plan ranking, empty-result behavior, request timeout behavior, and mobile display expectations for upsell prompts.

### Modified Capabilities

- `product-catalog-search`: Keeps internal product classification available for catalog/recommendation helpers, but the plan request no longer depends on semantic server prefiltering.

## Impact

- Backend: `UpsellSuggestionService` plan candidate payload construction, cache context, fallback behavior, config defaults, and tests.
- iOS: `UpsellSuggestionStore` plan timeout, in-flight request handling, pending opportunity age, and debug logging.
- Deployment: backend image must be rebuilt and pushed before LeoCloud restart; `kubectl rollout restart` alone is not enough for Java code changes.
- Docs/OpenSpec: update AI flow and candidate-ranking docs to match the AI-first approach.
