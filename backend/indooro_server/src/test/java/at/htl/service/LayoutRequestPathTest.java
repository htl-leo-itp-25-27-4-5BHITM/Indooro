package at.htl.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch.core.GetRequest;
import org.opensearch.client.opensearch.core.GetResponse;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.indices.OpenSearchIndicesClient;

import java.io.IOException;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** Read paths rely on the layouts index prepared at start-up and never create or check indices themselves. */
class LayoutRequestPathTest {

    private OpenSearchClient client;
    private OpenSearchIndicesClient indices;
    private LayoutService service;

    @BeforeEach
    void setUp() {
        client = mock(OpenSearchClient.class);
        indices = mock(OpenSearchIndicesClient.class);
        when(client.indices()).thenReturn(indices);
        service = new LayoutService();
        service.client = client;
        service.layoutIndexName = "layouts";
    }

    @Test
    void getCurrentLayoutSendsNoIndexRequest() throws IOException {
        JsonNode layout = new ObjectMapper().readTree("{\"layoutId\":\"current\",\"elements\":[]}");
        GetResponse<JsonNode> found = new GetResponse.Builder<JsonNode>()
                .index("layouts").id("current").found(true).source(layout).build();
        doReturn(found).when(client).get(any(GetRequest.class), eq(JsonNode.class));

        JsonNode current = service.getCurrentLayout();

        assertEquals(layout, current);
        verifyNoInteractions(indices);
    }

    @Test
    void getLayoutVersionAndHistorySendNoIndexRequest() throws IOException {
        GetResponse<JsonNode> missing = new GetResponse.Builder<JsonNode>()
                .index("layouts").id("layout-1").found(false).build();
        doReturn(missing).when(client).get(any(GetRequest.class), eq(JsonNode.class));
        SearchResponse<JsonNode> empty = new SearchResponse.Builder<JsonNode>()
                .took(1)
                .timedOut(false)
                .shards(sh -> sh.total(1).successful(1).failed(0).skipped(0))
                .hits(h -> h.hits(List.of()))
                .build();
        doReturn(empty).when(client).search(any(SearchRequest.class), eq(JsonNode.class));

        service.getLayoutVersion("layout-1");
        service.getRecentLayouts(5);

        verifyNoInteractions(indices);
        verify(client).search(any(SearchRequest.class), eq(JsonNode.class));
    }
}
