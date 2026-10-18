# Upsell Candidate Ranking

## Current Strategy

The upsell plan now uses an AI-first ranking strategy.

The backend no longer tries to semantically decide which products fit a trigger product before OpenAI runs. It loads a bounded store catalog, removes products that must never be suggested, and lets OpenAI decide which products are useful add-ons for each shopping station.

The server still keeps the non-negotiable safety contract:

- The OpenAI API key stays server-side.
- Only existing catalog product IDs can be returned.
- Products already open on the shopping list, completed products, and trigger products are excluded before the AI request.
- Returned product IDs are validated against the server candidate map.
- Duplicate product IDs in one opportunity are ignored.
- The OpenAI prompt rejects another brand, package size, flavor, or variant of the trigger product because it is an alternative, not an add-on.
- If OpenAI is disabled, unavailable, times out, or returns invalid JSON, the backend returns empty suggestions instead of deterministic fallback guesses.

This intentionally prefers no popup over weak server-generated suggestions.

## Flow

The mobile app calls `POST /api/mobile/upsell/plan` after the user selects a store and the route is known.

Backend flow:

1. Normalize route opportunities such as `station:<shelf-id>` or `item:<uuid>`.
2. Load a bounded OpenSearch candidate pool with the current store filter when available.
3. Exclude invalid products, duplicate product IDs, current list products, completed products, and trigger products.
4. Build one shared `candidateProducts` catalog for the OpenAI request.
5. Send all opportunities plus the shared catalog to OpenAI.
6. Expect structured JSON with known `opportunityId` and candidate `productId` values.
7. Validate every returned product ID against the server candidate map.
8. Return validated suggestions, or loaded-empty opportunities when OpenAI returns no strong fit.

## Config

- `upsell.max-candidates` limits the shared OpenSearch candidate catalog. Default: `150`.
- `upsell.max-suggestions` limits returned suggestions per opportunity. Default: `3`.
- `openai.upsell.timeout-ms` controls the backend OpenAI request timeout. Default: `12000`.
- `openai.upsell.enabled`, `openai.api-key`, `openai.upsell.model`, and `openai.upsell.reasoning-effort` keep their existing behavior.

The plan cache version is `upsell-plan-v6`. It was bumped from `upsell-plan-v5` so that plan responses created before the post-AI equivalence guard are not reused.

## OpenAI Payload Shape

OpenAI receives:

- `opportunities`: station IDs and trigger product IDs/names.
- `candidateProducts`: one shared bounded catalog for the store.
- `maxSuggestionsPerOpportunity`.

Each candidate contains compact catalog fields only:

- `id`
- `name`
- `categoryCode`
- `layoutCode`
- `hasLayoutPosition`

The backend does not send API secrets, internal cache hashes, user identifiers beyond the shopping-list context already needed for cache separation, or full product descriptions.

## Timeout And Retry Behavior

iOS uses a longer `POST /mobile/upsell/plan` timeout than the backend OpenAI timeout. This prevents the app from aborting a valid backend response just before it returns.

While one plan request is already in flight, iOS does not cancel it and does not start a second plan request for list changes caused by checking items. This avoids wasting tokens on a second OpenAI call while the first one is still running.

If the user checks an item before the plan response arrives, the existing pending-opportunity logic waits for the response and shows the popup only if that exact opportunity returns suggestions.

## Logs And Debug

Useful backend log lines:

- `Upsell plan candidate ranking requestId=... broadCandidates=... rankedCandidates=... perOpportunity=...`
- `Upsell plan OpenAI skipped requestId=... enabled=... hasApiKey=... opportunities=... candidates=...`
- `OpenAI upsell plan ranking succeeded requestId=... inputTokens=... outputTokens=... totalTokens=...`
- `Upsell plan response requestId=... source=... elapsedMs=... openAiElapsedMs=... fallbackReason=...`

Useful iOS debug lines:

- `preloadPlan requestId=... timeout=25.0s`
- `preloadPlan skipped reason=in_flight_waiting`
- `preloadPlan decoded ... totalTokens=...`
- `loaded_empty`: the backend evaluated the opportunity and intentionally returned no suggestions.
- `loaded_with_suggestions`: the opportunity has cached suggestions.
- `no_suggestions`: the sheet is skipped because the cached opportunity is empty.
- `source_key_fallback`: a cache entry created under `shopping_session` or `shopping_list` was reused for the equivalent source.

## Manual Checks

- The first store-selected plan request should not time out at six seconds anymore.
- Checking products while the plan is still loading should not start another OpenAI request.
- `source=openai` means OpenAI returned valid structured output.
- `source=cache` means the cached plan was reused.
- `source=none` with `fallbackReason=openai_unavailable_timeout_or_invalid` means no deterministic server fallback was used.
- Weak cases such as Gouda, eggs, cola, cleaner, or softener may return no popup if OpenAI finds no clear add-on.
- Apples should not suggest other apple variants, and cola should not suggest another cola size or brand.

