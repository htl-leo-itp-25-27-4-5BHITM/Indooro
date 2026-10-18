package at.htl.service;

import at.htl.model.Product;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.opensearch.client.json.JsonpSerializable;
import org.opensearch.client.json.jackson.JacksonJsonpMapper;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.mapping.TypeMapping;
import org.opensearch.client.opensearch._types.query_dsl.Operator;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.core.CountRequest;
import org.opensearch.client.opensearch.core.CountResponse;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.TotalHitsRelation;
import org.opensearch.client.opensearch.indices.GetIndexRequest;
import org.opensearch.client.opensearch.indices.GetIndexResponse;
import org.opensearch.client.opensearch.indices.GetMappingRequest;
import org.opensearch.client.opensearch.indices.GetMappingResponse;
import org.opensearch.client.opensearch.indices.IndexState;
import org.opensearch.client.opensearch.indices.OpenSearchIndicesClient;
import org.opensearch.client.opensearch.indices.get_mapping.IndexMappingRecord;

import jakarta.json.stream.JsonGenerator;
import java.io.IOException;
import java.io.StringWriter;
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
import static org.mockito.Mockito.when;

class OpenSearchSearchQueryTest {

    private static final String PILOT_CODE = "SPAR-Leonding-001";
    private static final String PILOT_ID = "6f1c2a5e-0000-4000-8000-000000000001";
    private static final JacksonJsonpMapper JSON_MAPPER = new JacksonJsonpMapper();

    private OpenSearchClient client;
    private OpenSearchIndicesClient indices;
    private OpenSearchService service;

    @BeforeEach
    void setUp() throws IOException {
        client = mock(OpenSearchClient.class);
        indices = mock(OpenSearchIndicesClient.class);
        when(client.indices()).thenReturn(indices);
        service = newService();
        // Standard: Index mit neuem Mapping, name hat prefix und parts
        stubMapping(ProductIndexDefinition.createIndexRequest("products").mappings());
        SearchResponse<Product> empty = SearchResponse.searchResponseOf(builder -> builder.took(1).timedOut(false)
                .shards(shards -> shards.total(1).successful(1).failed(0))
                .hits(hits -> hits.total(total -> total.value(0).relation(TotalHitsRelation.Eq)).hits(List.of())));
        when(client.search(any(SearchRequest.class), eq(Product.class))).thenReturn(empty);
    }

    @Test
    void shouldClausesContainSixGermanClausesRelaxedClauseAndLayoutCode() throws IOException {
        service.searchProducts("Backpulver", 10, null, null);

        List<Query> should = capturedQuery().bool().should();
        assertEquals(8, should.size());

        Query exact = should.get(0);
        assertTrue(exact.isTerm());
        assertEquals("name.keyword", exact.term().field());
        assertEquals(10f, exact.term().boost());

        Query phrase = should.get(1);
        assertTrue(phrase.isMatchPhrase());
        assertEquals("name", phrase.matchPhrase().field());
        assertEquals(6f, phrase.matchPhrase().boost());

        Query allWords = should.get(2);
        assertTrue(allWords.isMatch());
        assertEquals("name", allWords.match().field());
        assertEquals(Operator.And, allWords.match().operator());
        assertEquals(4f, allWords.match().boost());

        Query prefix = should.get(3);
        assertTrue(prefix.isMatch());
        assertEquals("name.prefix", prefix.match().field());
        assertEquals(Operator.And, prefix.match().operator());
        assertEquals(3f, prefix.match().boost());

        Query typo = should.get(4);
        assertTrue(typo.isMatch());
        assertEquals("name", typo.match().field());
        assertEquals("AUTO", typo.match().fuzziness());
        assertEquals(1, typo.match().prefixLength());
        assertEquals(1.5f, typo.match().boost());

        Query parts = should.get(5);
        assertTrue(parts.isMatch());
        assertEquals("name.parts", parts.match().field());
        assertEquals(Operator.And, parts.match().operator());
        assertEquals(1f, parts.match().boost());

        // 6b) Entspannte Wortsuche: OR mit minimum_should_match 75 %, niedriger Boost 0.6
        Query relaxed = should.get(6);
        assertTrue(relaxed.isMatch());
        assertEquals("name", relaxed.match().field());
        assertEquals(Operator.Or, relaxed.match().operator());
        assertEquals("75%", relaxed.match().minimumShouldMatch());
        assertEquals(0.6f, relaxed.match().boost());

        Query layoutCode = should.get(7);
        assertTrue(layoutCode.isTerm());
        assertEquals("layoutCode", layoutCode.term().field());
        assertEquals(6f, layoutCode.term().boost());
    }

