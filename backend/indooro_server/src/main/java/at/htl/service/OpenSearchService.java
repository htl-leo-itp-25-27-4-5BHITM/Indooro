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
import org.opensearch.client.opensearch._types.Result;
import org.opensearch.client.opensearch._types.Refresh;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.query_dsl.BoolQuery;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch._types.query_dsl.Operator;
import org.opensearch.client.opensearch.core.*;
import org.opensearch.client.opensearch.core.search.Hit;

import java.io.IOException;
import java.text.Collator;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Locale;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

@ApplicationScoped
public class OpenSearchService {

    private static final Logger LOG = Logger.getLogger(OpenSearchService.class);
    private static final String ROUTABLE_LAYOUT_SCRIPT = "doc['layoutCode'].size() != 0 && /[0-9]{1,4}\\/[0-9]{1,3}\\/[0-9]{1,2}\\/[0-9]{1,2}/.matcher(doc['layoutCode'].value.trim()).matches()";

    @Inject
    OpenSearchClient client;

    @ConfigProperty(name = "opensearch.index")
    String indexName;

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

        SearchRequest searchRequest = SearchRequest.of(s -> s
                .index(indexName)
                .size(finalSize)
                .query(qry -> qry.bool(b -> {
                    b
                            // 1) Exakter Name (z.B. "Nutella") => maximaler Boost
                            .should(sh -> sh.term(t -> t
                                    .field("name.keyword")
                                    .value(v -> v.stringValue(q))
                                    .boost(10f)
                            ))
                            // 2) Phrase Match (z.B. "Milch 1L") => sehr wichtig
                            .should(sh -> sh.matchPhrase(mp -> mp
                                    .field("name")
                                    .query(q)
                                    .boost(4f)
                            ))
                            // 3) Fuzzy Match für Tippfehler ("Nutela", "Milsch")
                            .should(sh -> sh.match(m -> m
                                    .field("name")
                                    .query(FieldValue.of(q))
                                    .fuzziness("AUTO")
                                    .prefixLength(1)      // lässt 1. Buchstaben stabil, hilft gegen Chaos
                                    .maxExpansions(50)    // mehr Kandidaten bei Tippfehlern
                                    .operator(Operator.And)
                                    .boost(2f)
                            ))
                            // 4) layoutCode exakt (falls jemand danach sucht)
                            .should(sh -> sh.term(t -> t
                                    .field("layoutCode")
                                    .value(v -> v.stringValue(q))
                                    .boost(6f)
                            ))
                            .minimumShouldMatch("1");

                    if (normalizedStoreId != null) {
                        b.filter(filter -> filter.term(term -> term
                                .field("storeId")
                                .value(v -> v.stringValue(normalizedStoreId))
                        ));
                    }
                    if (normalizedStoreCode != null) {
                        b.filter(filter -> filter.term(term -> term
                                .field("storeCode")
                                .value(v -> v.stringValue(normalizedStoreCode))
                        ));
                    }

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
        final Integer finalSize = (size == null) ? 50 : Math.min(Math.max(size, 1), 200);
        final String normalizedStoreId = normalizeOptionalFilter(storeId);
        final String normalizedStoreCode = normalizeOptionalFilter(storeCode);

        SearchRequest searchRequest = SearchRequest.of(s -> s
                .index(indexName)
                .query(q -> q.bool(b -> {
                    b.must(m -> m.matchAll(ma -> ma));

                    if (normalizedStoreId != null) {
                        b.filter(filter -> filter.term(term -> term
                                .field("storeId")
                                .value(v -> v.stringValue(normalizedStoreId))
                        ));
                    }
                    if (normalizedStoreCode != null) {
                        b.filter(filter -> filter.term(term -> term
                                .field("storeCode")
                                .value(v -> v.stringValue(normalizedStoreCode))
                        ));
                    }

                    return b;
                }))
                .size(finalSize)
        );

        SearchResponse<Product> response = client.search(searchRequest, Product.class);

        return response.hits().hits().stream()
                .map(Hit::source)
                .filter(p -> p != null)
                .collect(Collectors.toList());
    }

    /** Upsell-Fallback: nur Produkte ohne Markt (Altbestand), niemals Produkte anderer Maerkte. */
    public List<Product> findUnscopedUpsellCandidates(Integer size) throws IOException {
        final Integer finalSize = (size == null) ? 50 : Math.min(Math.max(size, 1), 200);

        SearchRequest searchRequest = SearchRequest.of(s -> s
                .index(indexName)
                .query(q -> q.bool(b -> {
                    b.must(m -> m.matchAll(ma -> ma));
                    b.mustNot(mn -> mn.exists(e -> e.field("storeCode")));
                    b.mustNot(mn -> mn.exists(e -> e.field("storeId")));
                    return b;
                }))
                .size(finalSize)
        );

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
     * Indexiert ein einzelnes Produkt
     */
    public String indexProduct(Product product) throws IOException {
        IndexRequest<Product> request = IndexRequest.of(i -> i
                .index(indexName)
                .id(documentId(product))
                .document(product)
        );

        IndexResponse response = client.index(request);
        LOG.info("Indexed product: " + product.getName() + " with result: " + response.result());

        return response.result().toString();
    }

    /**
     * Loescht ein einzelnes Produkt eines Marktes (Dokument-ID `<storeCode>:<id>`).
     */
    public boolean deleteProduct(Integer id, String storeCode) throws IOException {
        DeleteRequest request = DeleteRequest.of(d -> d
                .index(indexName)
                .id(documentId(storeCode, id))
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
     * Erstellt den Index mit Mapping
     */
    public void createIndex() throws IOException {
        if (client.indices().exists(e -> e.index(indexName)).value()) {
            throw new WebApplicationException("Produktindex existiert bereits.", Response.Status.CONFLICT);
        }
        client.indices().create(c -> c
                    .index(indexName)
                    .mappings(m -> m
                            .properties("id", p -> p.integer(i -> i))
                            .properties("name", p -> p.text(t -> t
                                    .analyzer("standard")
                                    .fields("keyword", f -> f.keyword(k -> k.ignoreAbove(256)))
                            ))
                            .properties("price", p -> p.double_(d -> d))
                            .properties("layoutCode", p -> p.keyword(k -> k))
                            .properties("storeId", p -> p.keyword(k -> k))
                            .properties("storeCode", p -> p.keyword(k -> k))
                    )
            );
        LOG.info("Index " + indexName + " created successfully");
    }

    /**
     * Löscht den Index
     */
    public void deleteIndex() throws IOException {
        client.indices().delete(d -> d.index(indexName));
        LOG.info("Index " + indexName + " deleted successfully");
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