## Tradeoff

This version may use more input tokens than strict server-side prefiltering because the AI sees a wider catalog. The benefit is that product-fit judgment is centralized in the model instead of brittle Java heuristics.

If token usage becomes too high, the next safe optimization is not semantic prefiltering again, but payload compaction or a two-step AI flow:

1. Ask the model to choose candidate IDs from a compact ID/name/category list.
2. Ask the model to write short reasons only for the selected IDs.

## Product Identity For Post-AI Equivalence

`ProductEquivalence` decides whether two catalog products are interchangeable. It runs only after OpenAI has returned a selection, and compares each selected product with the trigger products of the same opportunity (see `AI_UPSELL_FLOW.md`). It never changes the candidate pool, the prompt payload, or any product name. Normalization only feeds the comparison.

### Normalization

- Lowercase (root locale); `ä` becomes `ae`, `ö` becomes `oe`, `ü` becomes `ue`, `ß` becomes `ss`.
- Diacritics are removed. Every run of characters outside `a-z0-9` becomes one space.
- The result is split on spaces into tokens.

### Base Name

The base name is built for comparison only:

- Tokens shorter than two characters are dropped.
- Tokens containing a digit are dropped. This removes sizes, counts, units and percentages such as `1kg`, `250g`, `4er` and `3,5%`.
- A fixed list of brand, quality and packaging words is dropped: `bio`, `ja`, `clever`, `premium`, `classic`, `budget`, `lose`, `frisch`, `tray`, `beutel`, `flasche`, `dose`, `packung`, `pack`, `stueck`, `stk`, `rolle`, `rollen`. This is not a brand database. Other brand names stay in the base name and matter only where an alias class matches.
- Plural folding removes at most one suffix: `en` on tokens of six or more characters; otherwise a trailing `e` or `n`; otherwise a trailing `s` (not `ss`). The last two apply to tokens of five or more characters. Example: `Tomaten` and `Tomate` both fold to `tomat`.

### Strong Class

1. Alias rules run first, in this order: `toothpaste`, `cola`, `kitchen_paper`, `cleaner`, `apple`, `flour`, `butter`, `eggs`, `milk`, `sugar`. The first rule whose exact token or listed suffix matches the name decides the class.
2. Otherwise the service class from `classifyProduct` is used if it is in `STRONG_CLASSES` (for example `banana`, `onion`, `mushroom`, `laundry_softener`). Other service classes give no class.
3. The service class `paper_towel` is mapped to `kitchen_paper`.
4. A class is dropped when any name token contains a blocked fragment (`BLOCKED_PARTS`, substring match). Example: `Butter Alpenmilch` has the token `butter`, but the butter class is blocked by `milch` and the milk class is blocked by `butter`, so the product gets no class.

| Class | Exact tokens | Suffixes | Notes |
| --- | --- | --- | --- |
| `apple` | `apfel`, `apfeln`, `aepfel`, `aepfeln`, `apple`, `apples` | none | |
| `kitchen_paper` | `kuechenrolle(n)`, `kuechenpapier`, `kuechentuch(er)`, `haushaltsrolle(n)`, `haushaltstuch(er)`, `papierhandtuch(er)` | `kuechenrolle`, `kuechenpapier`, `kuechentuch`, `kuechentuecher`, `papierhandtuch` | English: `kitchen` together with `roll`, `rolls`, `paper`, `towel` or `towels` |
| `toothpaste` | `zahnpasta`, `zahnpasten`, `zahncreme`, `zahncremes`, `toothpaste` | `zahnpasta`, `zahncreme` | |
| `cola` | `cola`, `colas`, `coca`, `pepsi` | none | |
| `cleaner` | `reiniger`, `reinigers`, `cleaner` | `reiniger` | e.g. `Allzweckreiniger`, `Bad-Reiniger` |
| `flour` | `mehl`, `flour` | `mehl` | e.g. `Weizenmehl` |
| `butter` | `butter` | `butter` | `Erdnussbutter` is blocked by `erdnuss` |
| `eggs` | `ei`, `eier`, `eiern`, `egg`, `eggs` | `eier` | e.g. `Freilandeier` |
| `milk` | `milch`, `milk`, `vollmilch`, `frischmilch` | `milch` | blocked by `butter`, `kakao`, `schoko` and other fragments |
| `sugar` | `zucker`, `sugar`, `puderzucker`, `rohrzucker` | `zucker` | blocked by `vanille` and `schoko` |

### Equivalence

Two products are equivalent when:

- they have the same non-null strong class, or
- their base names are identical and not empty.

Diversity keys used in logs are `class:<classKey>` for a strong class and `name:<baseName>` otherwise.

