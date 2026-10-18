package at.htl.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch.core.BulkRequest;
import org.opensearch.client.opensearch.core.BulkResponse;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.bulk.BulkOperation;
import org.opensearch.client.opensearch.core.search.Hit;
import org.opensearch.client.opensearch.core.search.HitsMetadata;
import org.opensearch.client.opensearch._types.ShardStatistics;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Simulates the layouts index: {@code index} holds ids newest first. Searches honour from/size and bulk deletes
 * remove the ids again, so repeated rounds see the same state OpenSearch shows after a refresh.
 */
class LegacyLayoutPruneTest {

    private static final String INDEX = "layouts";
    private static final String CURRENT = "current";

    private final ObjectMapper mapper = new ObjectMapper();
    private final List<String> index = new ArrayList<>();
    private final List<String> deleted = new ArrayList<>();
    private OpenSearchClient client;
    private LayoutService service;

    @BeforeEach
    void setUp() throws IOException {
        client = mock(OpenSearchClient.class);
        service = new LayoutService();
        service.client = client;
        service.layoutIndexName = INDEX;

        when(client.search(any(SearchRequest.class), eq(JsonNode.class))).thenAnswer(invocation -> {
            SearchRequest request = invocation.getArgument(0);
            int from = request.from();
            int end = Math.min(index.size(), from + request.size());
            List<Hit<JsonNode>> hits = new ArrayList<>();
            for (int i = from; i < end; i++) {
                hits.add(hit(index.get(i)));
            }
            return searchResponse(hits);
        });
        when(client.bulk(any(BulkRequest.class))).thenAnswer(invocation -> {
            BulkRequest request = invocation.getArgument(0);
            for (BulkOperation operation : request.operations()) {
                String id = operation.delete().id();
                deleted.add(id);
                index.remove(id);
            }
            return new BulkResponse.Builder().took(1L).errors(false).items(List.of()).build();
        });
    }

    @Test
    void deletesOnlyTheOldestVersionsBeyondKeepAndNeverCurrent() throws IOException {
        for (int i = 0; i < 60; i++) {
            index.add("v" + i);
        }
        index.add(CURRENT); // defensive case: a current pointer inside the stale range must still survive
        for (int i = 60; i < 120; i++) {
            index.add("v" + i);
        }

        long removed = service.pruneLegacyVersions(50);

        Set<String> expected = new HashSet<>();
        for (int i = 50; i < 120; i++) {
            expected.add("v" + i);
        }
        assertEquals(70L, removed);
        assertEquals(expected, new HashSet<>(deleted));
        assertFalse(deleted.contains(CURRENT));
        assertTrue(index.contains(CURRENT));
        verify(client, times(1)).bulk(any(BulkRequest.class));
    }

    @Test
    void pagesThroughMoreThanOneBatchUntilNothingIsLeft() throws IOException {
        for (int i = 0; i < 450; i++) {
            index.add("v" + i);
        }

        long removed = service.pruneLegacyVersions(50);

        assertEquals(400L, removed);
        assertEquals(50, index.size());
        verify(client, times(2)).bulk(any(BulkRequest.class));
    }

    @Test
    void searchesAlwaysStartAfterTheKeptNewestVersions() throws IOException {
        for (int i = 0; i < 120; i++) {
            index.add("v" + i);
        }

        service.pruneLegacyVersions(50);

        verify(client, atLeastOnce()).search(
                argThat((SearchRequest request) -> request.from() == 50 && request.size() == 200),
                eq(JsonNode.class));
    }

    @Test
    void noDeleteWhenVersionsDoNotExceedKeep() throws IOException {
        for (int i = 0; i < 50; i++) {
            index.add("v" + i);
        }

        assertEquals(0L, service.pruneLegacyVersions(50));

        verify(client, never()).bulk(any(BulkRequest.class));
        assertEquals(50, index.size());
    }

    @Test
    void ioExceptionIsLoggedAndReturnsZero() throws IOException {
        doThrow(new IOException("connection refused")).when(client).search(any(SearchRequest.class), eq(JsonNode.class));

        assertEquals(0L, service.pruneLegacyVersions(50));

        verify(client, never()).bulk(any(BulkRequest.class));
    }

    @Test
    void missingIndexFailureIsLoggedAndReturnsZero() throws IOException {
        doThrow(new IllegalStateException("index_not_found")).when(client).search(any(SearchRequest.class), eq(JsonNode.class));

        assertEquals(0L, service.pruneLegacyVersions(50));
    }

    @Test
    void nonPositiveKeepDeletesNothing() throws IOException {
        for (int i = 0; i < 10; i++) {
            index.add("v" + i);
        }

        assertEquals(0L, service.pruneLegacyVersions(0));

        verify(client, never()).search(any(SearchRequest.class), eq(JsonNode.class));
        assertEquals(10, index.size());
    }

    private Hit<JsonNode> hit(String id) {
        String recordType = CURRENT.equals(id) ? "current" : "version";
        JsonNode source = mapper.createObjectNode().put("recordType", recordType);
        return Hit.of(h -> h.index(INDEX).id(id).source(source));
    }

    private SearchResponse<JsonNode> searchResponse(List<Hit<JsonNode>> hits) {
        HitsMetadata<JsonNode> metadata = HitsMetadata.of(m -> m.hits(hits));
        return new SearchResponse.Builder<JsonNode>()
                .took(1)
                .timedOut(false)
                .shards(ShardStatistics.of(s -> s.total(1).successful(1).skipped(0).failed(0)))
                .hits(metadata)
                .build();
    }
}
