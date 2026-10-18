package at.htl.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.SortOptions;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.mapping.FieldType;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;

import java.util.List;


import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/** History limit is clamped to 1..50 (default 10 when absent) and the query sorts savedAt desc with unmappedType. */
class LayoutHistoryQueryTest {

    @Test
    void limitIsClampedAndDefaultsAreKept() {
        assertEquals(10, LayoutService.historyLimit(null));
        assertEquals(1, LayoutService.historyLimit(0));
        assertEquals(1, LayoutService.historyLimit(-7));
        assertEquals(1, LayoutService.historyLimit(1));
        assertEquals(25, LayoutService.historyLimit(25));
        assertEquals(50, LayoutService.historyLimit(50));
        assertEquals(50, LayoutService.historyLimit(5000));
    }

    @Test
    void historyQueryUsesClampedSizeVersionFilterAndSafeSavedAtSort() throws Exception {
        LayoutService service = new LayoutService();
        service.client = mock(OpenSearchClient.class);
        service.layoutIndexName = "layouts";
        SearchResponse<JsonNode> response = new SearchResponse.Builder<JsonNode>()
                .took(1)
                .timedOut(false)
                .shards(sh -> sh.total(1).successful(1).failed(0).skipped(0))
                .hits(h -> h.hits(List.of()))
                .build();
        doReturn(response).when(service.client).search(any(SearchRequest.class), eq(JsonNode.class));

        service.getRecentLayouts(500);

        ArgumentCaptor<SearchRequest> captor = ArgumentCaptor.forClass(SearchRequest.class);
        verify(service.client).search(captor.capture(), eq(JsonNode.class));
        SearchRequest request = captor.getValue();

        assertEquals(50, request.size());
        assertEquals("layouts", request.index().get(0));
        assertEquals(1, request.sort().size());
        SortOptions sort = request.sort().get(0);
        assertEquals("savedAt", sort.field().field());
        assertEquals(SortOrder.Desc, sort.field().order());
        assertEquals(FieldType.Date, sort.field().unmappedType());
    }
}