Broad category, category code, layout code, shelf or station, department, and food/drink/cleaning domain are not inputs to equivalence. They never prove that two products are equivalent, and they are not a semantic prefilter. Products without a strong class stay eligible unless their base name matches exactly.

### Known Limitations

- Blocked fragments can cause false negatives. `Butter Alpenmilch` gets no butter class, so a second butter product with a different name can pass in the same opportunity. Fragments are matched as substrings, so a short fragment such as `mus` may block more than intended.
- Catalog names without the product word (for example `Gala 1kg` with no apple token) carry no alias token and stay eligible.
- Alias classes are exact-token and suffix lists, not an ontology. Spellings outside the lists are not recognized.
- All products matching the `cleaner` rule share one class, so two different cleaners in one opportunity count as one.
- Prompt guidance remains probabilistic. The filter only catches products it can classify.

## Opportunity Lifecycle And One-Retry Rule

Status: planned. The iOS part is not implemented. The specification is in `openspec/changes/stabilize-upsell-quality-and-request-lifecycle/design.md` (tasks 9 and 10). The backend part is implemented: `debug.retryable` is set and `candidate_lookup_failed` is not written to the cache.

Handled opportunity (planned):

- Session-scoped identity: list ID, store ID, normalized source, opportunity ID, and sorted eligible trigger product IDs.
- Kept separately from the plan cache, pending opportunities, and request signatures, so removing a consumed cache entry does not clear it.
- Marked handled when the prompt is shown and dismissed, when a suggestion is accepted, or when a successfully evaluated empty AI or filtered opportunity is completed.
- Not marked handled: retryable candidate lookup failures.
- A materially changed trigger set at the same station is a new identity.
- Cleared by `resetSession()` and by an explicit change to another store.
- Effect: reopening or re-completing a handled station does not start another plan request in the same session.

One retry (planned):

- Only for `candidate_lookup_failed` with `debug.retryable=true` and no OpenAI usage.
- Exactly one retry after a short delay (initially one second, configurable), keyed by the canonical plan signature.
- Before retrying, session, store, list, source, signature, and eligible opportunities must be unchanged. The existing in-flight guards apply.
- After a second failure the client stops. Shopping completion is never blocked.
- Never retried: AI-empty, filtered-empty, OpenAI timeout or invalid output, cache hits, or any response with token usage.

Canonical shopping state (planned, task 8): current and completed product IDs are sorted, deduplicated, and disjoint (open state wins on conflicts) before the signature and the request are built.

### Simulator Checklist (later/Mensch)

iOS work is not part of this change. Run this after the iOS lifecycle has landed:

- Start a fresh shopping session with the store selected. Expect one plan request.
- Reopen and re-complete a handled station. Expect `preloadPlan skipped reason=handled_opportunity` and no network request.
- Inject one candidate lookup failure (openspec task 14.8). Expect one retry after about one second, a backend line with `outcome=candidate_lookup_failed` and `retryable=true`, no token fields on that attempt, and no third request.
- Complete an AI-empty station. Expect no popup and no retry.
- Record request count, backend and OpenAI elapsed time, candidate count, input/output/total/cached tokens, and displayed product IDs (openspec task 14.11).

## Suppression And Outcome Logs

Suppression lines are written by `validatedSuggestions` for every dropped AI suggestion. They are DEBUG level and do not appear at INFO:

- `Upsell candidate suppressed requestId=... opportunity=... productId=... class=... reason=trigger_equivalent`
- `Upsell candidate suppressed requestId=... opportunity=... productId=... class=... reason=duplicate_class retainedProductId=...`

On the single-product `/suggestions` path the request ID is a fresh UUID that does not appear in the response, and the opportunity is `checked:<productId>`.

Lookup failure (WARN):

- `Upsell plan candidate lookup failed requestId=... opportunities=... reason=candidate_lookup_failed retryable=true`, followed by the exception log `Upsell plan candidate catalog query failed (IOException)`.

Plan outcome (INFO, one line per plan response that reaches `logPlanResult`):

- `Upsell plan response requestId=... outcome=... source=... elapsedMs=... openAiElapsedMs=... inputTokens=... outputTokens=... totalTokens=... fallbackReason=... retryable=... opportunities=... suggestions=...`

Outcome values:

- `cache_hit`: the response came from the plan cache (`source=cache`).
- `candidate_lookup_failed`, `no_candidates`, `no_ranked_candidates`, `openai_unavailable_timeout_or_invalid`: the value of `fallbackReason`, which becomes the outcome whenever a fallback reason is set.
- `filtered_empty`: OpenAI returned suggestions, and all of them were removed by validation.
- `openai_empty`: OpenAI returned a valid empty result.
- `suggested`: at least one suggestion is returned.

The early returns for `upsell_disabled` and `no_valid_opportunities` do not reach `logPlanResult`, so they produce no outcome line. `retryable` is `true` only for `candidate_lookup_failed`.
