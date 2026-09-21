## Context

The upsell feature preloads a plan after a manual store tap and later displays cached suggestions when the customer completes a station. The latest simulator evidence showed that the cache/display path is mostly healthy, but the ranking strategy needed a correction.

The previous attempt added server-side semantic gates and complement rules. That reduced some fallback mistakes, but it also showed a core limitation: the backend currently has only product id, name, price, layout code, store id, and store code. It does not have a reliable ontology, recipe graph, purchase history, or manually maintained recommender taxonomy. Trying to encode supermarket semantics in Java rules made the candidate pool brittle.

The revised architecture is:

- Backend loads a bounded store catalog.
- Backend removes products that must never be suggested for state/contract reasons.
- OpenAI receives all remaining bounded candidates and decides which products fit each opportunity.
- Backend validates the returned IDs.
- No deterministic semantic fallback is shown when OpenAI fails.

## Goals / Non-Goals

**Goals:**

- Avoid client-side timeout retries that can waste OpenAI tokens.
- Let OpenAI judge product fit from a broader bounded catalog instead of relying on brittle server semantic prefiltering.
- Keep the OpenAI API key and all OpenAI calls server-side.
- Keep suggestions grounded in existing catalog product IDs.
- Exclude products already open on the list, completed, or acting as the trigger.
- Return empty opportunities instead of fallback guesses when OpenAI cannot answer.
- Preserve iOS loaded-empty cache semantics so empty results do not become cache misses.
- Keep debug logs useful for request timing, token usage, cache state, and source interpretation.

**Non-Goals:**

- No direct OpenAI call from iOS.
- No unbounded full-catalog dump.
- No deterministic Java recommender pretending to know product semantics.
- No public product-class API.
- No guarantee that every product receives a suggestion.
- No database migration.

## Decisions

### Decision: Use a bounded shared AI catalog

For `/api/mobile/upsell/plan`, the backend sends one shared `candidateProducts` list to OpenAI alongside the opportunities.

Candidate inclusion rules are intentionally minimal:

- product has id and non-empty name
- product id is not currently open on the list
- product id is not completed
- product id is not a trigger product for any opportunity
- duplicate product ids are removed
- result count is capped by `upsell.max-candidates`

Rationale: The AI needs enough choice to avoid Java-rule blind spots. A shared list also lets OpenAI compare possible matches across all opportunities.

Tradeoff: More candidates means more input tokens. The initial cap is raised to 150 because the previous 50-product pool was too narrow/noisy for real shopping choices.

### Decision: Server validates, AI recommends

The server remains the source of truth for validity:

- OpenAI may only return known `productId` values from `candidateProducts`.
- OpenAI may only return known `opportunityId` values from the request.
- Duplicate product IDs in one opportunity are ignored.
- Suggestions below the configured confidence threshold are ignored.
- The backend expands valid IDs into product summaries.

The server no longer discards AI choices merely because a Java classifier thinks the semantic pair is incompatible. This is intentional: the user specifically observed that server semantics were the main quality bottleneck.

### Decision: Remove deterministic plan fallback suggestions

When OpenAI is disabled, unavailable, times out, returns invalid JSON, or returns no useful result, the plan response contains empty suggestion arrays.

Rationale: A bad fallback suggestion is worse than no popup. The feature should spend quality budget on OpenAI, not on brittle deterministic guesses.

Fallback source handling:

- `source=openai`: valid OpenAI structured output was used.
- `source=none`: OpenAI could not provide usable suggestions and no deterministic fallback was shown.
- `source=cache`: a cached response was reused.

### Decision: Make timeout budgets hierarchical

The backend OpenAI timeout is configured to 12 seconds.

iOS waits 25 seconds for `/mobile/upsell/plan`, so it does not abandon a still-running backend request right before it returns.

While one plan request is in flight, iOS skips new plan preloads with `reason=in_flight_waiting` instead of cancelling the old request and starting another one. This prevents duplicate OpenAI calls when the customer checks items while the first plan is still loading.

### Decision: Keep loaded-empty and pending semantics

The iOS cache continues to distinguish:

- missing/not loaded
- loaded empty
- loaded with suggestions

If a customer completes a station while the plan is still loading, the pending opportunity waits long enough for the 25-second plan request. It shows only if that exact opportunity later returns suggestions.

### Decision: Keep internal classifier only as support code

The internal product classifier can remain because existing single-suggestion code/tests and future helper work may use it. For the AI-first plan flow, it is no longer the gatekeeper for the candidates sent to OpenAI.

## Risks / Trade-offs

- [Risk] Token usage increases with a wider candidate catalog. -> Mitigation: cap `upsell.max-candidates`, keep compact candidate fields, and log token usage.
- [Risk] OpenAI can still choose weak products. -> Mitigation: prompt explicitly says to return empty arrays when nothing clearly fits; manual simulator evaluation remains required.
- [Risk] If OpenAI is slow, the user may complete the first station before results arrive. -> Mitigation: longer pending opportunity age and no duplicate in-flight request.
- [Risk] Empty results may feel like the feature vanished. -> Mitigation: logs distinguish `loaded_empty` and `no_suggestions`.
- [Risk] LeoCloud restart without rebuilding image will not deploy Java code. -> Mitigation: push to `main` so GitHub Actions builds/pushes GHCR `latest`, then restart the deployment.

## Migration Plan

1. Update backend plan payload construction to use a shared bounded AI catalog.
2. Update backend fallback behavior so OpenAI failures return empty opportunities instead of deterministic suggestions.
3. Increase OpenAI/backend and iOS timeout budgets.
4. Prevent iOS from cancelling an in-flight plan and starting a second plan request.
5. Bump plan cache version to `upsell-plan-v4`.
6. Update docs and OpenSpec to describe AI-first ranking.
7. Run backend tests, iOS build, strict OpenSpec validation, diff/secret checks.
8. Commit and push to `main` so GitHub Actions builds the backend image.
9. Wait for the backend image build to finish.
10. Apply Kubernetes manifest, restart `indooro-backend`, and wait for rollout.

## Open Questions

- Is `UPSELL_MAX_CANDIDATES=150` the best cost/quality point, or should it be tuned after token measurements?
- Should a later optimization compress candidate payloads further, for example id/name/category only?
- Should a two-step OpenAI flow be tested later: select IDs first, then write reasons only for selected products?
