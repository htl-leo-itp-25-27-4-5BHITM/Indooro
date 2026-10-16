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
import java.util.ArrayList;

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

        CommonDtos.PageResponse<Product> result = service.searchAdminProductsPage("pear", 0, 20);

        assertEquals(0, result.page());
        assertEquals(20, result.size());
        assertEquals(55, result.totalElements());
        assertEquals("Pear", result.content().get(0).getName());

        ArgumentCaptor<SearchRequest> request = ArgumentCaptor.forClass(SearchRequest.class);
        verify(client).search(request.capture(), eq(Product.class));
        assertEquals(500, request.getValue().size());
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

    @Test
    void appliesRoutableFilterAndSortBeforePaging() throws Exception {
        OpenSearchClient client = mock(OpenSearchClient.class);
        OpenSearchService service = new OpenSearchService();
        service.client = client;
        service.indexName = "products";
        SearchResponse<Product> response = SearchResponse.searchResponseOf(builder -> builder.took(1).timedOut(false)
                .shards(shards -> shards.total(1).successful(1).failed(0))
                .hits(hits -> hits.total(total -> total.value(0).relation(TotalHitsRelation.Eq)).hits(List.of())));
        when(client.search(any(SearchRequest.class), eq(Product.class))).thenReturn(response);

        service.searchAdminProductsPage(null, 2, 25, "name", true);

        ArgumentCaptor<SearchRequest> request = ArgumentCaptor.forClass(SearchRequest.class);
        verify(client).search(request.capture(), eq(Product.class));
        assertEquals(500, request.getValue().size());
        assertEquals("id", request.getValue().sort().get(0).field().field());
        assertTrue(request.getValue().query().isBool());
        assertTrue(request.getValue().query().bool().filter().stream().anyMatch(clause -> clause.isScript()
                && clause.script().script().isInline()
                && clause.script().script().inline().source().contains(".trim()")));
    }

    @Test
    void sortsNamesWithGermanCaseAccentAndNumericSemanticsBeforePaging() throws Exception {
        OpenSearchClient client = mock(OpenSearchClient.class);
        OpenSearchService service = new OpenSearchService();
        service.client = client;
        service.indexName = "products";
        List<Hit<Product>> hits = List.of(
                productHit(10, "Artikel 10"), productHit(4, "äpfel"),
                productHit(2, "Artikel 2"), productHit(3, "Apfel")
        );
        when(client.search(any(SearchRequest.class), eq(Product.class))).thenReturn(searchResponse(4, hits));

        CommonDtos.PageResponse<Product> result = service.searchAdminProductsPage(null, 0, 10, "name", null);

        assertEquals(List.of("Apfel", "äpfel", "Artikel 2", "Artikel 10"),
                result.content().stream().map(Product::getName).toList());
    }

    @Test
    void readsAllSearchAfterBatchesBeforeSlicingRequestedPage() throws Exception {
        OpenSearchClient client = mock(OpenSearchClient.class);
        OpenSearchService service = new OpenSearchService();
        service.client = client;
        service.indexName = "products";
        List<Hit<Product>> first = new ArrayList<>();
        for (int id = 1; id <= 500; id++) first.add(productHit(id, "P" + id));
        List<Hit<Product>> second = List.of(productHit(501, "P501"), productHit(502, "P502"));
        when(client.search(any(SearchRequest.class), eq(Product.class)))
                .thenReturn(searchResponse(502, first), searchResponse(502, second));

        CommonDtos.PageResponse<Product> result = service.searchAdminProductsPage(null, 100, 1, "id", null);

        assertEquals(502, result.totalElements());
        assertEquals(101, result.content().get(0).getId());
        ArgumentCaptor<SearchRequest> requests = ArgumentCaptor.forClass(SearchRequest.class);
        verify(client, org.mockito.Mockito.times(2)).search(requests.capture(), eq(Product.class));
        assertEquals(List.of("500"), requests.getAllValues().get(1).searchAfter());
    }

    private static Hit<Product> productHit(int id, String name) {
        Product product = new Product();
        product.setId(id);
        product.setName(name);
        return Hit.of(builder -> builder.id(String.valueOf(id)).source(product).sort(String.valueOf(id)));
    }

    private static SearchResponse<Product> searchResponse(long total, List<Hit<Product>> hits) {
        return SearchResponse.searchResponseOf(builder -> builder.took(1).timedOut(false)
                .shards(shards -> shards.total(1).successful(1).failed(0))
                .hits(result -> result.total(value -> value.value(total).relation(TotalHitsRelation.Eq)).hits(hits)));
    }
}
