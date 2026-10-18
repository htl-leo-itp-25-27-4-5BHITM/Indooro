package at.htl.config;

import at.htl.repository.CategoryRepository;
import at.htl.service.CategoryService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.ErrorCause;
import org.opensearch.client.opensearch._types.ErrorResponse;
import org.opensearch.client.opensearch._types.OpenSearchException;
import org.opensearch.client.opensearch._types.mapping.Property;
import org.opensearch.client.opensearch.indices.CreateIndexRequest;
import org.opensearch.client.opensearch.indices.ExistsRequest;
import org.opensearch.client.opensearch.indices.GetIndexRequest;
import org.opensearch.client.opensearch.indices.GetIndexResponse;
import org.opensearch.client.opensearch.indices.IndexState;
import org.opensearch.client.opensearch.indices.OpenSearchIndicesClient;
import org.opensearch.client.transport.TransportException;
import org.opensearch.client.transport.endpoints.BooleanResponse;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class OpenSearchStartupTest {

    private OpenSearchClient client;
    private OpenSearchIndicesClient indices;
    private CategoryRepository categoryRepository;
    private CategoryService categoryService;
    private OpenSearchStartup startup;

    @BeforeEach
    void setUp() throws IOException {
        client = mock(OpenSearchClient.class);
        indices = mock(OpenSearchIndicesClient.class);
        when(client.indices()).thenReturn(indices);
        existingIndices();
        GetIndexResponse noVersions = versionedIndices();
        when(indices.get(any(GetIndexRequest.class))).thenReturn(noVersions);

        categoryRepository = mock(CategoryRepository.class);
        categoryService = mock(CategoryService.class);

        startup = new OpenSearchStartup();
        startup.client = client;
        startup.categoryRepository = categoryRepository;
        startup.categoryService = categoryService;
        startup.productIndexName = "products";
        startup.productIndexPrefix = "products_v";
        startup.productAlias = "products_live";
        startup.layoutIndexName = "layouts";
        startup.enabled = true;
    }

    @Test
    void prepareCreatesMissingLayoutsCategoriesAndProductIndices() throws IOException {
        assertTrue(startup.prepare());

        assertTrue(startup.isReady());
        assertEquals(List.of("layouts", "products"), createdIndexNames());
        verify(categoryRepository).ensureIndex();
    }

    @Test
    void categorySeedIsDelegatedToCategoryServiceAfterIndexExists() throws IOException {
        assertTrue(startup.prepare());

        verify(categoryService).seedIfEmpty();
    }

    @Test
    void layoutMappingKeepsElementsOutOfDynamicMapping() throws IOException {
        startup.prepare();

        Map<String, Property> properties = createdRequest("layouts").mappings().properties();
        assertEquals(Boolean.FALSE, properties.get("elements").object().enabled());
        assertTrue(properties.get("recordType").text().fields().get("keyword").isKeyword());
        assertTrue(properties.get("savedAt").isDate());
    }

    @Test
    void existingLayoutsIndexIsLeftUntouched() throws IOException {
        existingIndices("layouts");

        assertTrue(startup.prepare());

        assertFalse(createdIndexNames().contains("layouts"));
        assertTrue(startup.isReady());
    }

    @Test
    void productIndexIsSkippedWhenAliasExists() throws IOException {
        existingIndices("products_live");

        assertTrue(startup.prepare());

        assertFalse(createdIndexNames().contains("products"));
        assertTrue(startup.isReady());
    }

    @Test
    void productIndexIsSkippedWhenNameIsTakenByAnIndexOrAlias() throws IOException {
        existingIndices("products");

        assertTrue(startup.prepare());

        assertFalse(createdIndexNames().contains("products"));
    }

    @Test
    void productIndexIsSkippedWhenVersionedIndexExists() throws IOException {
        GetIndexResponse versions = versionedIndices("products_v3");
        when(indices.get(any(GetIndexRequest.class))).thenReturn(versions);

        assertTrue(startup.prepare());

        assertFalse(createdIndexNames().contains("products"));
        assertTrue(startup.isReady());
    }

    @Test
    void unreachableOpenSearchKeepsReadinessDown() throws IOException {
        when(indices.exists(any(ExistsRequest.class))).thenThrow(new IOException("connection refused"));

        assertFalse(startup.prepare());

        assertFalse(startup.isReady());
    }

    @Test
    void transportFailureKeepsReadinessDown() throws IOException {
        when(indices.exists(any(ExistsRequest.class))).thenThrow(new TransportException("connection refused"));

        assertFalse(startup.prepare());

        assertFalse(startup.isReady());
    }

    @Test
    void retryPreparesAfterOpenSearchRecovers() throws IOException {
        when(indices.exists(any(ExistsRequest.class)))
                .thenThrow(new IOException("connection refused"))
                .thenReturn(new BooleanResponse(false));
        assertFalse(startup.prepare());
        assertFalse(startup.isReady());

        startup.retry();

        assertTrue(startup.isReady());
    }

    @Test
    void retryDoesNothingOnceReady() throws IOException {
        assertTrue(startup.prepare());
        clearInvocations(indices);

        startup.retry();

        verifyNoInteractions(indices);
    }

    @Test
    void startupObserverNeverFailsBootWhenPreparationThrows() throws IOException {
        when(indices.exists(any(ExistsRequest.class))).thenThrow(new IllegalStateException("boom"));

        startup.onStart(null);

        assertFalse(startup.isReady());
    }

    @Test
    void disabledStartupTouchesNoOpenSearch() {
        startup.enabled = false;
        clearInvocations(client);

        startup.onStart(null);
        startup.retry();

        verifyNoInteractions(client);
    }

    @Test
    void racingCreatesAreIgnored() throws IOException {
        ErrorResponse error = ErrorResponse.of(b -> b.status(400)
                .error(ErrorCause.of(e -> e.type("resource_already_exists_exception").reason("already exists"))));
        when(indices.create(any(CreateIndexRequest.class))).thenThrow(new OpenSearchException(error));

        assertTrue(startup.prepare());

        assertTrue(startup.isReady());
        verify(indices, times(2)).create(any(CreateIndexRequest.class));
    }

    private List<String> createdIndexNames() throws IOException {
        return createdRequests().stream().map(CreateIndexRequest::index).toList();
    }

    private CreateIndexRequest createdRequest(String indexName) throws IOException {
        return createdRequests().stream()
                .filter(request -> indexName.equals(request.index()))
                .findFirst()
                .orElseThrow();
    }

    private List<CreateIndexRequest> createdRequests() throws IOException {
        ArgumentCaptor<CreateIndexRequest> captor = ArgumentCaptor.forClass(CreateIndexRequest.class);
        verify(indices, atLeast(0)).create(captor.capture());
        return captor.getAllValues();
    }

    /** Stubs exists(): true only for the given names (indices or aliases). */
    private void existingIndices(String... names) throws IOException {
        Set<String> present = Set.of(names);
        when(indices.exists(any(ExistsRequest.class))).thenAnswer(invocation -> {
            ExistsRequest request = invocation.getArgument(0);
            return new BooleanResponse(present.contains(request.index().get(0)));
        });
    }

    private static GetIndexResponse versionedIndices(String... names) {
        Map<String, IndexState> result = new LinkedHashMap<>();
        for (String name : names) {
            result.put(name, IndexState.of(b -> b));
        }
        GetIndexResponse response = mock(GetIndexResponse.class);
        when(response.result()).thenReturn(result);
        return response;
    }
}
