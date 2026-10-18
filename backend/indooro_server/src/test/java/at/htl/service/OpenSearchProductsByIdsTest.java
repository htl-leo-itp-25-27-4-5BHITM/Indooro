package at.htl.service;

import at.htl.model.Product;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.FieldValue;
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
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class OpenSearchProductsByIdsTest {

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
    void emptyInputReturnsEmptyMapWithoutRequest() throws IOException {
        assertTrue(service.getProductsByIds(List.of()).isEmpty());
        assertTrue(service.getProductsByIds(null).isEmpty());
        verifyNoInteractions(client);
    }

    @Test
    void unparseableIdsAreDroppedWithoutRequest() throws IOException {
        assertTrue(service.getProductsByIds(List.of("abc", " ", "99999999999999")).isEmpty());
        verifyNoInteractions(client);
    }

    @Test
    void severalIdsUseOneRequestWithDistinctTermsAndOneHitPerProduct() throws IOException {
        Product tomato = new Product(42, "Katalog Tomaten", 1.99, "310/1", null, "SPAR-1");
        Product milk = new Product(77, "Milch", 1.29, null, null, "demo-store");
        SearchResponse<Product> response = response(tomato, milk);
        when(client.search(any(SearchRequest.class), eq(Product.class))).thenReturn(response);

        Map<String, Product> result = service.getProductsByIds(List.of("42", "77", "42"));

        ArgumentCaptor<SearchRequest> captor = ArgumentCaptor.forClass(SearchRequest.class);
        verify(client, times(1)).search(captor.capture(), eq(Product.class));
        SearchRequest request = captor.getValue();
        assertEquals(List.of("products"), request.index());
        assertEquals(2, request.size().intValue());
        assertEquals("id", request.collapse().field());
        assertEquals("id", request.query().terms().field());
        assertEquals(List.of(42L, 77L), request.query().terms().terms().value().stream().map(FieldValue::longValue).toList());

        assertEquals(List.of("42", "77"), List.copyOf(result.keySet()));
        assertEquals("Katalog Tomaten", result.get("42").getName());
        assertEquals("Milch", result.get("77").getName());
    }

    @Test
    void productsMissingFromTheIndexAreAbsentFromTheMap() throws IOException {
        Product tomato = new Product(42, "Katalog Tomaten", 1.99, "310/1", null, "SPAR-1");
        SearchResponse<Product> response = response(tomato);
        when(client.search(any(SearchRequest.class), eq(Product.class))).thenReturn(response);

        Map<String, Product> result = service.getProductsByIds(List.of("42", "500"));

        assertEquals(1, result.size());
        assertTrue(result.containsKey("42"));
        assertFalse(result.containsKey("500"));
        assertNull(result.get("500"));
        verify(client, times(1)).search(any(SearchRequest.class), eq(Product.class));
    }

    private static SearchResponse<Product> response(Product... products) {
        List<Hit<Product>> hits = new ArrayList<>();
        for (Product product : products) {
            hits.add(Hit.of(hit -> hit.index("products").id(String.valueOf(product.getId())).source(product)));
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