    @Test
    void searchRequiresAtLeastOneShouldClause() throws IOException {
        service.searchProducts("milch", 10, null, null);

        assertEquals("1", capturedQuery().bool().minimumShouldMatch());
    }

    @Test
    void brandWordsDoNotDominateThroughWordLevelBoosts() throws IOException {
        service.searchProducts("SPAR", 10, null, null);

        // Wortweise Treffer im Namen hoechstens Boost 4 (Phrase 6 nur fuer ganze Phrasen, exakter Name 10).
        List<Query> should = capturedQuery().bool().should();
        assertTrue(should.stream().filter(Query::isMatch)
                .allMatch(clause -> clause.match().boost() <= 4f));
    }

    @Test
    void storeFilterStaysInFilterClausesAndQueryKeepsShouldPart() throws IOException {
        service.searchProducts("Backpulver", 10, null, PILOT_CODE);

        Query bool = capturedQuery();
        assertTrue(bool.bool().filter().stream().anyMatch(clause -> clause.isTerm()
                && "storeCode".equals(clause.term().field())
                && PILOT_CODE.equals(clause.term().value().stringValue())));
        assertEquals(8, bool.bool().should().size());
        assertTrue(bool.bool().should().stream().noneMatch(clause -> clause.isTerm()
                && "storeCode".equals(clause.term().field())));
    }

    @Test
    void storeIdAndStoreCodeBothBecomeFilters() throws IOException {
        service.searchProducts("milch", 10, PILOT_ID, PILOT_CODE);

        List<Query> filters = capturedQuery().bool().filter();
        assertTrue(filters.stream().anyMatch(clause -> clause.isTerm() && "storeId".equals(clause.term().field())));
        assertTrue(filters.stream().anyMatch(clause -> clause.isTerm() && "storeCode".equals(clause.term().field())));
    }

    @Test
    void withoutStoreNoFilterIsAdded() throws IOException {
        service.searchProducts("milch", 10, null, "   ");

        assertFalse(capturedQuery().bool().filter().stream().anyMatch(Query::isTerm));
    }

    @Test
    void sizeIsPassedThroughAndDefaultsToTen() throws IOException {
        service.searchProducts("milch", 25, null, null);
        assertEquals(25, capturedRequest().size());

        service.searchProducts("milch", null, null, null);
        ArgumentCaptor<SearchRequest> captor = captureAll();
        assertEquals(10, captor.getAllValues().get(1).size());
    }

    // ---- Subfelder name.prefix / name.parts abhaengig vom Mapping ----

    @Test
    void legacyMappingWithoutSubfieldsDropsOnlyPrefixAndPartsClauses() throws IOException {
        service.searchProducts("Backpulver", 10, null, null);
        stubMapping(legacyMapping());
        newService().searchProducts("Backpulver", 10, null, null);

        List<SearchRequest> requests = captureAll().getAllValues();
        Query withSubfields = requests.get(0).query();
        Query legacy = requests.get(1).query();

        assertEquals(8, withSubfields.bool().should().size());
        assertEquals(6, legacy.bool().should().size());
        assertTrue(json(withSubfields).contains("name.prefix"));
        assertTrue(json(withSubfields).contains("name.parts"));
        assertFalse(json(legacy).contains("name.prefix"));
        assertFalse(json(legacy).contains("name.parts"));

        // Alle uebrigen Klauseln bleiben identisch und in gleicher Reihenfolge.
        List<String> expected = withSubfields.bool().should().stream()
                .filter(clause -> !isSubfieldClause(clause))
                .map(OpenSearchSearchQueryTest::json)
                .toList();
        List<String> actual = legacy.bool().should().stream()
                .map(OpenSearchSearchQueryTest::json)
                .toList();
        assertEquals(expected, actual);
    }

