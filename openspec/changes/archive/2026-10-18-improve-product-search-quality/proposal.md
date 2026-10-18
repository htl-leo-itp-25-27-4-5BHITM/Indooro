## Why

Search is the first thing every pilot user does, and „findet nichts“ ends the test immediately. The current OpenSearch query (`OpenSearchService.searchProducts`) combines exact keyword, phrase and fuzzy match on `name` with the `standard` analyzer. German product names are compounds („Vollmilch“, „H-Milch“, „Backpulver“), contain umlauts and brand prefixes („S-BUDGET“, „SPAR Natur*pur“), and customers type partial words while typing. There is no measured search quality today.

## What Changes

- Add a German search setup to the `products` index: lowercase, ASCII folding (ä→a, ß→ss) in addition to the original form, German light stemming, a compound/word-part sub-field (edge n-grams on word parts) for prefix and infix matches, and a synonym list file (e.g. „Paradeiser, Tomaten“, „Topfen, Quark“, „Obers, Sahne“).
- Rework the query: exact name, phrase, prefix-as-you-type, fuzzy, and word-part match with explicit boosts; brand words do not dominate.
- Add a search quality test set: 60 realistic queries (typos, Austrian words, partial words, umlauts) with expected top-3 products on the demo catalog, run as a JUnit test against an embedded or local OpenSearch, and report precision@3.
- Provide a safe reindex procedure (new index + alias switch) so the live catalog is not deleted.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `product-catalog-search`: German analysis, synonyms, prefix search, measured quality gate, alias-based reindex.

## Impact

- Owner: Person B (Windows). Branch `pilot/search-quality` from `main` after the admin rebuild merge.
- Backend: `OpenSearchService` (mapping, query), new `src/main/resources/opensearch/products-index.json` and `synonyms_de.txt`, reindex admin endpoint or script, tests. Mobile API unchanged.
