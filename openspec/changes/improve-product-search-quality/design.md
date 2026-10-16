## Decisions

1. **Index via alias**: `products` becomes an alias to `products_v2`; reindex creates `products_vN+1`, copies documents, switches the alias atomically; old index kept until verified.
2. **Analyzers**: `name` (german_light stemmer + asciifolding preserve_original + lowercase), `name.prefix` (edge_ngram 2–15 on whole words), `name.parts` (word_delimiter_graph splitting „H-Milch“, plus a dictionary decompounder with a small curated word list from the catalog), synonyms at search time.
3. **Quality gate**: precision@3 ≥ 0.85 on the 60-query set (provisional) before the alias switch on LeoCloud.
4. **Testing**: Testcontainers OpenSearch if Docker is available; otherwise a documented local OpenSearch from `docker-compose.yml`; test is tagged so CI can run it when Docker is present.