    @Test
    void mappingLookupIsCachedBetweenSearches() throws IOException {
        OpenSearchService cached = newService();
        cached.searchProducts("milch", 10, null, null);
        cached.searchProducts("milch", 10, null, null);

        verify(indices, times(1)).getMapping(any(GetMappingRequest.class));
        assertEquals(8, capturedRequest().query().bool().should().size());
    }

    @Test
    void failedMappingLookupFallsBackWithoutCachingAndRecoversLater() throws IOException {
        when(indices.getMapping(any(GetMappingRequest.class))).thenThrow(new IOException("cluster down"));
        OpenSearchService retrying = newService();

        retrying.searchProducts("milch", 10, null, null);
        assertEquals(6, capturedRequest().query().bool().should().size());

        retrying.searchProducts("milch", 10, null, null);
        verify(indices, times(2)).getMapping(any(GetMappingRequest.class));

        stubMapping(ProductIndexDefinition.createIndexRequest("products").mappings());
        retrying.searchProducts("milch", 10, null, null);
        assertEquals(8, capturedRequest().query().bool().should().size());
    }

    @Test
    void nullMappingResponseFallsBackWithoutNullPointer() throws IOException {
        when(indices.getMapping(any(GetMappingRequest.class))).thenReturn(null);

        newService().searchProducts("milch", 10, null, null);

        assertEquals(6, capturedRequest().query().bool().should().size());
    }

    @Test
    void activationInvalidatesCachedMapping() throws IOException {
        OpenSearchService switching = newService();
        switching.searchProducts("milch", 10, null, null);

        GetIndexResponse versions = mock(GetIndexResponse.class);
        when(versions.result()).thenReturn(Map.of("products_v1", IndexState.of(b -> b)));
        when(indices.get(any(GetIndexRequest.class))).thenReturn(versions);
        when(client.count(any(CountRequest.class))).thenReturn(
                CountResponse.of(b -> b.count(5).shards(s -> s.total(1).successful(1).failed(0).skipped(0))));
        switching.activateIndex("products_v1", false);

        switching.searchProducts("milch", 10, null, null);

        verify(indices, times(2)).getMapping(any(GetMappingRequest.class));
    }

    private OpenSearchService newService() {
        OpenSearchService created = new OpenSearchService();
        created.client = client;
        created.indexName = "products";
        created.indexPrefix = "products_v";
        created.aliasName = "products_live";
        return created;
    }

    private void stubMapping(TypeMapping mapping) throws IOException {
        GetMappingResponse response = mock(GetMappingResponse.class);
        when(response.result()).thenReturn(Map.of("products", IndexMappingRecord.of(b -> b.mappings(mapping))));
        when(indices.getMapping(any(GetMappingRequest.class))).thenReturn(response);
    }

    /** Altes Mapping wie vor der Einfuehrung der Subfelder: name ohne prefix und parts. */
    private static TypeMapping legacyMapping() {
        return TypeMapping.of(m -> m.properties("name", p -> p.text(t -> t)));
    }

    private static boolean isSubfieldClause(Query clause) {
        return clause.isMatch()
                && ("name.prefix".equals(clause.match().field()) || "name.parts".equals(clause.match().field()));
    }

    private static String json(Query query) {
        return serialize(query);
    }

    private static String serialize(JsonpSerializable value) {
        StringWriter writer = new StringWriter();
        try (JsonGenerator generator = JSON_MAPPER.jsonProvider().createGenerator(writer)) {
            value.serialize(generator, JSON_MAPPER);
        }
        return writer.toString();
    }

    private Query capturedQuery() throws IOException {
        return capturedRequest().query();
    }

    private SearchRequest capturedRequest() throws IOException {
        ArgumentCaptor<SearchRequest> captor = captureAll();
        return captor.getValue();
    }

    private ArgumentCaptor<SearchRequest> captureAll() throws IOException {
        ArgumentCaptor<SearchRequest> captor = ArgumentCaptor.forClass(SearchRequest.class);
        verify(client, org.mockito.Mockito.atLeastOnce()).search(captor.capture(), eq(Product.class));
        return captor;
    }
}
