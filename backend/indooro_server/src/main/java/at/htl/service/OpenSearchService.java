package at.htl.service;

import at.htl.admin.dto.CommonDtos;
import at.htl.model.Product;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.OpenSearchException;
import org.opensearch.client.opensearch._types.Result;
import org.opensearch.client.opensearch._types.Refresh;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.mapping.FieldType;
import org.opensearch.client.opensearch._types.mapping.Property;
import org.opensearch.client.opensearch._types.mapping.TypeMapping;
import org.opensearch.client.opensearch._types.query_dsl.BoolQuery;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch._types.query_dsl.Operator;
import org.opensearch.client.opensearch.core.*;
import org.opensearch.client.opensearch.core.search.Hit;
import org.opensearch.client.opensearch.indices.ExistsRequest;
import org.opensearch.client.opensearch.indices.GetIndexRequest;
import org.opensearch.client.opensearch.indices.GetIndexResponse;
import org.opensearch.client.opensearch.indices.GetMappingRequest;
import org.opensearch.client.opensearch.indices.GetMappingResponse;
import org.opensearch.client.opensearch.indices.IndexState;
import org.opensearch.client.opensearch.indices.RefreshRequest;
import org.opensearch.client.opensearch.indices.UpdateAliasesRequest;
import org.opensearch.client.opensearch.indices.get_mapping.IndexMappingRecord;
import org.opensearch.client.opensearch.indices.update_aliases.Action;

import java.io.IOException;
import java.text.Collator;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@ApplicationScoped
public class OpenSearchService {

    private static final Logger LOG = Logger.getLogger(OpenSearchService.class);
    private static final float UPSELL_TRIGGER_BOOST = 3.0f;
    private static final float UPSELL_COMPLEMENT_BOOST = 2.0f;
    private static final float UPSELL_BASE_BOOST = 0.1f;
    private static final String ROUTABLE_LAYOUT_SCRIPT ="doc['layoutCode'].size() != 0 && /[0-9]{1,4}\\/[0-9]{1,3}\\/[0-9]{1,2}\\/[0-9]{1,2}/.matcher(doc['layoutCode'].value.trim()).matches()";

    /** Ergebnis eines Reindex: Quelle, Zielindex und die beiden verglichenen Dokumentzahlen. */
    public record ReindexResult(String source, String target, long sourceCount, long targetCount, String status) {}

    /**
     * Ergebnis der Alias-Umschaltung. {@code previous} sind die Versionsindizes, die den Alias vorher trugen;
     * fuer einen Rollback genuegt ein erneuter Aufruf von {@link #activateIndex(String, boolean)} mit einem dieser Namen
     * (bei abweichenden Dokumentzahlen mit {@code force=true}, siehe {@link #activateIndex(String, boolean)}).
     */
    public record ActivateResult(String alias, String index, List<String> previous) {}

    /** Ein Versionsindex {@code <prefix><N>}; {@code docCount} ist null, wenn die Zaehlung fehlschlug. */
    public record IndexVersion(String name, Long docCount, boolean active) {}

    /**
     * Zustand der Suchindizes fuer die Admin-Seite: Alias, Quellindex mit Dokumentzahl, die Versionsindizes
     * (aufsteigend nach Nummer) und die Versionen, die den Alias tragen. Eine nicht ermittelte Zahl ist null.
     */
    public record IndexOverview(String alias, String sourceIndex, Long sourceCount, List<String> activeIndices,
                                List<IndexVersion> versions) {}

    /** Ergebnis der Mapping-Pruefung fuer die Subfelder {@code name.prefix} und {@code name.parts}. */
    private record NameSubfieldSupport(boolean supported, long checkedAtNanos) {}

    /**
     * Wie lange ein Mapping-Ergebnis gilt. Mehrere Backend-Instanzen kennen nur ihren eigenen Cache; nach einer
     * Alias-Umschaltung auf einer anderen Instanz wird der Stand spaetestens nach diesem Intervall neu gelesen.
     */
    static final long NAME_SUBFIELD_CACHE_NANOS = TimeUnit.SECONDS.toNanos(60);

    private static final String NAME_PREFIX_SUBFIELD = "prefix";
    private static final String NAME_PARTS_SUBFIELD = "parts";

    @Inject
    OpenSearchClient client;

    @ConfigProperty(name = "opensearch.index")
    String indexName;

    @ConfigProperty(name = "opensearch.index-prefix")
    String indexPrefix;

    @ConfigProperty(name = "opensearch.alias")
    String aliasName;

    /** Cache der Mapping-Pruefung. {@code null}: unbekannt oder letzte Abfrage fehlgeschlagen (dann nicht gecacht). */
    private volatile NameSubfieldSupport nameSubfieldSupport;

    /**
     * Sucht Produkte anhand eines Suchbegriffs
     */
    public List<Product> searchProducts(String query, Integer size) throws IOException {
        return searchProducts(query, size, null, null);
    }

