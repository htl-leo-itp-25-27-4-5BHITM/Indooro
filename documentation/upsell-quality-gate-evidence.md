# Upsell Quality Gate Evidence

This note captures the simulator findings that drove `harden-upsell-prefilter-quality`.

## Observed Cases

| Trigger | Previous result | Source/fallback signal | Desired behavior |
| --- | --- | --- | --- |
| Coca-Cola | Flour or other baking/cooking products could appear | Fallback/OpenAI over noisy candidates | Only salty snacks/chips, or no prompt |
| Risotto | Apples, carrots, or oranges could appear | OpenAI received weak candidate pool | Cheese, broth, mushrooms, onion, oil, cooking vegetables, or no prompt |
| Butter | Pasta/sauce could repeatedly appear | Broad category/keyword relation | Bread, baking, eggs, flour, spreads, milk, or no prompt |
| Eggs | Sometimes no popup after session limit was consumed by weaker prompts | iOS session limit | Good prompts only; empty/weak opportunities do not show a sheet |
| Bad-Reiniger | Empty OpenAI result was correct but iOS could later treat it as cache miss | Loaded empty not cached | Cache loaded-empty and log `no_suggestions` |
| Weichspueler | `no_ranked_candidates` was correct | Strict no-safe-candidate case | Laundry-only suggestions or empty |
| Apple variants | Other apple products could remain candidates | Exact product id exclusion only | Suppress by normalized `apple` class |
| Flour repeats | Same flour class could appear across several opportunities | No plan-level class dedupe | Assign repeated class to strongest opportunity only |
| `shopping_session` vs `shopping_list` | Same opportunity could miss cache because source differed | Source was part of key | Reuse equivalent source when list/store/opportunity match |

## Regression Fixtures

Backend tests in `UpsellSuggestionServiceTest` now cover:

- Product classification for butter, apple, flour, cola, cleaner, softener, and unknown battery products.
- Cola not returning flour, pasta, butter, or eggs.
- Risotto not returning fruit.
- Cleaner not returning food.
- Softener returning only laundry suggestions or empty.
- Apple variants suppressed by product class.
- Plan-level flour dedupe across butter and eggs.

Manual iOS verification should check for these debug lines:

- `preloadPlan cached loaded_empty ...`
- `showOpportunity skipped ... reason=no_suggestions`
- `cache source_key_fallback ...`
- `pendingOpportunity dropped reason=loaded_empty ...`
- `pendingOpportunity dropped reason=not_in_plan ...`

## stabilize-upsell-quality: before/after

Scope: change `stabilize-upsell-quality-and-request-lifecycle`. The backend part is implemented on this branch. The iOS lifecycle and the one-retry rule are pending. The tests named below exist in `UpsellSuggestionServiceTest` and `MobileUpsellResourceTest`. This note does not record a test run.

### Before

Recorded in `openspec/changes/stabilize-upsell-quality-and-request-lifecycle/tasks.md` (task 1.4) from the two latest simulator runs:

- Repeated product variants were shown.
- One session made three OpenAI calls.
- The first test used 16,191 tokens.
- The second test made one request (stable).
- A fifth popup was shown successfully.

`tasks.md` does not assign each item to a single run.

### After

Post-change request counts, OpenAI elapsed time, and token totals are to be measured in manual acceptance (openspec tasks 14.1 to 14.11). No after-numbers are recorded here.

### Suppression examples from the backend tests

Each row corresponds to one backend test that sends a fixed model output through the plan path. The product names and IDs are the test fixtures.

| Case | Trigger | Model output (in AI order) | Kept | Why the others were dropped |
| --- | --- | --- | --- | --- |
| Apple variants | `Aepfel 1kg` (40) | `Aepfel Gala 1kg` (200), `Bio Aepfel lose` (43), `Naturjoghurt 500g` (41) | 41 | 200 and 43 are apple class, `trigger_equivalent` |
| Kitchen paper | `Kuechenrolle 4 Rollen` (91) | `Kuechenpapier 2 Rollen` (201), `Haushaltsrollen 3 Stueck` (211), `Putzschwamm 3er` (92) | 92 | 201 and 211 are kitchen_paper class, `trigger_equivalent` |
| Second toothpaste (and cleaner) | `Zahnpasta Elmex 75ml` (202) and `Frosch Citrus Dusche & Bad-Reiniger` (90) | `Zahncreme Aronal` (203), `Allzweckreiniger Zitrone` (209), `Zahnseide Minze` (210) | 210 | 203 is toothpaste class and 209 is cleaner class, both `trigger_equivalent` |
| Second cola | `Coca-Cola 1.5L` (70) | `Pepsi Cola 2L` (204), `S-BUDGET Chips gesalzen` (71) | 71 | 204 is cola class, `trigger_equivalent` |
| Two butters become one | `Toastbrot 500g` (20) | `Butter Bio 250g` (205), `Butter 250g` (30) | 205 | 30 is butter class, `duplicate_class`, retained 205 (first in AI order) |
| Risotto keeps one butter | `Risotto Reis 500g` (80) | `Butter 250g` (30), `Butter Bio 250g` (205), `Gemuesebruehe Wuerfel` (81) | 30, 81 | 205 is butter class, `duplicate_class`, retained 30 |
| Eggs keep one flour | `Freilandeier 10 Stueck` (22), name `Eier` | `Freilandeier 6 Stueck` (208), `Weizenmehl 1kg` (23), `Mehl Type 480 1kg` (206), `Vollmilch 1L` (24) | 23, 24 | 208 is eggs class, `trigger_equivalent`; 206 is flour class, `duplicate_class`, retained 23 |

Other tests cover the empty and failure outcomes: `allAiSuggestionsFilteredLeavesOpportunityEmptyWithoutDeterministicFallback` (empty, no fallback reason), `candidateLookupFailureIsRetryableNotCachedAndSkipsOpenAi`, `emptyCandidateLookupIsCachedAsNonRetryableNoCandidates`, `candidatesAllExcludedByContractAreCachedAsGenuineEmptyResult`, `emptyOpenAiSuggestionsAreCachedAsSuccessfulNonRetryableResult`, and `eachPlanRequestCallsOpenAiExactlyOnceEvenWhenItReturnsNothing`.

### Remaining limitations

- Cross-opportunity repeats are not suppressed. Diversity applies within one opportunity only. `dedupePlanCandidates` (a plan-level class dedupe that would keep a repeated class in its strongest opportunity) has no call site, so the "Flour repeats" row above is still open. The test `planLevelDedupeKeepsFlourClassOnOnlyOneOpportunity` injects no OpenAI result, so it does not exercise cross-opportunity suppression.
- The single-product path (`/suggestions`) still caches transient catalog failures. An IOException is treated as an empty list and cached as `none` for the full TTL. Its cache context version (`upsell-v4`) was not bumped, so single-product responses created before this change can still contain variants until the TTL expires.
- An OpenAI timeout or invalid output is cached as `openai_unavailable_timeout_or_invalid` for the full TTL (default 60 minutes). The same plan context returns empty until expiry, and no retry happens on the backend.
- A changed route signature still produces a new OpenAI call until the iOS handled-opportunity lifecycle lands. The backend cache only helps identical contexts.
- Identity limits: a name blocked by a fragment loses its class (`Butter Alpenmilch`), names without the product word carry no class, alias lists are exact tokens and suffixes, and all cleaner-named products share one class.
- Prompt guidance is probabilistic. The post-AI filter only removes products it can classify.
- Suppression lines are DEBUG level, so they do not appear in INFO logs.
