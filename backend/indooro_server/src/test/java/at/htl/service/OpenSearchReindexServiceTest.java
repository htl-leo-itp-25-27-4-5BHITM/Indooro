package at.htl.service;

import jakarta.ws.rs.WebApplicationException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.BulkIndexByScrollFailure;
import org.opensearch.client.opensearch._types.ErrorCause;
import org.opensearch.client.opensearch._types.ErrorResponse;
import org.opensearch.client.opensearch._types.OpenSearchException;
import org.opensearch.client.opensearch.core.CountRequest;
import org.opensearch.client.opensearch.core.CountResponse;
import org.opensearch.client.opensearch.core.ReindexRequest;
import org.opensearch.client.opensearch.core.ReindexResponse;
import org.opensearch.client.opensearch.indices.Alias;
import org.opensearch.client.opensearch.indices.CreateIndexRequest;
import org.opensearch.client.opensearch.indices.CreateIndexResponse;
import org.opensearch.client.opensearch.indices.DeleteIndexRequest;
import org.opensearch.client.opensearch.indices.ExistsRequest;
import org.opensearch.client.opensearch.indices.GetIndexRequest;
import org.opensearch.client.opensearch.indices.GetIndexResponse;
import org.opensearch.client.opensearch.indices.IndexState;
import org.opensearch.client.opensearch.indices.OpenSearchIndicesClient;
import org.opensearch.client.opensearch.indices.RefreshRequest;
import org.opensearch.client.opensearch.indices.UpdateAliasesRequest;
import org.opensearch.client.opensearch.indices.update_aliases.Action;
import org.opensearch.client.transport.endpoints.BooleanResponse;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OpenSearchReindexServiceTest {

    private OpenSearchClient client;
    private OpenSearchIndicesClient indices;
    private OpenSearchService service;

    @BeforeEach
    void setUp() throws IOException {
        client = mock(OpenSearchClient.class);
        indices = mock(OpenSearchIndicesClient.class);
        when(client.indices()).thenReturn(indices);
        service = new OpenSearchService();
        service.client = client;
        service.indexName = "products";
        service.indexPrefix = "products_v";
        service.aliasName = "products_live";

        when(indices.exists(any(ExistsRequest.class))).thenReturn(new BooleanResponse(false));
        when(indices.create(any(CreateIndexRequest.class))).thenReturn(mock(CreateIndexResponse.class));
        stubVersions();
        stubCounts(5, 5);
        stubReindex(List.of());
    }

    // ---- Zielnamen ----

    @Test
    void targetIsVersionOneWhenNoVersionExists() throws IOException {
        assertEquals("products_v1", service.nextVersionName(List.of()));
        assertEquals("products_v1", service.nextVersionName(List.of("products", "products_vanilla", "products_v")));
    }

    @Test
    void targetIsHighestVersionPlusOneIgnoringForeignNames() throws IOException {
        assertEquals("products_v11", service.nextVersionName(List.of("products_v9", "products_v10", "products_v2")));
        assertEquals("products_v1", service.nextVersionName(List.of("products_v0x", "products_vanilla")));
    }

    @Test
    void reindexUsesNextFreeVersionAmongExistingVersions() throws IOException {
        stubVersions(
                version("products_v1"),
                version("products_v3", "products_live"),
                version("products_vanilla"),
                version("products_v"));

        OpenSearchService.ReindexResult result = service.reindexProducts();

        assertEquals("products_v4", result.target());
        ArgumentCaptor<CreateIndexRequest> create = ArgumentCaptor.forClass(CreateIndexRequest.class);
        verify(indices).create(create.capture());
        assertEquals("products_v4", create.getValue().index());
    }

    // ---- Reindex ----

    @Test
    void reindexCopiesIntoFirstVersionAndKeepsSourceAndAliasUntouched() throws IOException {
        OpenSearchService.ReindexResult result = service.reindexProducts();

        assertEquals("products", result.source());
        assertEquals("products_v1", result.target());
        assertEquals(5, result.sourceCount());
        assertEquals(5, result.targetCount());
        assertEquals("OK", result.status());

        ArgumentCaptor<ReindexRequest> reindex = ArgumentCaptor.forClass(ReindexRequest.class);
        verify(client).reindex(reindex.capture());
        assertEquals(List.of("products"), reindex.getValue().source().index());
        assertEquals("products_v1", reindex.getValue().dest().index());
        assertTrue(reindex.getValue().waitForCompletion());
        assertTrue(reindex.getValue().refresh());

        verify(indices, never()).delete(any(DeleteIndexRequest.class));
        verify(indices, never()).updateAliases(any(UpdateAliasesRequest.class));
    }

    @Test
    void countMismatchReportsGermanErrorAndKeepsTarget() throws IOException {
        stubCounts(5, 4);

        WebApplicationException error = assertThrows(WebApplicationException.class, () -> service.reindexProducts());

        assertEquals(500, error.getResponse().getStatus());
        assertTrue(error.getMessage().contains("Reindex unvollständig"), error.getMessage());
        assertTrue(error.getMessage().contains("products_v1"), error.getMessage());
        verify(indices, never()).delete(any(DeleteIndexRequest.class));
        verify(indices, never()).updateAliases(any(UpdateAliasesRequest.class));
    }

    @Test
    void reindexFailuresReportErrorEvenIfCountsMatch() throws IOException {
        stubReindex(List.of(mock(BulkIndexByScrollFailure.class)));

        WebApplicationException error = assertThrows(WebApplicationException.class, () -> service.reindexProducts());

        assertEquals(500, error.getResponse().getStatus());
        verify(indices, never()).delete(any(DeleteIndexRequest.class));
    }

    @Test
    void existingTargetAtCreateTimeReturnsConflict() throws IOException {
        when(indices.exists(any(ExistsRequest.class))).thenReturn(new BooleanResponse(true));

        WebApplicationException error = assertThrows(WebApplicationException.class, () -> service.reindexProducts());

        assertEquals(409, error.getResponse().getStatus());
        verify(indices, never()).create(any(CreateIndexRequest.class));
        verify(client, never()).reindex(any(ReindexRequest.class));
    }

    @Test
    void missingSourceIndexReturnsNotFoundBeforeAnythingIsCreated() throws IOException {
        ErrorResponse error = ErrorResponse.of(b -> b.status(404)
                .error(ErrorCause.of(e -> e.type("index_not_found_exception").reason("no such index [products]"))));
        when(client.count(argThat((CountRequest r) -> r != null && r.index().contains("products"))))
                .thenThrow(new OpenSearchException(error));

        WebApplicationException ex = assertThrows(WebApplicationException.class, () -> service.reindexProducts());

        assertEquals(404, ex.getResponse().getStatus());
        verify(indices, never()).create(any(CreateIndexRequest.class));
    }

    // ---- Alias-Umschaltung ----

    @Test
    void activateSendsRemoveAndAddInOneAtomicRequest() throws IOException {
        stubVersions(version("products_v1", "products_live"), version("products_v2"));

        OpenSearchService.ActivateResult result = service.activateIndex("products_v2", false);

        assertEquals("products_live", result.alias());
        assertEquals("products_v2", result.index());
        assertEquals(List.of("products_v1"), result.previous());

        ArgumentCaptor<UpdateAliasesRequest> captor = ArgumentCaptor.forClass(UpdateAliasesRequest.class);
        verify(indices, times(1)).updateAliases(captor.capture());
        List<Action> actions = captor.getValue().actions();
        assertEquals(2, actions.size());
        assertTrue(actions.get(0).isRemove());
        assertEquals("products_v1", actions.get(0).remove().index());
        assertEquals("products_live", actions.get(0).remove().alias());
        assertTrue(actions.get(1).isAdd());
        assertEquals("products_v2", actions.get(1).add().index());
        assertEquals("products_live", actions.get(1).add().alias());
        assertEquals(Boolean.TRUE, actions.get(1).add().isWriteIndex());

        verify(indices, never()).delete(any(DeleteIndexRequest.class));
    }

    @Test
    void activateWithoutCurrentAliasOnlyAddsAlias() throws IOException {
        stubVersions(version("products_v1"));

        OpenSearchService.ActivateResult result = service.activateIndex("products_v1", false);

        assertEquals(List.of(), result.previous());
        ArgumentCaptor<UpdateAliasesRequest> captor = ArgumentCaptor.forClass(UpdateAliasesRequest.class);
        verify(indices).updateAliases(captor.capture());
        assertEquals(1, captor.getValue().actions().size());
        assertTrue(captor.getValue().actions().get(0).isAdd());
    }

    @Test
    void invalidIndexNamesAreRejectedBeforeAnyCall() throws IOException {
        List<String> invalid = new ArrayList<>();
        invalid.add(null);
        invalid.add("");
        invalid.add("products");
        invalid.add("products_v");
        invalid.add("products_live");
        invalid.add("products_v1x");
        invalid.add("products_v-1");
        invalid.add("products_v1/../x");
        invalid.add("products_v1,products_v2");

        for (String name : invalid) {
            WebApplicationException error = assertThrows(WebApplicationException.class,
                    () -> service.activateIndex(name, false), "Name: " + name);
            assertEquals(400, error.getResponse().getStatus(), "Name: " + name);
        }
        verify(indices, never()).get(any(GetIndexRequest.class));
        verify(indices, never()).updateAliases(any(UpdateAliasesRequest.class));
    }

    @Test
    void unknownVersionIndexReturnsNotFound() throws IOException {
        stubVersions(version("products_v1", "products_live"));

        WebApplicationException error = assertThrows(WebApplicationException.class,
                () -> service.activateIndex("products_v9", false));

        assertEquals(404, error.getResponse().getStatus());
        verify(indices, never()).updateAliases(any(UpdateAliasesRequest.class));
    }

    // ---- Dokumentzahl-Pruefung vor der Umschaltung ----

    @Test
    void activateRefreshesTargetAndSourceBeforeCounting() throws IOException {
        stubVersions(version("products_v1", "products_live"), version("products_v2"));

        service.activateIndex("products_v2", false);

        verify(indices).refresh(argThat((RefreshRequest r) -> r.index().equals(List.of("products_v2"))));
        verify(indices).refresh(argThat((RefreshRequest r) -> r.index().equals(List.of("products"))));
        verify(indices).updateAliases(any(UpdateAliasesRequest.class));
    }

    @Test
    void activateWithDifferentCountsReturnsConflictAndKeepsAlias() throws IOException {
        stubVersions(version("products_v1", "products_live"), version("products_v2"));
        stubCounts(5, 4);

        WebApplicationException error = assertThrows(WebApplicationException.class,
                () -> service.activateIndex("products_v2", false));

        assertEquals(409, error.getResponse().getStatus());
        assertTrue(error.getMessage().contains("Quelle products hat 5 Dokumente"), error.getMessage());
        assertTrue(error.getMessage().contains("Ziel products_v2 hat 4"), error.getMessage());
        assertTrue(error.getMessage().contains("writes happened between reindex and activate; re-run reindex"),
                error.getMessage());
        verify(indices, never()).updateAliases(any(UpdateAliasesRequest.class));
        verify(indices, never()).delete(any(DeleteIndexRequest.class));
    }

    @Test
    void activateWithEqualCountsSwitchesAlias() throws IOException {
        stubVersions(version("products_v1", "products_live"), version("products_v2"));
        stubCounts(5, 5);

        OpenSearchService.ActivateResult result = service.activateIndex("products_v2", false);

        assertEquals("products_v2", result.index());
        verify(indices, times(1)).updateAliases(any(UpdateAliasesRequest.class));
    }

    @Test
    void forceSwitchesDespiteDifferentCounts() throws IOException {
        stubVersions(version("products_v1", "products_live"), version("products_v2"));
        stubCounts(5, 4);

        OpenSearchService.ActivateResult result = service.activateIndex("products_v2", true);

        assertEquals("products_v2", result.index());
        assertEquals(List.of("products_v1"), result.previous());
        verify(indices, times(1)).updateAliases(any(UpdateAliasesRequest.class));
    }

    // ---- Hilfsmethoden ----

    private record Version(String name, List<String> aliases) {}

    private static Version version(String name, String... aliases) {
        return new Version(name, List.of(aliases));
    }

    /** Echte Antwortobjekte: final-Methoden wie count() oder aliases() lassen sich mit dem Subclass-Mockmaker nicht stubben. */
    private void stubVersions(Version... versions) throws IOException {
        Map<String, IndexState> result = new LinkedHashMap<>();
        for (Version version : versions) {
            Map<String, Alias> aliases = new LinkedHashMap<>();
            version.aliases().forEach(alias -> aliases.put(alias, Alias.of(a -> a)));
            result.put(version.name(), IndexState.of(b -> b.aliases(aliases)));
        }
        GetIndexResponse response = mock(GetIndexResponse.class);
        when(response.result()).thenReturn(result);
        when(indices.get(any(GetIndexRequest.class))).thenReturn(response);
    }

    private void stubCounts(long sourceCount, long targetCount) throws IOException {
        CountResponse source = count(sourceCount);
        CountResponse target = count(targetCount);
        when(client.count(argThat((CountRequest r) -> r != null && r.index().contains("products")))).thenReturn(source);
        when(client.count(argThat((CountRequest r) -> r != null && !r.index().contains("products")))).thenReturn(target);
    }

    private static CountResponse count(long value) {
        return CountResponse.of(b -> b.count(value).shards(s -> s.total(1).successful(1).failed(0).skipped(0)));
    }

    private void stubReindex(List<BulkIndexByScrollFailure> failures) throws IOException {
        ReindexResponse response = ReindexResponse.of(b -> b
                .took(t -> t.time("1ms"))
                .timedOut(false)
                .total(5L).created(5L).updated(0L).deleted(0L).batches(1L).noops(0L).versionConflicts(0L)
                .failures(failures)
                .throttledMillis("0").throttledUntilMillis("0").requestsPerSecond(-1L));
        when(client.reindex(any(ReindexRequest.class))).thenReturn(response);
    }
}