    public List<Product> searchProducts(String query, Integer size, String storeId, String storeCode) throws IOException {
        final Integer finalSize = (size == null) ? 10 : size;
        final String q = query.trim();
        final String normalizedStoreId = normalizeOptionalFilter(storeId);
        final String normalizedStoreCode = normalizeOptionalFilter(storeCode);
        // Subfelder name.prefix / name.parts existieren nur in Indizes mit neuem Mapping. In einem Altindex
        // wuerden diese Klauseln still nichts treffen; deshalb nur dann ins Query aufnehmen, wenn das Mapping sie hat.
        final boolean withNameSubfields = nameSubfieldsAvailable();

        SearchRequest searchRequest = SearchRequest.of(s -> s
                .index(indexName)
                .size(finalSize)
                .query(qry -> qry.bool(b -> {
                    b
                            // 1) Exakter Name in Originalschreibweise (z.B. "Nutella") => maximaler Boost
                            .should(sh -> sh.term(t -> t
                                    .field("name.keyword")
                                    .value(v -> v.stringValue(q))
                                    .boost(10f)
                            ))
                            // 2) Phrase (z.B. "Milch 1L")
                            .should(sh -> sh.matchPhrase(mp -> mp
                                    .field("name")
                                    .query(q)
                                    .boost(6f)
                            ))
                            // 3) Alle Wörter im Namen, deutsche Analyse (Umlaute, Stamm, Synonyme)
                            .should(sh -> sh.match(m -> m
                                    .field("name")
                                    .query(FieldValue.of(q))
                                    .operator(Operator.And)
                                    .boost(4f)
                            ));
                    // 4) Präfix beim Tippen ("backp" => "Backpulver"), nur mit Subfeld name.prefix
                    if (withNameSubfields) {
                        b.should(sh -> sh.match(m -> m
                                .field("name.prefix")
                                .query(FieldValue.of(q))
                                .operator(Operator.And)
                                .boost(3f)
                        ));
                    }
                    b
                            // 5) Tippfehler ("Nutela", "Milsch"); erste Buchstaben bleiben stabil
                            .should(sh -> sh.match(m -> m
                                    .field("name")
                                    .query(FieldValue.of(q))
                                    .fuzziness("AUTO")
                                    .prefixLength(1)
                                    .maxExpansions(50)
                                    .operator(Operator.And)
                                    .boost(1.5f)
                            ));
                    // 6) Wortteile innerhalb eines Namens ("wasser" in "Mineralwasser"), nur mit Subfeld name.parts
                    if (withNameSubfields) {
                        b.should(sh -> sh.match(m -> m
                                .field("name.parts")
                                .query(FieldValue.of(q))
                                .operator(Operator.And)
                                .boost(1f)
                        ));
                    }
                    b
                            // 6b) Entspannt: bei mehreren Suchwoertern genuegen 75 % ("frische milch" findet "Frischmilch")
                            .should(sh -> sh.match(m -> m
                                    .field("name")
                                    .query(FieldValue.of(q))
                                    .operator(Operator.Or)
                                    .minimumShouldMatch("75%")
                                    .boost(0.6f)
                            ))
                            // 7) layoutCode exakt (bestehendes Verhalten)
                            .should(sh -> sh.term(t -> t
                                    .field("layoutCode")
                                    .value(v -> v.stringValue(q))
                                    .boost(6f)
                            ))
                            .minimumShouldMatch("1");

                    applyStoreFilter(b, normalizedStoreId, normalizedStoreCode);
                    return b;
                }))
        );

        SearchResponse<Product> response = client.search(searchRequest, Product.class);

        return response.hits().hits().stream()
                .map(Hit::source)
                .filter(p -> p != null)
                .collect(Collectors.toList());
    }

    /**
     * Holt ein Produkt anhand seiner Produkt-ID (nicht der Dokument-ID). Ohne Store-Angabe liefert die Suche
     * das erste Treffer-Produkt ueber alle Maerkte.
     */
    public Product getProductById(Integer id) throws IOException {
        return getProductById(id, null, null);
    }

    public Product getProductById(Integer id, String storeId, String storeCode) throws IOException {
        final String normalizedStoreId = normalizeOptionalFilter(storeId);
        final String normalizedStoreCode = normalizeOptionalFilter(storeCode);

        SearchRequest searchRequest = SearchRequest.of(s -> s
                .index(indexName)
                .size(1)
                .query(q -> q.bool(b -> {
                    b.filter(filter -> filter.term(term -> term
                            .field("id")
                            .value(FieldValue.of(id.intValue()))
                    ));
                    applyStoreFilter(b, normalizedStoreId, normalizedStoreCode);
                    return b;
                }))
        );

        SearchResponse<Product> response = client.search(searchRequest, Product.class);
        return response.hits().hits().stream()
                .map(Hit::source)
                .filter(Objects::nonNull)
                .findFirst()
                .orElse(null);
    }

    /**
     * Holt mehrere Produkte per Produkt-ID in einer Anfrage, ohne Store-Filter wie {@link #getProductById(Integer)}.
     * Die Dokument-IDs sind `<storeCode>:<id>`, daher wird ueber das Feld `id` gesucht statt per mget ueber `_id`.
     * Je Produkt-ID liefert `collapse` hoechstens einen Treffer. Fehlende Produkte fehlen in der Map.
     * Eine leere Eingabe ergibt eine leere Map ohne Anfrage.
     */
    public Map<String, Product> getProductsByIds(Collection<String> productIds) throws IOException {
        if (productIds == null || productIds.isEmpty()) {
            return Map.of();
        }
        List<FieldValue> values = productIds.stream()
                .map(this::parseProductId)
                .filter(Objects::nonNull)
                .distinct()
                .map(id -> FieldValue.of(id.intValue()))
                .toList();
        if (values.isEmpty()) {
            return Map.of();
        }

        SearchRequest searchRequest = SearchRequest.of(s -> s
                .index(indexName)
                .size(values.size())
                .query(q -> q.terms(t -> t
                        .field("id")
                        .terms(terms -> terms.value(values))
                ))
                .collapse(c -> c.field("id"))
        );

        SearchResponse<Product> response = client.search(searchRequest, Product.class);
        return response.hits().hits().stream()
                .map(Hit::source)
                .filter(Objects::nonNull)
                .collect(Collectors.toMap(
                        product -> String.valueOf(product.getId()),
                        product -> product,
                        (first, second) -> first,
                        LinkedHashMap::new));
    }

