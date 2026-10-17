package at.htl.service;

import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch.indices.CreateIndexRequest;
import org.opensearch.client.opensearch.indices.CreateIndexResponse;
import org.opensearch.client.opensearch.indices.ExistsRequest;
import org.opensearch.client.opensearch.indices.OpenSearchIndicesClient;
import org.opensearch.client.transport.endpoints.BooleanResponse;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OpenSearchIndexCreationTest {

    private OpenSearchClient client;
    private OpenSearchIndicesClient indices;
    private OpenSearchService service;

    @BeforeEach
    void setUp() {
        client = mock(OpenSearchClient.class);
        indices = mock(OpenSearchIndicesClient.class);
        when(client.indices()).thenReturn(indices);
        service = new OpenSearchService();
        service.client = client;
        service.indexName = "products";
    }

    @Test
    void createIndexSendsDefinitionWithGermanAnalysisSynonymsAndMapping() throws IOException {
        when(indices.exists(any(ExistsRequest.class))).thenReturn(new BooleanResponse(false));
        when(indices.create(any(CreateIndexRequest.class))).thenReturn(mock(CreateIndexResponse.class));

        service.createIndex();

        ArgumentCaptor<CreateIndexRequest> captor = ArgumentCaptor.forClass(CreateIndexRequest.class);
        verify(indices).create(captor.capture());
        CreateIndexRequest request = captor.getValue();

        assertEquals("products", request.index());
        assertTrue(request.settings().analysis().analyzer().containsKey("de_name"));
        assertTrue(request.settings().analysis().analyzer().containsKey("de_name_search"));
        assertTrue(request.settings().analysis().filter().containsKey("de_synonyms"));
        assertTrue(request.settings().analysis().filter().get("de_synonyms").definition()
                .synonymGraph().synonyms().size() >= 40);
        assertTrue(request.mappings().properties().get("name").text().fields().containsKey("prefix"));
        assertTrue(request.mappings().properties().get("name").text().fields().containsKey("parts"));
        assertTrue(request.mappings().properties().get("name").text().fields().containsKey("keyword"));
        assertTrue(request.mappings().properties().containsKey("storeId"));
        assertTrue(request.mappings().properties().containsKey("storeCode"));
    }

    @Test
    void createIndexThrowsConflictWhenIndexAlreadyExists() throws IOException {
        when(indices.exists(any(ExistsRequest.class))).thenReturn(new BooleanResponse(true));

        WebApplicationException error = assertThrows(WebApplicationException.class, () -> service.createIndex());

        assertEquals(Response.Status.CONFLICT.getStatusCode(), error.getResponse().getStatus());
        verify(indices, never()).create(any(CreateIndexRequest.class));
    }
}
