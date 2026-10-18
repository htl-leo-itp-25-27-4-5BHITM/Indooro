package at.htl.service;

import at.htl.model.Product;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.TotalHitsRelation;

import java.io.IOException;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OpenSearchUpsellCandidateQueryTest {

    private OpenSearchClient client;
    private OpenSearchService service;

    @BeforeEach
    void setUp() throws IOException {
        client = mock(OpenSearchClient.class);
        service = new OpenSearchService();
        service.client = client;
        service.indexName = "products";
        SearchResponse<Product> empty = SearchResponse.searchResponseOf(builder -> builder.took(1).timedOut(false)
                .shards(shards -> shards.total(1).successful(1).failed(0))
                .hits(hits -> hits.total(total -> total.value(0).relation(TotalHitsRelation.Eq)).hits(List.of())));
        when(client.search(any(SearchRequest.class), eq(Product.class))).thenReturn(empty);
    }

    @Test
    void storeFiltersAreKeptAsFilterTerms() throws IOException {
        service.findUpsellCandidates(20, "6f1c2a5e-0000-4000-8000-000000000001", "SPAR-Leonding-001");

        List<Query> filters = capturedRequest().query().bool().filter();
        assertTrue(filters.stream().anyMatch(clause -> clause.isTerm() && "storeId".equals(clause.term().field())));
        assertTrue(filters.stream().anyMatch(clause -> clause.isTerm() && "storeCode".equals(clause.term().field())
                && "SPAR-Leonding-001".equals(clause.term().value().stringValue())));
    }

    @Test
    void triggerAndComplementCategoriesAddPrefixAndTermShouldClausesWithBoosts() throws IOException {
        service.findUpsellCandidates(20, null, "SPAR-Leonding-001", List.of("430"), List.of("420"));

        List<Query> should = capturedRequest().query().bool().should();
        assertEquals("1", capturedRequest().query().bool().minimumShouldMatch());

        Query trigger = findPrefix(should, "430/");
        assertEquals(3.0f, trigger.prefix().boost());
        Query triggerExact = findTerm(should, "430");
        assertEquals(3.0f, triggerExact.term().boost());

        Query complement = findPrefix(should, "420/");
        assertEquals(2.0f, complement.prefix().boost());
        Query complementExact = findTerm(should, "420");
        assertEquals(2.0f, complementExact.term().boost());

        Query base = should.stream().filter(Query::isMatchAll).findFirst().orElseThrow();
        assertEquals(0.1f, base.matchAll().boost());
    }

    @Test
    void categoryThatIsBothTriggerAndComplementIsScoredOnlyAsTrigger() throws IOException {
        service.findUpsellCandidates(20, null, null, List.of("430"), List.of("430", "420"));

        List<Query> should = capturedRequest().query().bool().should();
        assertEquals(1, should.stream().filter(clause -> clause.isPrefix() && "430/".equals(clause.prefix().value())).count());
        assertEquals(1, should.stream().filter(clause -> clause.isTerm() && "430".equals(clause.term().value().stringValue())).count());
    }

    @Test
    void sortIsScoreDescendingThenIdAscendingWithUnmappedIdType() throws IOException {
        service.findUpsellCandidates(20, null, null, List.of("430"), List.of());

        var sort = capturedRequest().sort();
        assertEquals(2, sort.size());
        assertTrue(sort.get(0).isScore());
        assertEquals(SortOrder.Desc, sort.get(0).score().order());
        assertTrue(sort.get(1).isField());
        assertEquals("id", sort.get(1).field().field());
        assertEquals(SortOrder.Asc, sort.get(1).field().order());
        assertEquals(org.opensearch.client.opensearch._types.mapping.FieldType.Integer, sort.get(1).field().unmappedType());
    }

    @Test
    void oldThreeArgOverloadUsesOnlyBaseClauseAndClampsSize() throws IOException {
        service.findUpsellCandidates(500, null, null);
        SearchRequest large = capturedRequest();
        assertEquals(200, large.size().intValue());
        assertEquals(1, large.query().bool().should().size());
        assertTrue(large.query().bool().should().get(0).isMatchAll());

        service.findUpsellCandidates(0, null, null);
        assertEquals(1, capturedRequestAt(1).size().intValue());

        service.findUpsellCandidates(null, null, null);
        assertEquals(50, capturedRequestAt(2).size().intValue());
    }

    @Test
    void emptyCategoriesStillReturnAllProductsThroughBaseClause() throws IOException {
        service.findUpsellCandidates(20, null, null, List.of(" ", ""), null);

        List<Query> should = capturedRequest().query().bool().should();
        assertEquals(1, should.size());
        assertTrue(should.get(0).isMatchAll());
    }

    @Test
    void unscopedOverloadKeepsExistsExclusionsAndScoresCategories() throws IOException {
        service.findUnscopedUpsellCandidates(20, List.of("525"), List.of("445"));

        SearchRequest request = capturedRequest();
        List<Query> excluded = request.query().bool().mustNot();
        assertEquals(2, excluded.size());
        assertTrue(excluded.stream().allMatch(Query::isExists));
        assertEquals(3.0f, findPrefix(request.query().bool().should(), "525/").prefix().boost());
        assertEquals(2.0f, findPrefix(request.query().bool().should(), "445/").prefix().boost());
        assertEquals(SortOrder.Desc, request.sort().get(0).score().order());
        assertEquals("id", request.sort().get(1).field().field());
    }

    @Test
    void unscopedOneArgOverloadStillQueriesWithoutCategoryClauses() throws IOException {
        service.findUnscopedUpsellCandidates(20);

        List<Query> should = capturedRequest().query().bool().should();
        assertEquals(1, should.size());
        assertFalse(should.get(0).isPrefix());
    }

    private static Query findPrefix(List<Query> should, String value) {
        return should.stream()
                .filter(clause -> clause.isPrefix() && value.equals(clause.prefix().value()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("missing prefix clause " + value));
    }

    private static Query findTerm(List<Query> should, String value) {
        return should.stream()
                .filter(clause -> clause.isTerm() && value.equals(clause.term().value().stringValue()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("missing term clause " + value));
    }

    private SearchRequest capturedRequest() throws IOException {
        return capturedRequestAt(-1);
    }

    /** Index into all captured requests in call order; -1 means the most recent one. */
    private SearchRequest capturedRequestAt(int index) throws IOException {
        ArgumentCaptor<SearchRequest> captor = ArgumentCaptor.forClass(SearchRequest.class);
        verify(client, org.mockito.Mockito.atLeastOnce()).search(captor.capture(), eq(Product.class));
        List<SearchRequest> all = captor.getAllValues();
        return index < 0 ? all.get(all.size() - 1) : all.get(index);
    }
}