    /**
     * Holt mehrere Produkte per numerischer Produkt-ID in einer Anfrage, ueber alle Maerkte wie {@link #getProductById(Integer)}
     * ohne Store-Filter. Liegt eine ID in mehreren Markt-Dokumenten, gewinnt das in storeCode aufsteigend erste Dokument
     * (`collapse` liefert je ID hoechstens einen Treffer). Fehlende Produkte fehlen in der Map, leere Eingabe ergibt
     * eine leere Map ohne Anfrage.
     */
    public Map<Integer, Product> getProductsByNumericIds(Collection<Integer> productIds) throws IOException {
        if (productIds == null || productIds.isEmpty()) {
            return Map.of();
        }
        List<FieldValue> values = productIds.stream()
                .filter(Objects::nonNull)
                .distinct()
                .map(id -> FieldValue.of(id.intValue()))
                .toList();
        if (values.isEmpty()) {
            return Map.of();
        }

        SearchRequest searchRequest = SearchRequest.of(s -> s
                .index(indexName)
                .size(values.size())
                .query(q -> q.terms(t -> t
                        .field("id")
                        .terms(terms -> terms.value(values))
                ))
                .collapse(c -> c.field("id"))
                .sort(sort -> sort.field(field -> field.field("storeCode")
                        .order(SortOrder.Asc)
                        .unmappedType(FieldType.Keyword)))
        );

        SearchResponse<Product> response = client.search(searchRequest, Product.class);
        Map<Integer, Product> products = new LinkedHashMap<>();
        for (Hit<Product> hit : response.hits().hits()) {
            Product product = hit.source();
            if (product != null && product.getId() != null) {
                products.putIfAbsent(product.getId(), product);
            }
        }
        return products;
    }

