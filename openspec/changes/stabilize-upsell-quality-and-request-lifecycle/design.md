## Context

The current shopping-session flow sends one bounded shared catalog to OpenAI, validates returned IDs, caches opportunities in iOS, and displays station-bound prompts without a live request at check-off time. Simulator evidence confirms that transport, timeout hierarchy, in-flight suppression, cache lookup, station grouping, `addedFromUpsell` suppression, and the 10-prompt session limit work.

Three quality and cost gaps remain:

1. Prompt-only instructions do not reliably prevent substitutions. OpenAI still returns kitchen paper for kitchen roll, toothpaste for toothpaste, fresh fruit for apples, and multiple variants of one product class.
2. A handled opportunity can be recreated after list status changes because the cache entry is consumed and the new route signature no longer remembers that the opportunity was already shown. This produced repeated 5,000-token calls in one session.
3. `loadPlanCandidates` currently converts an `IOException` into `List.of()`. The plan layer then reports and caches `no_candidates`, making a transient OpenSearch failure indistinguishable from a legitimate empty catalog result.

The product catalog remains lean: ID, name, price, layout code, and optional store scope. There is no reliable full ontology. Therefore this design keeps AI-first semantic selection and introduces only narrow post-AI safety constraints with strong evidence.

## Goals / Non-Goals

**Goals:**

- Reject obvious variants and substitutes after OpenAI without narrowing the catalog before AI.
- Keep valid cross-category and same-department complements available.
- Return diverse suggestions rather than multiple package/brand variants.
- Prevent a handled opportunity from consuming more tokens in the same shopping session.
- Make request state canonical so callback order and duplicate IDs do not change signatures.
- Distinguish candidate lookup failures, genuine no-candidate results, and intentional AI-empty results.
- Permit one token-safe retry only when OpenAI was not called.
- Preserve current API compatibility, anonymous mobile behavior, non-blocking completion, and server-side key security.

**Non-Goals:**

- No return to deterministic Java complement ranking or hard semantic input prefiltering.
- No complete supermarket ontology, recipe graph, purchase-history personalization, margin optimization, or inventory integration.
- No second OpenAI validator call; latency and token cost would increase.
- No requirement that every opportunity produce a popup.
- No public product-class API and no catalog schema migration.
- No retry after a normal OpenAI result, OpenAI timeout, invalid AI output, or token-consuming failure.

## Decisions

### Decision: Apply equivalence rules only after OpenAI

OpenAI continues to receive every valid bounded candidate. After structured output parsing and candidate-ID validation, the backend evaluates each selected candidate against the trigger products for that opportunity.

The validator uses a `ProductEquivalence` signal with:

- normalized product name
- strong product class key when derivable
- generic product tokens and known synonym aliases
- brand/size/count/unit/flavor/quality tokens treated as modifiers rather than the base product

A candidate is rejected only when strong evidence identifies the same base product type. Examples include apple/apple, kitchen roll/kitchen paper, toothpaste/toothpaste, cola/another cola, flour/flour, and butter/another butter when butter itself is the trigger.

Broad category, layout category, shelf, or domain equality is insufficient for rejection. Butter remains valid for risotto; flour and milk remain valid for eggs. Unknown classifications pass through unless exact normalized-name evidence proves equivalence.

Alternative considered: run the existing semantic classifier before OpenAI. Rejected because previous simulator tests showed broad Java rules removed useful choices and made the candidate pool brittle.

Alternative considered: trust a new AI `relationship` field. Rejected as the sole guard because the same model can mislabel the relationship it already selected. Such a field may be logged later, but hard safety must not depend on self-classification.

### Decision: Diversify by strong class after trigger-equivalence rejection

For each opportunity, preserve AI order and retain the first valid suggestion for each strong equivalent-product class. Products without a reliable class are deduplicated only by product ID or exact normalized base identity.

This converts two butter variants into one butter suggestion while preserving other distinct complements. It does not backfill with deterministic server guesses if fewer than three remain.

### Decision: Keep prompt improvements as guidance, not enforcement

The system prompt will define a complement as a distinct product that enables or improves a use case with the trigger. It will include explicit bad and good examples and instruct the model to return fewer suggestions rather than fill all slots.

Prompt regression tests verify the examples are present. The post-validator remains authoritative because recent logs prove prompt compliance is probabilistic.

### Decision: Represent opportunity handling separately from plan cache

`UpsellSuggestionStore` will keep a session-scoped handled set independent of `cachedOpportunities`.

The identity is based on:

- list ID
- store ID
- normalized source
- opportunity ID
- sorted eligible trigger product IDs

Lifecycle outcomes that mark an identity handled:

- prompt shown and later dismissed
- suggestion accepted
- successful AI result completed with no suggestions
- successful filtered-empty result completed

Removing a cache entry after use does not remove handled state. Plan construction excludes handled identities before computing the request signature. Reopening and re-completing the same item in the same session therefore does not create another request.

If station composition changes, the sorted trigger-ID set changes and forms a new identity. `resetSession()` and explicit store changes clear both plan cache and handled state.

Alternative considered: retain every consumed cache entry forever. Rejected because cache state and user-action lifecycle have different responsibilities and expiration rules.

### Decision: Canonicalize shopping state before signature and payload creation

