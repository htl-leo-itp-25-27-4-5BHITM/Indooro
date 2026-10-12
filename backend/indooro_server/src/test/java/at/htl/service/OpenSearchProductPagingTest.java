package at.htl.service;

import at.htl.admin.dto.CommonDtos;
import at.htl.model.Product;
import org.junit.jupiter.api.Test;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.opensearch.client.opensearch.core.search.TotalHitsRelation;
import org.mockito.ArgumentCaptor;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OpenSearchProductPagingTest {

    @Test
    void appliesOffsetAndSizeAndReturnsExactOpenSearchTotal() throws Exception {
        OpenSearchClient client = mock(OpenSearchClient.class);
        OpenSearchService service = new OpenSearchService();
        service.client = client;
        service.indexName = "products";

        Product pear = new Product();
        pear.setId(7);
        pear.setName("Pear");
        Hit<Product> hit = Hit.of(builder -> builder.id("7").source(pear));
        SearchResponse<Product> response = SearchResponse.searchResponseOf(builder -> builder.took(1).timedOut(false)
                .shards(shards -> shards.total(1).successful(1).failed(0))
                .hits(hits -> hits
                .total(total -> total.value(55).relation(TotalHitsRelation.Eq))
                .hits(List.of(hit))));
        when(client.search(any(SearchRequest.class), eq(Product.class))).thenReturn(response);

        CommonDtos.PageResponse<Product> result = service.searchAdminProductsPage("pear", 2, 20);

        assertEquals(2, result.page());
        assertEquals(20, result.size());
        assertEquals(55, result.totalElements());
        assertEquals("Pear", result.content().get(0).getName());

        ArgumentCaptor<SearchRequest> request = ArgumentCaptor.forClass(SearchRequest.class);
        verify(client).search(request.capture(), eq(Product.class));
        assertEquals(40, request.getValue().from());
        assertEquals(20, request.getValue().size());
        assertTrue(request.getValue().query().isBool());
        assertTrue(request.getValue().query().bool().should().stream()
                .anyMatch(clause -> clause.isMatch() && "pear".equals(clause.match().query().stringValue())));
        assertTrue(request.getValue().trackTotalHits().enabled());
        assertEquals("id", request.getValue().sort().get(0).field().field());
    }

    @Test
    void emptyQueryUsesMatchAllForPagedCatalog() throws Exception {
        OpenSearchClient client = mock(OpenSearchClient.class);
        OpenSearchService service = new OpenSearchService();
        service.client = client;
        service.indexName = "products";
        SearchResponse<Product> response = SearchResponse.searchResponseOf(builder -> builder.took(1).timedOut(false)
                .shards(shards -> shards.total(1).successful(1).failed(0))
                .hits(hits -> hits
                .total(total -> total.value(0).relation(TotalHitsRelation.Eq))
                .hits(List.of())));
        when(client.search(any(SearchRequest.class), eq(Product.class))).thenReturn(response);

        service.searchAdminProductsPage("  ", 0, 20);

        ArgumentCaptor<SearchRequest> request = ArgumentCaptor.forClass(SearchRequest.class);
        verify(client).search(request.capture(), eq(Product.class));
        assertTrue(request.getValue().query().isMatchAll());
    }
}
