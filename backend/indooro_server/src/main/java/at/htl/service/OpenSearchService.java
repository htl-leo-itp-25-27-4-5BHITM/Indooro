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
import org.opensearch.client.opensearch._types.query_dsl.Operator;
import org.opensearch.client.opensearch.core.*;
import org.opensearch.client.opensearch.core.search.Hit;

import java.io.IOException;
import java.util.List;
import java.util.stream.Collectors;

@ApplicationScoped
public class OpenSearchService {

    private static final Logger LOG = Logger.getLogger(OpenSearchService.class);

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
     * Holt ein Produkt anhand der ID
     */
    public Product getProductById(Integer id) throws IOException {
        GetRequest getRequest = GetRequest.of(g -> g
                .index(indexName)
                .id(String.valueOf(id))
        );

        GetResponse<Product> response = client.get(getRequest, Product.class);

        if (response.found()) {
            return response.source();
        }
        return null;
    }

    /**
     * Holt alle Produkte
     */
    public List<Product> getAllProducts(Integer size) throws IOException {
        final Integer finalSize = (size == null) ? 100 : size;

        SearchRequest searchRequest = SearchRequest.of(s -> s
                .index(indexName)
                .query(q -> q.matchAll(m -> m))
                .size(finalSize)
        );

        SearchResponse<Product> response = client.search(searchRequest, Product.class);

        return response.hits().hits().stream()
                .map(Hit::source)
                .collect(Collectors.toList());
    }

    /** Searches and pages the admin catalog while retaining OpenSearch's exact hit count. */
    public CommonDtos.PageResponse<Product> searchAdminProductsPage(String query, int page, int size) throws IOException {
        String q = query == null ? "" : query.trim();
        long offset = (long) Math.max(page, 0) * Math.max(size, 1);
        int from = (int) Math.min(offset, Integer.MAX_VALUE);

        SearchRequest searchRequest = SearchRequest.of(s -> s
                .index(indexName)
                .from(from)
                .size(size)
                .trackTotalHits(track -> track.enabled(true))
                .sort(sort -> sort.field(field -> field.field("id")))
                .query(q.isEmpty()
                        ? qry -> qry.matchAll(matchAll -> matchAll)
                        : qry -> qry.bool(bool -> {
                            bool.should(should -> should.term(term -> term
                                    .field("name.keyword")
                                    .value(value -> value.stringValue(q))
                                    .boost(10f)));
                            bool.should(should -> should.match(match -> match
                                    .field("name")
                                    .query(FieldValue.of(q))
                                    .operator(Operator.And)));
                            bool.should(should -> should.term(term -> term
                                    .field("layoutCode")
                                    .value(value -> value.stringValue(q))));
                            bool.should(should -> should.term(term -> term
                                    .field("storeCode")
                                    .value(value -> value.stringValue(q))));
                            if (q.matches("\\d+")) {
                                try {
                                    int productId = Integer.parseInt(q);
                                    bool.should(should -> should.term(term -> term
                                            .field("id")
                                            .value(FieldValue.of(productId))));
                                } catch (NumberFormatException ignored) {
                                    // The remaining text fields still provide useful matches for very large numbers.
                                }
                            }
                            return bool.minimumShouldMatch("1");
                        }))
        );

        SearchResponse<Product> response = client.search(searchRequest, Product.class);
        List<Product> products = response.hits().hits().stream()
                .map(Hit::source)
                .filter(product -> product != null)
                .collect(Collectors.toList());
        long total = response.hits().total() == null ? products.size() : response.hits().total().value();
        return new CommonDtos.PageResponse<>(products, page, size, total);
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

    /**
     * Indexiert ein einzelnes Produkt
     */
    public String indexProduct(Product product) throws IOException {
        IndexRequest<Product> request = IndexRequest.of(i -> i
                .index(indexName)
                .id(String.valueOf(product.getId()))
                .document(product)
        );

        IndexResponse response = client.index(request);
        LOG.info("Indexed product: " + product.getName() + " with result: " + response.result());

        return response.result().toString();
    }

    /**
     * Loescht ein einzelnes Produkt anhand der ID.
     */
    public boolean deleteProduct(Integer id) throws IOException {
        DeleteRequest request = DeleteRequest.of(d -> d
                .index(indexName)
                .id(String.valueOf(id))
        );

        DeleteResponse response = client.delete(request);
        boolean deleted = response.result() == Result.Deleted;

        if (deleted) {
            LOG.info("Deleted product with id: " + id);
        } else {
            LOG.info("Product with id " + id + " was not deleted. Result: " + response.result());
        }

        return deleted;
    }

    /**
     * Indexiert mehrere Produkte in einem Bulk-Request
     */
    public void indexProducts(List<Product> products) throws IOException {
        BulkRequest.Builder bulkBuilder = new BulkRequest.Builder();

        for (Product product : products) {
            bulkBuilder.operations(op -> op
                    .index(idx -> idx
                            .index(indexName)
                            .id(String.valueOf(product.getId()))
                            .document(product)
                    )
            );
        }

        BulkResponse response = client.bulk(bulkBuilder.build());

        if (response.errors()) {
            LOG.error("Bulk indexing had errors");
            response.items().forEach(item -> {
                if (item.error() != null) {
                    LOG.error("Error: " + item.error().reason());
                }
            });
        } else {
            LOG.info("Successfully indexed " + products.size() + " products");
        }
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

    private String normalizeOptionalFilter(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