    private Integer parseProductId(String productId) {
        if (productId == null) {
            return null;
        }
        try {
            return Integer.valueOf(productId.trim());
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    /**
     * Holt Produkte, optional nur eines Marktes
     */
    public List<Product> getAllProducts(Integer size, String storeId, String storeCode) throws IOException {
        final Integer finalSize = (size == null) ? 100 : size;
        final String normalizedStoreId = normalizeOptionalFilter(storeId);
        final String normalizedStoreCode = normalizeOptionalFilter(storeCode);

        SearchRequest searchRequest = SearchRequest.of(s -> s
                .index(indexName)
                .query(q -> q.bool(b -> {
                    b.must(m -> m.matchAll(ma -> ma));
                    applyStoreFilter(b, normalizedStoreId, normalizedStoreCode);
                    return b;
                }))
                .size(finalSize)
        );

        SearchResponse<Product> response = client.search(searchRequest, Product.class);

        return response.hits().hits().stream()
                .map(Hit::source)
                .collect(Collectors.toList());
    }

    /** Admin paging restricted to one store (storeId and/or storeCode, both from the resolved store). */
    public CommonDtos.PageResponse<Product> searchAdminProductsPage(String query, int page, int size,
                                                                     String sort, Boolean routable,
                                                                     String storeId, String storeCode) throws IOException {
        String q = query == null ? "" : query.trim();
        long offset = (long) Math.max(page, 0) * Math.max(size, 1);
        String normalizedSort = sort == null ? "id" : sort;
        Query productQuery = buildAdminProductQuery(q, routable,
                normalizeOptionalFilter(storeId), normalizeOptionalFilter(storeCode));
        List<Product> allProducts = new ArrayList<>();
        long total = 0;
        List<String> searchAfter = null;
        final int batchSize = 500;
        while (true) {
            SearchRequest.Builder request = new SearchRequest.Builder()
                    .index(indexName)
                    .size(batchSize)
                    .trackTotalHits(track -> track.enabled(true))
                    .sort(sortSpec -> sortSpec.field(field -> field.field("id").order(SortOrder.Asc)))
                    .query(productQuery);
            if (searchAfter != null) request.searchAfter(searchAfter);
            SearchResponse<Product> response = client.search(request.build(), Product.class);
            if (searchAfter == null && response.hits().total() != null) total = response.hits().total().value();
            List<Hit<Product>> hits = response.hits().hits();
            hits.stream().map(Hit::source).filter(product -> product != null).forEach(allProducts::add);
            if (hits.size() < batchSize || hits.isEmpty()) break;
            searchAfter = hits.get(hits.size() - 1).sort();
            if (searchAfter == null || searchAfter.isEmpty()) break;
        }
        if (total == 0) total = allProducts.size();
        allProducts.sort(productComparator(normalizedSort));
        int start = (int) Math.min(offset, allProducts.size());
        int end = (int) Math.min((long) start + size, allProducts.size());
        return new CommonDtos.PageResponse<>(allProducts.subList(start, end), page, size, total);
    }

    private Query buildAdminProductQuery(String q, Boolean routable, String storeId, String storeCode) {
        if (q.isEmpty() && routable == null && storeId == null && storeCode == null) {
            return Query.of(query -> query.matchAll(matchAll -> matchAll));
        }
        return Query.of(query -> query.bool(bool -> {
            if (q.isEmpty()) {
                bool.must(must -> must.matchAll(matchAll -> matchAll));
            } else {
                bool.should(should -> should.term(term -> term.field("name.keyword").value(value -> value.stringValue(q)).boost(10f)));
                bool.should(should -> should.match(match -> match.field("name").query(FieldValue.of(q)).operator(Operator.And)));
                bool.should(should -> should.term(term -> term.field("layoutCode").value(value -> value.stringValue(q))));
                bool.should(should -> should.term(term -> term.field("storeCode").value(value -> value.stringValue(q))));
                if (q.matches("\\d+")) {
                    try {
                        int productId = Integer.parseInt(q);
                        bool.should(should -> should.term(term -> term.field("id").value(FieldValue.of(productId))));
                    } catch (NumberFormatException ignored) {
                        // The remaining text fields still provide useful matches for very large numbers.
                    }
                }
                bool.minimumShouldMatch("1");
            }
            applyStoreFilter(bool, storeId, storeCode);
            applyRoutableFilter(bool, routable);
            return bool;
        }));
    }

    private Comparator<Product> productComparator(String sort) {
        if ("id".equals(sort)) {
            return Comparator.comparing(Product::getId, Comparator.nullsLast(Integer::compareTo));
        }
        Collator collator = Collator.getInstance(Locale.GERMAN);
        collator.setStrength(Collator.PRIMARY);
        collator.setDecomposition(Collator.CANONICAL_DECOMPOSITION);
        return (left, right) -> {
            String leftValue = "name".equals(sort) ? left.getName() : left.getLayoutCode();
            String rightValue = "name".equals(sort) ? right.getName() : right.getLayoutCode();
            if (leftValue == null || rightValue == null) {
                if (leftValue != rightValue) return leftValue == null ? 1 : -1;
            } else {
                int compared = compareGermanNatural(leftValue, rightValue, collator);
                if (compared != 0) return compared;
            }
            return Comparator.nullsLast(Integer::compareTo).compare(left.getId(), right.getId());
        };
    }

    private int compareGermanNatural(String left, String right, Collator collator) {
        int leftIndex = 0;
        int rightIndex = 0;
        while (leftIndex < left.length() && rightIndex < right.length()) {
            boolean leftDigit = isNumericDigit(left.charAt(leftIndex));
            boolean rightDigit = isNumericDigit(right.charAt(rightIndex));
            if (leftDigit && rightDigit) {
                int leftEnd = digitRunEnd(left, leftIndex);
                int rightEnd = digitRunEnd(right, rightIndex);
                int compared = compareDigitRuns(left, leftIndex, leftEnd, right, rightIndex, rightEnd);
                if (compared != 0) return compared;
                leftIndex = leftEnd;
                rightIndex = rightEnd;
                continue;
            }
            if (leftDigit != rightDigit) {
                return collator.compare(left.substring(leftIndex, leftIndex + 1), right.substring(rightIndex, rightIndex + 1));
            }
            int leftEnd = textRunEnd(left, leftIndex);
            int rightEnd = textRunEnd(right, rightIndex);
            int compared = collator.compare(left.substring(leftIndex, leftEnd), right.substring(rightIndex, rightEnd));
            if (compared != 0) return compared;
            leftIndex = leftEnd;
            rightIndex = rightEnd;
        }
        return Integer.compare(left.length() - leftIndex, right.length() - rightIndex);
    }

    private boolean isNumericDigit(char value) { return Character.digit(value, 10) >= 0; }
    private int compareDigitRuns(String left, int leftStart, int leftEnd, String right, int rightStart, int rightEnd) {
        while (leftStart < leftEnd - 1 && Character.digit(left.charAt(leftStart), 10) == 0) leftStart++;
        while (rightStart < rightEnd - 1 && Character.digit(right.charAt(rightStart), 10) == 0) rightStart++;
        int leftLength = leftEnd - leftStart;
        int rightLength = rightEnd - rightStart;
        if (leftLength != rightLength) return Integer.compare(leftLength, rightLength);
        for (int offset = 0; offset < leftLength; offset++) {
            int compared = Integer.compare(Character.digit(left.charAt(leftStart + offset), 10),
                    Character.digit(right.charAt(rightStart + offset), 10));
            if (compared != 0) return compared;
        }
        return 0;
    }
    private int digitRunEnd(String value, int start) {
        int end = start;
        while (end < value.length() && isNumericDigit(value.charAt(end))) end++;
        return end;
    }
    private int textRunEnd(String value, int start) {
        int end = start;
        while (end < value.length() && !isNumericDigit(value.charAt(end))) end++;
        return end;
    }

    private void applyRoutableFilter(BoolQuery.Builder bool,
                                     Boolean routable) {
        if (routable == null) return;
        var validLayout = org.opensearch.client.opensearch._types.query_dsl.Query.of(query -> query.script(script -> script
                .script(inline -> inline.inline(value -> value.lang("painless").source(ROUTABLE_LAYOUT_SCRIPT)))));
        if (routable) bool.filter(validLayout);
        else bool.mustNot(validLayout);
    }

    public List<Product> findUpsellCandidates(Integer size, String storeId, String storeCode) throws IOException {
        return findUpsellCandidates(size, storeId, storeCode, List.of(), List.of());
    }

    /**
     * Upsell-Kandidaten eines Marktes, relevanzsortiert. Produkte, deren layoutCode zu einer Trigger-Kategorie passt
     * (`<kat>/...` oder genau `<kat>`), zaehlen mit Boost 3.0, Komplementaer-Kategorien mit 2.0. Der Basis-Treffer
     * `match_all` (0.1) laesst Produkte ohne Kategorie-Treffer weiter zu. Sortierung: _score absteigend, dann id aufsteigend.
     */
    public List<Product> findUpsellCandidates(Integer size, String storeId, String storeCode,
                                              Collection<String> triggerCategories,
                                              Collection<String> complementaryCategories) throws IOException {
        final Integer finalSize = (size == null) ? 50 : Math.min(Math.max(size, 1), 200);
        final String normalizedStoreId = normalizeOptionalFilter(storeId);
        final String normalizedStoreCode = normalizeOptionalFilter(storeCode);

        SearchRequest searchRequest = upsellCandidateRequest(finalSize, triggerCategories, complementaryCategories,
                b -> applyStoreFilter(b, normalizedStoreId, normalizedStoreCode));

        return searchUpsellCandidates(searchRequest);
    }

    /** Upsell-Fallback: nur Produkte ohne Markt (Altbestand), niemals Produkte anderer Maerkte. */
    public List<Product> findUnscopedUpsellCandidates(Integer size) throws IOException {
        return findUnscopedUpsellCandidates(size, List.of(), List.of());
    }

    /** Wie {@link #findUpsellCandidates(Integer, String, String, Collection, Collection)}, aber nur Produkte ohne Markt. */
    public List<Product> findUnscopedUpsellCandidates(Integer size,
                                                      Collection<String> triggerCategories,
                                                      Collection<String> complementaryCategories) throws IOException {
        final Integer finalSize = (size == null) ? 50 : Math.min(Math.max(size, 1), 200);

        SearchRequest searchRequest = upsellCandidateRequest(finalSize, triggerCategories, complementaryCategories, b -> {
            b.mustNot(mn -> mn.exists(e -> e.field("storeCode")));
            b.mustNot(mn -> mn.exists(e -> e.field("storeId")));
        });

        return searchUpsellCandidates(searchRequest);
    }

    private SearchRequest upsellCandidateRequest(Integer size,
                                                 Collection<String> triggerCategories,
                                                 Collection<String> complementaryCategories,
                                                 Consumer<BoolQuery.Builder> scope) {
        List<String> triggers = normalizeCategories(triggerCategories);
        List<String> complements = normalizeCategories(complementaryCategories).stream()
                .filter(category -> !triggers.contains(category))
                .toList();

        return SearchRequest.of(s -> s
                .index(indexName)
                .query(q -> q.bool(b -> {
                    scope.accept(b);
                    b.should(should -> should.matchAll(ma -> ma.boost(UPSELL_BASE_BOOST)));
                    triggers.forEach(category -> addCategoryShoulds(b, category, UPSELL_TRIGGER_BOOST));
                    complements.forEach(category -> addCategoryShoulds(b, category, UPSELL_COMPLEMENT_BOOST));
                    b.minimumShouldMatch("1");
                    return b;
                }))
                .sort(sort -> sort.score(score -> score.order(SortOrder.Desc)))
                .sort(sort -> sort.field(field -> field.field("id")
                        .order(SortOrder.Asc)
                        .unmappedType(FieldType.Integer)))
                .size(size)
        );
    }

    private void addCategoryShoulds(BoolQuery.Builder bool, String category, float boost) {
        // layoutCode ist ein keyword: "430/12/3/4" beginnt mit "430/", ein reiner Kategoriewert "430" steht allein.
        bool.should(should -> should.prefix(prefix -> prefix.field("layoutCode").value(category + "/").boost(boost)));
        bool.should(should -> should.term(term -> term.field("layoutCode").value(v -> v.stringValue(category)).boost(boost)));
    }

    private List<String> normalizeCategories(Collection<String> categories) {
        if (categories == null) {
            return List.of();
        }
        return categories.stream()
                .map(this::normalizeOptionalFilter)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
    }

    private List<Product> searchUpsellCandidates(SearchRequest searchRequest) throws IOException {
        SearchResponse<Product> response = client.search(searchRequest, Product.class);

        return response.hits().hits().stream()
                .map(Hit::source)
                .filter(p -> p != null)
                .collect(Collectors.toList());
    }

    /**
     * Zaehlt Altdokumente ohne storeCode (Doc-ID `<productId>`). Solange welche existieren, sperrt
     * {@link LegacyDocumentGuard} store-scoped Admin-Schreibzugriffe, sonst entstehen Doppelte neben `<storeCode>:<id>`.
     * Gleiche Abfrage wie LEGACY_QUERY in scripts/ops/migrate_products_to_store.py.
     */
    public long countLegacyProducts() throws IOException {
        CountResponse response = client.count(c -> c
                .index(indexName)
                .query(q -> q.bool(b -> b.mustNot(mn -> mn.exists(e -> e.field("storeCode")))))
        );
        return response.count();
    }

    /**
     * Dokument-ID: `<storeCode>:<productId>` fuer Produkte mit Markt, sonst `<productId>` (Altbestand).
     * Gleiche Produkt-IDs in zwei Maerkten kollidieren dadurch nicht.
     */
    public static String documentId(Product product) {
        return documentId(product.getStoreCode(), product.getId());
    }

    public static String documentId(String storeCode, Integer id) {
        String code = storeCode == null ? "" : storeCode.trim();
        return code.isEmpty() ? String.valueOf(id) : code + ":" + id;
    }

    /**
     * Indexiert ein einzelnes Produkt. {@code refresh=wait_for}: Die Antwort kommt erst, wenn das Produkt suchbar ist,
     * damit die Admin-Liste direkt nach dem Speichern neu geladen werden kann und das Produkt enthaelt.
     */
    public String indexProduct(Product product) throws IOException {
        IndexRequest<Product> request = IndexRequest.of(i -> i
                .index(indexName)
                .id(documentId(product))
                .document(product)
                .refresh(Refresh.WaitFor)
        );

        IndexResponse response = client.index(request);
        LOG.info("Indexed product: " + product.getName() + " with result: " + response.result());

        return response.result().toString();
    }

    /**
     * Loescht ein einzelnes Produkt eines Marktes (Dokument-ID `<storeCode>:<id>`). Wie {@link #indexProduct}
     * mit {@code refresh=wait_for}, damit das Produkt nach dem Loeschen sofort aus der Liste verschwindet.
     */
    public boolean deleteProduct(Integer id, String storeCode) throws IOException {
        DeleteRequest request = DeleteRequest.of(d -> d
                .index(indexName)
                .id(documentId(storeCode, id))
                .refresh(Refresh.WaitFor)
        );

        DeleteResponse response = client.delete(request);
        boolean deleted = response.result() == Result.Deleted;

        if (deleted) {
            LOG.info("Deleted product with id: " + id + " store: " + storeCode);
        } else {
            LOG.info("Product with id " + id + " was not deleted. Result: " + response.result());
        }

        return deleted;
    }

    /**
     * Indexiert mehrere Produkte in einem Bulk-Request
     */
    public CatalogBulkResult indexProducts(List<Product> products) throws IOException {
        BulkRequest.Builder bulkBuilder = new BulkRequest.Builder().refresh(Refresh.WaitFor);
        List<String> productIds = new ArrayList<>(products.size());
        List<String> docIds = new ArrayList<>(products.size());

        for (Product product : products) {
            String docId = documentId(product);
            productIds.add(String.valueOf(product.getId()));
            docIds.add(docId);
            bulkBuilder.operations(op -> op
                    .index(idx -> idx
                            .index(indexName)
                            .id(docId)
                            .document(product)
                    )
            );
        }

        BulkResponse response = client.bulk(bulkBuilder.build());
        return CatalogBulkResult.fromResponse(productIds, docIds, response);
    }

    /**
     * Erstellt den Index mit der Definition aus {@link ProductIndexDefinition} (deutsche Analyse, Synonyme, Mapping).
     */
    public void createIndex() throws IOException {
        if (client.indices().exists(ExistsRequest.of(e -> e.index(indexName))).value()) {
            throw new WebApplicationException("Produktindex existiert bereits.", Response.Status.CONFLICT);
        }
        client.indices().create(ProductIndexDefinition.createIndexRequest(indexName));
        forgetNameSubfieldSupport();
        LOG.info("Index " + indexName + " created successfully");
    }

    /**
     * Löscht den Index
     */
    public void deleteIndex() throws IOException {
        if (!client.indices().exists(ExistsRequest.of(e -> e.index(indexName))).value()) {
            throw new WebApplicationException("Produktindex existiert nicht.", Response.Status.NOT_FOUND);
        }
        client.indices().delete(d -> d.index(indexName));
        forgetNameSubfieldSupport();
        LOG.info("Index " + indexName + " deleted successfully");
    }

    /**
     * Kopiert alle Produkte aus dem Quellindex ({@code opensearch.index}, Index oder Alias) in den naechsten freien
     * Versionsindex {@code <prefix><N+1>} und vergleicht die Dokumentzahlen. Loescht nichts: Quelle, vorhandene
     * Versionen und Alias bleiben unveraendert. Bei Abweichung wird nur gemeldet (500), das Ziel bleibt liegen.
     */
    public ReindexResult reindexProducts() throws IOException {
        long sourceCount = countDocuments(indexName, "Quellindex " + indexName + " existiert nicht.");
        String target = nextVersionName(versionedIndices().keySet());
        if (client.indices().exists(ExistsRequest.of(e -> e.index(target))).value()) {
            throw new WebApplicationException("Zielindex " + target + " existiert bereits. Bitte erneut versuchen.",
                    Response.Status.CONFLICT);
        }
        try {
            client.indices().create(ProductIndexDefinition.createIndexRequest(target));
        } catch (OpenSearchException e) {
            if (e.error() != null && "resource_already_exists_exception".equals(e.error().type())) {
                throw new WebApplicationException("Zielindex " + target + " existiert bereits. Bitte erneut versuchen.",
                        Response.Status.CONFLICT);
            }
            throw e;
        }

        ReindexResponse reindex = client.reindex(ReindexRequest.of(r -> r
                .source(s -> s.index(indexName))
                .dest(d -> d.index(target))
                .waitForCompletion(true)
                .refresh(true)));
        long targetCount = countDocuments(target, "Zielindex " + target + " existiert nicht.");

        int failures = reindex.failures() == null ? 0 : reindex.failures().size();
        boolean timedOut = Boolean.TRUE.equals(reindex.timedOut());
        if (sourceCount != targetCount || failures > 0 || timedOut) {
            LOG.error("Reindex " + indexName + " -> " + target + " unvollstaendig: source=" + sourceCount
                    + " target=" + targetCount + " failures=" + failures + " timedOut=" + timedOut);
            throw new WebApplicationException(String.format(Locale.ROOT,
                    "Reindex unvollständig: Quelle %s hat %d Dokumente, Ziel %s hat %d (Fehler: %d%s). "
                            + "Das Ziel wurde nicht gelöscht, der Alias ist unverändert.",
                    indexName, sourceCount, target, targetCount, failures, timedOut ? ", Zeitüberschreitung" : ""),
                    Response.Status.INTERNAL_SERVER_ERROR);
        }
        LOG.info("Reindex " + indexName + " -> " + target + " ok: " + targetCount + " Dokumente");
        return new ReindexResult(indexName, target, sourceCount, targetCount, "OK");
    }

    /**
     * Schaltet den Alias {@code opensearch.alias} auf den Versionsindex {@code targetIndex} um. Alle Entfernungen
     * und das Hinzufuegen laufen in EINEM atomaren {@code _aliases}-Request. Loescht keinen Index.
     *
     * <p>Vorher werden die Dokumentzahlen von Ziel und Quelle ({@code opensearch.index}, der Index, den das Backend
     * heute liest) nach einem Refresh verglichen. Weichen sie ab, sind zwischen Reindex und Umschaltung Schreibvorgaenge
     * passiert, die im Ziel fehlen. Dann antwortet die Methode mit 409 und schaltet nicht um. Mit {@code force=true}
     * wird trotzdem umgeschaltet.
     */
    public ActivateResult activateIndex(String targetIndex, boolean force) throws IOException {
        if (targetIndex == null || !versionPattern().matcher(targetIndex).matches()) {
            throw new WebApplicationException("Ungültiger Indexname \"" + targetIndex + "\": erwartet "
                    + indexPrefix + "<Nummer>.", Response.Status.BAD_REQUEST);
        }
        Map<String, IndexState> versions = versionedIndices();
        if (!versions.containsKey(targetIndex)) {
            throw new WebApplicationException("Index " + targetIndex + " existiert nicht.", Response.Status.NOT_FOUND);
        }

        long targetCount = refreshAndCount(targetIndex, "Zielindex " + targetIndex + " existiert nicht.");
        long sourceCount = refreshAndCount(indexName, "Quellindex " + indexName + " existiert nicht.");
        if (sourceCount != targetCount) {
            String message = String.format(Locale.ROOT,
                    "Dokumentzahlen weichen ab: Quelle %s hat %d Dokumente, Ziel %s hat %d. "
                            + "writes happened between reindex and activate; re-run reindex "
                            + "(oder force=true, um trotzdem umzuschalten). Alias unverändert.",
                    indexName, sourceCount, targetIndex, targetCount);
            if (!force) {
                throw new WebApplicationException(message, Response.Status.CONFLICT);
            }
            LOG.warn("Alias-Umschaltung auf " + targetIndex + " mit force=true trotz Abweichung: " + message);
        }

        List<String> previous = versions.entrySet().stream()
                .filter(e -> e.getValue() != null && e.getValue().aliases() != null
                        && e.getValue().aliases().containsKey(aliasName))
                .map(Map.Entry::getKey)
                .sorted()
                .toList();

        List<Action> actions = new ArrayList<>();
        for (String old : previous) {
            actions.add(Action.of(a -> a.remove(r -> r.index(old).alias(aliasName))));
        }
        actions.add(Action.of(a -> a.add(add -> add.index(targetIndex).alias(aliasName).isWriteIndex(true))));
        client.indices().updateAliases(UpdateAliasesRequest.of(u -> u.actions(actions)));
        forgetNameSubfieldSupport();

        LOG.info("Alias " + aliasName + " umgeschaltet: " + previous + " -> " + targetIndex);
        return new ActivateResult(aliasName, targetIndex, previous);
    }

    /**
     * Liest den Zustand der Suchindizes (nur lesend): Versionsindizes mit Dokumentzahl, Alias-Ziel und Quellindex.
     * Eine Zahl, die nicht gezaehlt werden kann, bleibt null und wird nicht geschaetzt.
     */
    public IndexOverview describeIndices() throws IOException {
        Map<String, IndexState> versions = versionedIndices();
        List<IndexVersion> list = new ArrayList<>();
        List<String> active = new ArrayList<>();
        versions.entrySet().stream()
                .sorted(Comparator.comparingLong(e -> versionNumber(e.getKey())))
                .forEach(entry -> {
                    boolean carriesAlias = entry.getValue() != null && entry.getValue().aliases() != null
                            && entry.getValue().aliases().containsKey(aliasName);
                    if (carriesAlias) {
                        active.add(entry.getKey());
                    }
                    list.add(new IndexVersion(entry.getKey(), countOrNull(entry.getKey()), carriesAlias));
                });
        return new IndexOverview(aliasName, indexName, countOrNull(indexName), List.copyOf(active), List.copyOf(list));
    }

    private Long countOrNull(String index) {
        try {
            return client.count(CountRequest.of(c -> c.index(index))).count();
        } catch (IOException | RuntimeException e) {
            LOG.warn("Dokumentzahl von " + index + " nicht lesbar: " + e.getMessage());
            return null;
        }
    }

    private long versionNumber(String name) {
        try {
            return Long.parseLong(name.substring(indexPrefix.length()));
        } catch (NumberFormatException | IndexOutOfBoundsException e) {
            return Long.MAX_VALUE;
        }
    }

    /** Pattern fuer Versionsnamen {@code <prefix><Zahl>}, z. B. products_v12. */
    Pattern versionPattern() {
        return Pattern.compile(Pattern.quote(indexPrefix) + "\\d+");
    }

    /**
     * Prueft im Mapping des Suchindex ({@code opensearch.index}), ob {@code name} die Subfelder {@code prefix} und
     * {@code parts} hat. Das Ergebnis wird {@link #NAME_SUBFIELD_CACHE_NANOS} lang gecacht. Schlaegt die Abfrage fehl
     * oder liefert sie kein Mapping, wird ohne die beiden Subfeld-Klauseln gesucht und nichts gecacht.
     */
    boolean nameSubfieldsAvailable() {
        NameSubfieldSupport cached = nameSubfieldSupport;
        if (cached != null && System.nanoTime() - cached.checkedAtNanos() < NAME_SUBFIELD_CACHE_NANOS) {
            return cached.supported();
        }
        try {
            GetMappingResponse response = client.indices().getMapping(GetMappingRequest.of(g -> g.index(indexName)));
            Map<String, IndexMappingRecord> mappings = response == null ? null : response.result();
            if (mappings == null || mappings.isEmpty()) {
                LOG.warn("Mapping von " + indexName + " leer: Suche ohne name.prefix/name.parts");
                return false;
            }
            boolean supported = mappings.values().stream().anyMatch(OpenSearchService::hasNameSubfields);
            nameSubfieldSupport = new NameSubfieldSupport(supported, System.nanoTime());
            return supported;
        } catch (IOException | RuntimeException e) {
            // Nicht gecacht: die naechste Suche versucht die Abfrage erneut.
            LOG.warn("Mapping von " + indexName + " nicht lesbar, Suche ohne name.prefix/name.parts: " + e.getMessage());
            return false;
        }
    }

    private static boolean hasNameSubfields(IndexMappingRecord record) {
        TypeMapping indexMapping = record == null ? null : record.mappings();
        Property name = indexMapping == null || indexMapping.properties() == null
                ? null : indexMapping.properties().get("name");
        if (name == null || !name.isText() || name.text().fields() == null) {
            return false;
        }
        Map<String, Property> fields = name.text().fields();
        return fields.containsKey(NAME_PREFIX_SUBFIELD) && fields.containsKey(NAME_PARTS_SUBFIELD);
    }

    /** Verwirft das gecachte Mapping-Ergebnis, nach jeder Aenderung an Indizes oder Alias. */
    private void forgetNameSubfieldSupport() {
        nameSubfieldSupport = null;
    }

    /** Refresh, damit alle Schreibvorgaenge sichtbar sind, danach die Dokumentzahl. */
    private long refreshAndCount(String index, String notFoundMessage) throws IOException {
        try {
            client.indices().refresh(RefreshRequest.of(r -> r.index(index)));
        } catch (OpenSearchException e) {
            if (e.status() == 404) {
                throw new WebApplicationException(notFoundMessage, Response.Status.NOT_FOUND);
            }
            throw e;
        }
        return countDocuments(index, notFoundMessage);
    }

    /** Vorhandene Versionsindizes ({@code <prefix>*}, nur Namen im Versionsmuster) mit ihren Aliasen. */
    private Map<String, IndexState> versionedIndices() throws IOException {
        Map<String, IndexState> all;
        try {
            GetIndexResponse response = client.indices().get(GetIndexRequest.of(g -> g.index(indexPrefix + "*")));
            all = response.result();
        } catch (OpenSearchException e) {
            if (e.status() == 404) {
                return Map.of();
            }
            throw e;
        }
        Pattern pattern = versionPattern();
        Map<String, IndexState> versions = new LinkedHashMap<>();
        if (all != null) {
            all.forEach((name, state) -> {
                if (pattern.matcher(name).matches()) {
                    versions.put(name, state);
                }
            });
        }
        return versions;
    }

    /** Naechster Versionsname: höchste vorhandene Nummer + 1, ohne Treffer 1. */
    String nextVersionName(Collection<String> existing) {
        Pattern pattern = Pattern.compile(Pattern.quote(indexPrefix) + "(\\d+)");
        long max = 0;
        for (String name : existing) {
            Matcher m = pattern.matcher(name);
            if (m.matches()) {
                try {
                    max = Math.max(max, Long.parseLong(m.group(1)));
                } catch (NumberFormatException ignored) {
                    // Zu grosse Nummer: kein gueltiger Versionsname, zaehlt nicht.
                }
            }
        }
        return indexPrefix + (max + 1);
    }

    /** Dokumentzahl eines Index bzw. Alias; 404 wird mit der uebergebenen Meldung als 404 gemeldet. */
    private long countDocuments(String index, String notFoundMessage) throws IOException {
        try {
            return client.count(CountRequest.of(c -> c.index(index))).count();
        } catch (OpenSearchException e) {
            if (e.status() == 404) {
                throw new WebApplicationException(notFoundMessage, Response.Status.NOT_FOUND);
            }
            throw e;
        }
    }

    private void applyStoreFilter(BoolQuery.Builder bool, String storeId, String storeCode) {
        if (storeId != null) {
            bool.filter(filter -> filter.term(term -> term.field("storeId").value(v -> v.stringValue(storeId))));
        }
        if (storeCode != null) {
            bool.filter(filter -> filter.term(term -> term.field("storeCode").value(v -> v.stringValue(storeCode))));
        }
    }

    private String normalizeOptionalFilter(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
