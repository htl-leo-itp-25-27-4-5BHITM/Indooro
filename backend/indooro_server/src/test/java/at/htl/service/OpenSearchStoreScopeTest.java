package at.htl.service;

import at.htl.model.Product;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.Result;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.core.BulkRequest;
import org.opensearch.client.opensearch.core.BulkResponse;
import org.opensearch.client.opensearch.core.DeleteRequest;
import org.opensearch.client.opensearch.core.DeleteResponse;
import org.opensearch.client.opensearch.core.IndexRequest;
import org.opensearch.client.opensearch.core.IndexResponse;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.opensearch.client.opensearch.core.search.TotalHitsRelation;

import java.io.IOException;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OpenSearchStoreScopeTest {

    private static final String PILOT_ID = "6f1c2a5e-0000-4000-8000-000000000001";
    private static final String PILOT_CODE = "SPAR-Leonding-001";
    private static final String DEMO_CODE = "demo-store";

    private OpenSearchClient client;
    private OpenSearchService service;

    @BeforeEach
    void setUp() {
        client = mock(OpenSearchClient.class);
        service = new OpenSearchService();
        service.client = client;
        service.indexName = "products";
    }

    @Test
    void documentIdPrefixesStoreCodeAndKeepsLegacyIdWithoutStore() {
        assertEquals("SPAR-Leonding-001:101", OpenSearchService.documentId(product(101, PILOT_ID, PILOT_CODE)));
        assertEquals("101", OpenSearchService.documentId(product(101, null, null)));
        assertEquals("101", OpenSearchService.documentId(product(101, null, "  ")));
        assertNotEquals(OpenSearchService.documentId(product(101, PILOT_ID, PILOT_CODE)),
                OpenSearchService.documentId(product(101, null, DEMO_CODE)));
    }

    @Test
    void indexUsesStoreScopedDocumentIdAndSameProductIdInTwoStoresDoesNotCollide() throws IOException {
        when(client.index(any(IndexRequest.class))).thenReturn(indexResponse());

        service.indexProduct(product(101, PILOT_ID, PILOT_CODE));
        service.indexProduct(product(101, null, DEMO_CODE));

        ArgumentCaptor<IndexRequest> captor = ArgumentCaptor.forClass(IndexRequest.class);
        verify(client, org.mockito.Mockito.times(2)).index(captor.capture());
        assertEquals("SPAR-Leonding-001:101", captor.getAllValues().get(0).id());
        assertEquals("demo-store:101", captor.getAllValues().get(1).id());
    }

    @Test
    void legacyProductWithoutStoreIndexesUnderPlainId() throws IOException {
        when(client.index(any(IndexRequest.class))).thenReturn(indexResponse());

        service.indexProduct(product(101, null, null));

        ArgumentCaptor<IndexRequest> captor = ArgumentCaptor.forClass(IndexRequest.class);
        verify(client).index(captor.capture());
        assertEquals("101", captor.getValue().id());
    }

    @Test
    void bulkWriteUsesStoreScopedDocumentIds() throws IOException {
        BulkResponse bulkResponse = BulkResponse.of(b -> b.took(1L).errors(false).items(List.of()));
        when(client.bulk(any(BulkRequest.class))).thenReturn(bulkResponse);

        service.indexProducts(List.of(product(101, PILOT_ID, PILOT_CODE), product(101, null, DEMO_CODE)));

        ArgumentCaptor<BulkRequest> captor = ArgumentCaptor.forClass(BulkRequest.class);
        verify(client).bulk(captor.capture());
        assertEquals("SPAR-Leonding-001:101", captor.getValue().operations().get(0).index().id());
        assertEquals("demo-store:101", captor.getValue().operations().get(1).index().id());
    }

    @Test
    void deleteTargetsStoreScopedDocumentId() throws IOException {
        DeleteResponse deleteResponse = DeleteResponse.of(d -> d.index("products").id("SPAR-Leonding-001:101")
                .version(2L).seqNo(1L).primaryTerm(1L).result(Result.Deleted)
                .shards(sh -> sh.total(1).successful(1).failed(0)));
        when(client.delete(any(DeleteRequest.class))).thenReturn(deleteResponse);

        assertTrue(service.deleteProduct(101, PILOT_CODE));

        ArgumentCaptor<DeleteRequest> captor = ArgumentCaptor.forClass(DeleteRequest.class);
        verify(client).delete(captor.capture());
        assertEquals("SPAR-Leonding-001:101", captor.getValue().id());
    }

    @Test
    void productLookupByIdFiltersByStoreAndDoesNotDependOnDocumentId() throws IOException {
        when(client.search(any(SearchRequest.class), org.mockito.ArgumentMatchers.eq(Product.class)))
                .thenReturn(searchResponse(List.of(Hit.of(builder -> builder.id("SPAR-Leonding-001:101")
                        .source(product(101, PILOT_ID, PILOT_CODE))))));

        Product found = service.getProductById(101, null, PILOT_CODE);

        assertEquals(PILOT_CODE, found.getStoreCode());
        ArgumentCaptor<SearchRequest> captor = ArgumentCaptor.forClass(SearchRequest.class);
        verify(client).search(captor.capture(), org.mockito.ArgumentMatchers.eq(Product.class));
        List<Query> filters = captor.getValue().query().bool().filter();
        assertTrue(filters.stream().anyMatch(clause -> clause.isTerm() && "id".equals(clause.term().field())));
        assertTrue(filters.stream().anyMatch(clause -> clause.isTerm() && "storeCode".equals(clause.term().field())));
    }

    @Test
    void searchWithStoreCodeAddsFilterAndNeverReturnsOtherStore() throws IOException {
        when(client.search(any(SearchRequest.class), org.mockito.ArgumentMatchers.eq(Product.class)))
                .thenReturn(searchResponse(List.of()));

        service.searchProducts("Backpulver", 10, null, PILOT_CODE);

        ArgumentCaptor<SearchRequest> captor = ArgumentCaptor.forClass(SearchRequest.class);
        verify(client).search(captor.capture(), org.mockito.ArgumentMatchers.eq(Product.class));
        assertTrue(captor.getValue().query().bool().filter().stream()
                .anyMatch(clause -> clause.isTerm() && "storeCode".equals(clause.term().field())
                        && PILOT_CODE.equals(clause.term().value().stringValue())));
    }

    @Test
    void adminPagingAddsStoreFilterToQuery() throws IOException {
        when(client.search(any(SearchRequest.class), org.mockito.ArgumentMatchers.eq(Product.class)))
                .thenReturn(searchResponse(List.of()));

        service.searchAdminProductsPage(null, 0, 20, "id", null, PILOT_ID, PILOT_CODE);

        ArgumentCaptor<SearchRequest> captor = ArgumentCaptor.forClass(SearchRequest.class);
        verify(client).search(captor.capture(), org.mockito.ArgumentMatchers.eq(Product.class));
        List<Query> filters = captor.getValue().query().bool().filter();
        assertTrue(filters.stream().anyMatch(clause -> clause.isTerm() && "storeId".equals(clause.term().field())));
        assertTrue(filters.stream().anyMatch(clause -> clause.isTerm() && "storeCode".equals(clause.term().field())));
    }

    @Test
    void unscopedUpsellFallbackExcludesProductsWithAnyStore() throws IOException {
        when(client.search(any(SearchRequest.class), org.mockito.ArgumentMatchers.eq(Product.class)))
                .thenReturn(searchResponse(List.of()));

        service.findUnscopedUpsellCandidates(20);

        ArgumentCaptor<SearchRequest> captor = ArgumentCaptor.forClass(SearchRequest.class);
        verify(client).search(captor.capture(), org.mockito.ArgumentMatchers.eq(Product.class));
        List<Query> excluded = captor.getValue().query().bool().mustNot();
        assertFalse(excluded.isEmpty());
        assertTrue(excluded.stream().allMatch(Query::isExists));
    }

    static Product product(int id, String storeId, String storeCode) {
        Product product = new Product(id, "Backpulver", 0.89, "310/1/1/1", storeId, storeCode);
        return product;
    }

    private static IndexResponse indexResponse() {
        return IndexResponse.of(i -> i.index("products").id("1").version(1L).seqNo(0L).primaryTerm(1L)
                .result(Result.Created).shards(sh -> sh.total(1).successful(1).failed(0)));
    }

    private static SearchResponse<Product> searchResponse(List<Hit<Product>> hits) {
        return SearchResponse.searchResponseOf(builder -> builder.took(1).timedOut(false)
                .shards(shards -> shards.total(1).successful(1).failed(0))
                .hits(hits2 -> hits2
                        .total(total -> total.value(hits.size()).relation(TotalHitsRelation.Eq))
                        .hits(hits)));
    }
}