iOS creates sets from the current list snapshot:

- `currentIds`: product IDs for open eligible items
- `completedIds`: product IDs for done/missing/skipped items minus `currentIds`

Both become sorted unique arrays. This gives current/open state precedence when duplicate rows with the same product ID have different statuses. The same canonical arrays feed both `PlanRequestSignature` and `UpsellPlanRequest`, preventing payload/signature drift.

Trigger IDs are independently normalized, sorted, and deduplicated. Products marked `addedFromUpsell` remain excluded from trigger opportunities.

### Decision: Return a typed candidate lookup outcome internally

`loadPlanCandidates` will no longer collapse exceptions and valid emptiness into the same list. It will return an internal outcome equivalent to:

- `success(candidates)`
- `successEmpty`
- `failure(reason)`

An OpenSearch `IOException` produces a retryable pre-AI plan result with a distinct reason such as `candidate_lookup_failed`. This response reports no OpenAI elapsed time or tokens and is not written to the normal long-lived plan cache.

A successful lookup followed by complete contract exclusion produces non-retryable `no_candidates` and may be cached normally. A successful OpenAI empty response remains a normal `source=openai` loaded-empty result.

The mobile response shape remains backward compatible. The existing debug object may gain an optional `retryable` boolean; older clients ignore it. If changing the DTO is unnecessary, an enumerated `fallbackReason` can drive the same behavior, but implementation must keep retryability explicit in Swift rather than inferred from arbitrary text.

### Decision: Allow one delayed retry only before OpenAI consumption

iOS keeps a retry-attempt map keyed by `PlanRequestSignature`. For `candidate_lookup_failed` with no OpenAI token/timing evidence:

1. Schedule one retry after a short delay, initially 1 second.
2. Reconfirm the same list, store, source, and opportunity signature.
3. Skip retry if a plan is active, the session reset, or every opportunity became handled/cached.
4. Stop after attempt one regardless of the second outcome.

No automatic retry occurs for AI-empty results, output filtered to empty, OpenAI timeout/invalid output, or responses containing OpenAI token usage. This bounds both request volume and cost.

### Decision: Version plan cache behavior

The backend plan cache context version will be bumped when post-AI validation is implemented so older responses containing equivalent variants are not reused. No database migration is needed; old cache rows expire naturally.

### Decision: Verification uses deterministic fixtures plus runtime evidence

Backend tests use fake OpenSearch and fake AI outputs for:

- apples to apple variants
- kitchen roll to kitchen paper
- toothpaste plus cleaner station equivalents
- risotto to butter preservation
- same-class diversity
- unknown-class pass-through
- candidate lookup exception versus successful empty lookup
- no cache write for retryable failure
- prompt examples and cache version

iOS verification should isolate canonical state and opportunity lifecycle into testable pure helpers where practical. At minimum, simulator logs must prove five or more prompts can appear, handled opportunities do not re-request, one candidate failure retries once, and normal AI-empty opportunities do not retry.

## Risks / Trade-offs

- [Risk] Product-name normalization falsely groups distinct products. -> Mitigation: reject only on strong class/alias evidence; broad category and domain are never enough.
- [Risk] Catalog names omit enough detail to classify an obvious variant. -> Mitigation: keep prompt guidance and log unknown classes; prefer an occasional weak result over broad prefilter regression.
- [Risk] Handled state suppresses a legitimately changed station. -> Mitigation: include sorted eligible trigger IDs in identity so material composition changes create a new opportunity.
- [Risk] Duplicate product rows create conflicting statuses. -> Mitigation: canonical open-state precedence and deterministic set projection.
- [Risk] Retry causes duplicate work during rapid callbacks. -> Mitigation: one attempt per signature, existing in-flight guards, delayed context recheck, and no retry after OpenAI usage.
- [Risk] Optional debug fields affect decoding. -> Mitigation: make new fields optional and preserve existing response fields/source semantics.
- [Risk] Post-filtering yields fewer suggestions. -> Mitigation: empty or shorter high-quality prompts are intentionally preferred over variants and server guesses.

## Migration Plan

1. Add deterministic equivalence/diversity helpers and backend tests without changing AI candidate input.
2. Apply post-AI validation and bump the plan cache context version.
3. Distinguish candidate lookup failure from successful empty lookup and expose explicit retryability.
4. Add iOS canonical state, handled opportunity lifecycle, and one-retry state.
5. Update prompt text, debug logs, documentation, and OpenSpec artifacts.
6. Run targeted backend tests, iOS simulator build, strict OpenSpec validation, diff checks, and secret checks.
7. Manually test normal plan success, five-plus prompts, same-product suppression, reopened items, transient failure retry, AI-empty behavior, and `addedFromUpsell` behavior.
8. Commit and push, wait for the GHCR backend image, apply `k8s/backend.yaml`, restart `indooro-backend`, and verify the deployed image digest and readiness.

Rollback:

- Revert the backend/iOS commit and redeploy the previous backend image digest.
- The cache-version bump is harmless on rollback; cache rows expire without migration.
- If only mobile lifecycle behavior regresses, ship the previous iOS build while leaving the backward-compatible backend active.

## Open Questions

None required before implementation. Exact synonym/normalization fixtures should be derived from the current test catalog and expanded only with evidence from logs.
