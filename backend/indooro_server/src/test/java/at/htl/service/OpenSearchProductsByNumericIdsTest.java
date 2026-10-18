package at.htl.service;

import at.htl.model.Product;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.mapping.FieldType;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.opensearch.client.opensearch.core.search.HitsMetadata;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class OpenSearchProductsByNumericIdsTest {

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
    void emptyOrNullInputReturnsEmptyMapWithoutRequest() throws IOException {
        assertTrue(service.getProductsByNumericIds(List.of()).isEmpty());
        assertTrue(service.getProductsByNumericIds(null).isEmpty());
        assertTrue(service.getProductsByNumericIds(java.util.Arrays.asList(null, null)).isEmpty());
        verifyNoInteractions(client);
    }

    @Test
    void severalIdsUseOneRequestWithoutStoreFilterAndDistinctTerms() throws IOException {
        Product tomato = new Product(42, "Katalog Tomaten", 1.99, "310/1", null, "SPAR-1");
        Product milk = new Product(77, "Milch", 1.29, null, null, "demo-store");
        when(client.search(any(SearchRequest.class), eq(Product.class))).thenReturn(response(tomato, milk));

        Map<Integer, Product> result = service.getProductsByNumericIds(java.util.Arrays.asList(42, null, 77, 42));

        ArgumentCaptor<SearchRequest> captor = ArgumentCaptor.forClass(SearchRequest.class);
        verify(client, times(1)).search(captor.capture(), eq(Product.class));
        SearchRequest request = captor.getValue();
        assertEquals(List.of("products"), request.index());
        assertEquals(2, request.size().intValue());
        assertTrue(request.query().isTerms());
        assertEquals("id", request.query().terms().field());
        assertEquals(List.of(42L, 77L), request.query().terms().terms().value().stream().map(FieldValue::longValue).toList());
        assertEquals("id", request.collapse().field());

        assertEquals(List.of(42, 77), List.copyOf(result.keySet()));
        assertEquals("Katalog Tomaten", result.get(42).getName());
        assertEquals("Milch", result.get(77).getName());
    }

    @Test
    void duplicateStoreDocumentsKeepOneProductDeterministicallyBySortOrder() throws IOException {
        Product first = new Product(42, "Tomaten A", 1.99, "310/1", "store-a", "A");
        Product second = new Product(42, "Tomaten B", 2.49, "310/1", "store-b", "B");
        when(client.search(any(SearchRequest.class), eq(Product.class))).thenReturn(response(first, second));

        Map<Integer, Product> result = service.getProductsByNumericIds(List.of(42));

        assertEquals(1, result.size());
        assertEquals("Tomaten A", result.get(42).getName());

        ArgumentCaptor<SearchRequest> captor = ArgumentCaptor.forClass(SearchRequest.class);
        verify(client).search(captor.capture(), eq(Product.class));
        assertEquals(1, captor.getValue().sort().size());
        assertEquals("storeCode", captor.getValue().sort().get(0).field().field());
        assertEquals(SortOrder.Asc, captor.getValue().sort().get(0).field().order());
        assertEquals(FieldType.Keyword, captor.getValue().sort().get(0).field().unmappedType());
    }

    @Test
    void productsMissingFromTheIndexAreAbsentFromTheMap() throws IOException {
        Product tomato = new Product(42, "Katalog Tomaten", 1.99, "310/1", null, "SPAR-1");
        when(client.search(any(SearchRequest.class), eq(Product.class))).thenReturn(response(tomato));

        Map<Integer, Product> result = service.getProductsByNumericIds(List.of(42, 500));

        assertEquals(1, result.size());
        assertTrue(result.containsKey(42));
        assertFalse(result.containsKey(500));
        verify(client, times(1)).search(any(SearchRequest.class), eq(Product.class));
    }

    private static SearchResponse<Product> response(Product... products) {
        List<Hit<Product>> hits = new ArrayList<>();
        for (Product product : products) {
            hits.add(Hit.of(hit -> hit.index("products").id(product.getId() + "-" + product.getName()).source(product)));
        }
        HitsMetadata<Product> hitsMetadata = HitsMetadata.of(metadata -> metadata.hits(hits));
        return new SearchResponse.Builder<Product>()
                .took(1)
                .timedOut(false)
                .shards(shards -> shards.total(1).successful(1).skipped(0).failed(0))
                .hits(hitsMetadata)
                .build();
    }
}
