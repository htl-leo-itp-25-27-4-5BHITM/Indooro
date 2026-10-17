package at.htl.admin.service;

import at.htl.admin.dto.UpsellDtos;
import at.htl.admin.entity.UpsellSuggestionCacheEntity;
import at.htl.admin.repository.UpsellSuggestionCacheRepository;
import at.htl.model.Product;
import at.htl.service.OpenSearchService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UpsellSuggestionServiceTest {

    UpsellSuggestionService service;
    FakeOpenSearchService openSearchService;

    @BeforeEach
    void setUp() {
        service = new UpsellSuggestionService();
        openSearchService = new FakeOpenSearchService();
        configureService(service);
    }

    private void configureService(UpsellSuggestionService target) {
        target.openSearchService = openSearchService;
        target.objectMapper = new ObjectMapper().findAndRegisterModules();
        target.cacheRepository = new FakeCacheRepository();
        target.upsellEnabled = true;
        target.openAiEnabled = false;
        target.maxCandidates = 50;
        target.maxSuggestions = 3;
        target.minConfidence = 0.45;
        target.cacheTtlMinutes = 60;
        target.openAiApiKey = java.util.Optional.empty();
        target.openAiModel = "test-model";
        target.openAiTimeoutMs = 1000;
        target.perOpportunityCandidates = 10;
        target.minDeterministicScore = 40;
    }

    @Test
    void fallbackSuggestionsExcludeCheckedCurrentAndCompletedProducts() {
        UpsellDtos.UpsellSuggestionResponse response = service.suggestions(new UpsellDtos.UpsellSuggestionRequest(
                null,
                null,
                1,
                "local-list",
                List.of(3),
                List.of(4),
                "shopping_session",
                null
        ));

        List<Integer> ids = response.suggestions().stream()
                .map(suggestion -> suggestion.product().id())
                .toList();

        assertFalse(ids.contains(1));
        assertFalse(ids.contains(3));
        assertFalse(ids.contains(4));
        assertFalse(ids.isEmpty());
        assertEquals("fallback", response.source());
    }

    @Test
    void fallbackSuggestionsExcludeAcceptedUpsellWhenItIsInCurrentListInput() {
        UpsellDtos.UpsellSuggestionResponse response = service.suggestions(new UpsellDtos.UpsellSuggestionRequest(
                null,
                null,
                1,
                "local-list",
                List.of(2),
                List.of(),
                "shopping_session",
                null
        ));

        List<Integer> ids = response.suggestions().stream()
                .map(suggestion -> suggestion.product().id())
                .toList();

        assertFalse(ids.contains(1));
        assertFalse(ids.contains(2));
        assertFalse(ids.isEmpty());
        assertEquals("fallback", response.source());
    }

    @Test
    void invalidCheckedProductReturnsNotFound() {
        jakarta.ws.rs.NotFoundException exception = assertThrows(
                jakarta.ws.rs.NotFoundException.class,
                () -> service.suggestions(new UpsellDtos.UpsellSuggestionRequest(
                        null,
                        null,
                        999,
                        "local-list",
                        List.of(),
                        List.of(),
                        "shopping_session",
                        null
                ))
        );

        assertEquals(404, exception.getResponse().getStatus());
    }

    @Test
    void disabledUpsellReturnsEmptyDisabledResponseWithoutOpenAiKey() {
        service.upsellEnabled = false;
        service.openAiEnabled = true;
        service.openAiApiKey = Optional.empty();

        UpsellDtos.UpsellSuggestionResponse response = service.suggestions(new UpsellDtos.UpsellSuggestionRequest(
                null,
                null,
                1,
                "local-list",
                List.of(),
                List.of(),
                "shopping_session",
                null
        ));

        assertEquals("disabled", response.source());
        assertTrue(response.suggestions().isEmpty());
    }

    @Test
    void storeFallbackNeverSuggestsProductsFromOtherMarkets() {
        openSearchService.storeScopedEmpty = true;
        openSearchService.foreignStoreProducts.add(
                new Product(200, "Fremdmarkt-Artikel", 1.0, "310/1/1/9", "other-store-id", "OTHER-001"));

        UpsellDtos.UpsellSuggestionResponse response = service.suggestions(new UpsellDtos.UpsellSuggestionRequest(
                null,
                "SPAR-Leonding-001",
                1,
                "local-list",
                List.of(),
                List.of(),
                "shopping_session",
                null
        ));

        List<Integer> ids = response.suggestions().stream()
                .map(suggestion -> suggestion.product().id())
                .toList();
        assertFalse(ids.isEmpty());
        assertFalse(ids.contains(200), ids::toString);
        assertTrue(response.suggestions().stream().allMatch(suggestion -> suggestion.product().storeCode() == null));
    }

    @Test
    void emptyCandidatePoolReturnsEmptySuggestions() {
        openSearchService.emptyCandidates = true;

        UpsellDtos.UpsellSuggestionResponse response = service.suggestions(new UpsellDtos.UpsellSuggestionRequest(
                null,
                null,
                1,
                "local-list",
                List.of(),
                List.of(),
                "shopping_session",
                null
        ));

        assertEquals("none", response.source());
        assertTrue(response.suggestions().isEmpty());
    }

    @Test
    void suggestionResponsesAreReturnedFromCacheForMatchingContext() {
        UpsellDtos.UpsellSuggestionRequest request = new UpsellDtos.UpsellSuggestionRequest(
                null,
                null,
                1,
                "local-list",
                List.of(1, 3),
                List.of(4),
                "shopping_session",
                null
        );

        UpsellDtos.UpsellSuggestionResponse first = service.suggestions(request);
        int lookupsAfterFirstCall = openSearchService.productLookups;

        UpsellDtos.UpsellSuggestionResponse second = service.suggestions(request);

        assertEquals("fallback", first.source());
        assertEquals("cache", second.source());
        assertEquals(lookupsAfterFirstCall, openSearchService.productLookups);
        assertEquals(first.suggestions().stream().map(suggestion -> suggestion.product().id()).toList(),
                second.suggestions().stream().map(suggestion -> suggestion.product().id()).toList());
    }

    @Test
    void planResponsesGroupStationOpportunitiesAndExcludeListProductsWithoutServerFallback() {
        UpsellDtos.UpsellPlanResponse response = service.plan(new UpsellDtos.UpsellPlanRequest(
                null,
                "SPAR",
                "local-list",
                List.of(1, 3),
                List.of(),
                "shopping_session",
                List.of(new UpsellDtos.UpsellOpportunityRequest(
                        "station:shelf-430",
                        List.of(1, 3),
                        List.of("Spaghetti", "Tomatensauce")
                ))
        ));

        assertEquals("none", response.source());
        assertEquals(1, response.opportunities().size());
        assertEquals("station:shelf-430", response.opportunities().get(0).opportunityId());

        List<Integer> ids = response.opportunities().get(0).suggestions().stream()
                .map(suggestion -> suggestion.product().id())
                .toList();

        assertFalse(ids.contains(1));
        assertFalse(ids.contains(3));
        assertTrue(ids.isEmpty());
        assertEquals("openai_unavailable_timeout_or_invalid", response.debug().fallbackReason());
    }

    @Test
    void planResponsesIncludeMultipleOpportunities() {
        UpsellDtos.UpsellPlanResponse response = service.plan(new UpsellDtos.UpsellPlanRequest(
                null,
                "SPAR",
                "local-list",
                List.of(),
                List.of(),
                "shopping_session",
                List.of(
                        new UpsellDtos.UpsellOpportunityRequest(
                                "station:shelf-430",
                                List.of(1),
                                List.of("Spaghetti")
                        ),
                        new UpsellDtos.UpsellOpportunityRequest(
                                "station:shelf-525",
                                List.of(4),
                                List.of("Basilikum")
                        )
                )
        ));

        assertEquals("none", response.source());
        assertEquals(2, response.opportunities().size());
        assertEquals("station:shelf-430", response.opportunities().get(0).opportunityId());
        assertEquals("station:shelf-525", response.opportunities().get(1).opportunityId());
    }

    @Test
    void emptyPlanCandidatePoolReturnsEmptyOpportunitySuggestions() {
        openSearchService.emptyCandidates = true;

        UpsellDtos.UpsellPlanResponse response = service.plan(new UpsellDtos.UpsellPlanRequest(
                null,
                "SPAR",
                "local-list",
                List.of(),
                List.of(),
                "shopping_session",
                List.of(new UpsellDtos.UpsellOpportunityRequest(
                        "station:shelf-430",
                        List.of(1),
                        List.of("Spaghetti")
                ))
        ));

        assertEquals("none", response.source());
        assertEquals(1, response.opportunities().size());
        assertTrue(response.opportunities().get(0).suggestions().isEmpty());
        assertEquals("no_candidates", response.debug().fallbackReason());
    }

    @Test
    void invalidEmptyPlanRequestIsRejected() {
        jakarta.ws.rs.WebApplicationException exception = assertThrows(
                jakarta.ws.rs.WebApplicationException.class,
                () -> service.plan(new UpsellDtos.UpsellPlanRequest(
                        null,
                        "SPAR",
                        "local-list",
                        List.of(),
                        List.of(),
                        "shopping_session",
                        List.of()
                ))
        );

        assertEquals(400, exception.getResponse().getStatus());
    }

    @Test
    void planResponsesAreReturnedFromCacheForMatchingRouteContext() {
        UpsellDtos.UpsellPlanRequest request = new UpsellDtos.UpsellPlanRequest(
                null,
                "SPAR",
                "local-list",
                List.of(1, 3),
                List.of(),
                "shopping_session",
                List.of(new UpsellDtos.UpsellOpportunityRequest(
                        "station:shelf-430",
                        List.of(1, 3),
                        List.of("Spaghetti", "Tomatensauce")
                ))
        );

        UpsellDtos.UpsellPlanResponse first = service.plan(request);
        int lookupsAfterFirstCall = openSearchService.productLookups;

        UpsellDtos.UpsellPlanResponse second = service.plan(request);

        assertEquals("none", first.source());
        assertEquals("cache", second.source());
        assertEquals(lookupsAfterFirstCall, openSearchService.productLookups);
        assertEquals(
                first.opportunities().get(0).suggestions().stream().map(suggestion -> suggestion.product().id()).toList(),
                second.opportunities().get(0).suggestions().stream().map(suggestion -> suggestion.product().id()).toList()
        );
    }

    @Test
    void contextHashMatchesPreloadAndCompletedFormsForSameOpportunity() {
        UpsellDtos.UpsellSuggestionRequest preload = new UpsellDtos.UpsellSuggestionRequest(
                null,
                "SPAR",
                1,
                "local-list",
                List.of(1, 3),
                List.of(4),
                "shopping_session",
                null
        );
        UpsellDtos.UpsellSuggestionRequest completed = new UpsellDtos.UpsellSuggestionRequest(
                null,
                "spar",
                1,
                "local-list",
                List.of(3),
                List.of(1, 4),
                "shopping_session",
                null
        );

        assertEquals(service.contextHash(preload), service.contextHash(completed));
    }

    @Test
    void validatedSuggestionsDiscardUnknownAiProductIds() {
        Map<Integer, Product> candidateMap = Map.of(
                2, new Product(2, "Parmesan", 2.99, "525/1/1/1")
        );

        List<UpsellDtos.UpsellSuggestion> suggestions = service.validatedSuggestions(
                List.of(
                        new UpsellDtos.AiSuggestion(999, "Unbekannt", 0.99),
                        new UpsellDtos.AiSuggestion(2, "Passt gut dazu.", 0.90)
                ),
                candidateMap
        );

        assertEquals(1, suggestions.size());
        assertEquals(2, suggestions.get(0).product().id());
    }

    @Test
    void lowConfidenceSuggestionsAreDiscarded() {
        Map<Integer, Product> candidateMap = Map.of(
                2, new Product(2, "Parmesan", 2.99, "525/1/1/1")
        );

        List<UpsellDtos.UpsellSuggestion> suggestions = service.validatedSuggestions(
                List.of(new UpsellDtos.AiSuggestion(2, "Passt gut dazu.", 0.10)),
                candidateMap
        );

        assertTrue(suggestions.isEmpty());
    }

    @Test
    void categoryExtractionHandlesInvalidLayoutCodes() {
        assertEquals("525", service.categoryCode("525/1/1/1"));
        assertEquals("430", service.categoryCode(" 430 "));
        assertEquals("invalid", service.categoryCode("invalid"));
        assertEquals(null, service.categoryCode(null));
        assertEquals(null, service.categoryCode(" "));
    }

    @Test
    void productNameNormalizationAddsGermanSafeAliasTokens() {
        assertTrue(service.productNameTokens("Aepfel & Joghurt").contains("aepfel"));
        assertTrue(service.productNameTokens("Aepfel & Joghurt").contains("fruit"));
        assertTrue(service.productNameTokens("Aepfel & Joghurt").contains("dairy"));
        assertTrue(service.productNameTokens("Olivenoel").contains("oil"));
    }

    @Test
    void planPromptRejectsAlternativeBrandsSizesAndVariants() throws IOException {
        Product candidate = new Product(43, "Bio Aepfel lose", 3.49, "310/1/1/2");
        UpsellDtos.UpsellOpportunityRequest opportunity = new UpsellDtos.UpsellOpportunityRequest(
                "item:apple",
                List.of(40),
                List.of("Aepfel 1kg")
        );
        UpsellSuggestionService.ScoredCandidate scoredCandidate = new UpsellSuggestionService.ScoredCandidate(
                candidate,
                "310",
                service.classifyProduct(candidate),
                0,
                List.of(),
                true
        );

        String requestJson = service.objectMapper.writeValueAsString(service.openAiPlanRequestBody(List.of(
                new UpsellSuggestionService.RankedOpportunity(opportunity, null, List.of(scoredCandidate))
        )));

        assertTrue(requestJson.contains("same product type in another brand, package size, flavor, or variant"));
        assertTrue(requestJson.contains("complements, not alternatives"));
    }

    @Test
    void unavailableAiReturnsNoButterFallbackInsteadOfServerGuessing() {
        UpsellDtos.UpsellPlanResponse response = service.plan(new UpsellDtos.UpsellPlanRequest(
                null,
                "SPAR",
                "local-list",
                List.of(30),
                List.of(),
                "shopping_session",
                List.of(new UpsellDtos.UpsellOpportunityRequest(
                        "station:shelf-525",
                        List.of(30),
                        List.of("Butter 250g")
                ))
        ));

        List<Integer> ids = response.opportunities().get(0).suggestions().stream()
                .map(suggestion -> suggestion.product().id())
                .toList();

        assertEquals("none", response.source());
        assertFalse(ids.contains(1));
        assertFalse(ids.contains(3));
        assertTrue(ids.isEmpty());
    }

    @Test
    void unavailableAiReturnsEmptySuggestionsForEachOpportunity() {
        UpsellDtos.UpsellPlanResponse response = service.plan(new UpsellDtos.UpsellPlanRequest(
                null,
                "SPAR",
                "local-list",
                List.of(1, 30),
                List.of(),
                "shopping_session",
                List.of(
                        new UpsellDtos.UpsellOpportunityRequest(
                                "station:pasta",
                                List.of(1),
                                List.of("Spaghetti")
                        ),
                        new UpsellDtos.UpsellOpportunityRequest(
                                "station:butter",
                                List.of(30),
                                List.of("Butter")
                        )
                )
        ));

        List<Integer> pastaIds = response.opportunities().get(0).suggestions().stream()
                .map(suggestion -> suggestion.product().id())
                .toList();
        List<Integer> butterIds = response.opportunities().get(1).suggestions().stream()
                .map(suggestion -> suggestion.product().id())
                .toList();

        assertTrue(pastaIds.isEmpty());
        assertFalse(butterIds.contains(3));
        assertTrue(butterIds.isEmpty());
    }

    @Test
    void unavailableAiReturnsNoFruitFallbackInsteadOfServerGuessing() {
        UpsellDtos.UpsellPlanResponse response = service.plan(new UpsellDtos.UpsellPlanRequest(
                null,
                "SPAR",
                "local-list",
                List.of(40),
                List.of(),
                "shopping_session",
                List.of(new UpsellDtos.UpsellOpportunityRequest(
                        "station:fruit",
                        List.of(40),
                        List.of("Aepfel")
                ))
        ));

        List<Integer> ids = response.opportunities().get(0).suggestions().stream()
                .map(suggestion -> suggestion.product().id())
                .toList();

        assertEquals("none", response.source());
        assertTrue(ids.isEmpty(), ids::toString);
    }

    @Test
    void unavailableAiReturnsNoOatsFallbackInsteadOfServerGuessing() {
        UpsellDtos.UpsellPlanResponse response = service.plan(new UpsellDtos.UpsellPlanRequest(
                null,
                "SPAR",
                "local-list",
                List.of(42),
                List.of(),
                "shopping_session",
                List.of(new UpsellDtos.UpsellOpportunityRequest(
                        "station:oats",
                        List.of(42),
                        List.of("Haferflocken")
                ))
        ));

        List<Integer> ids = response.opportunities().get(0).suggestions().stream()
                .map(suggestion -> suggestion.product().id())
                .toList();

        assertEquals("none", response.source());
        assertTrue(ids.isEmpty(), ids::toString);
    }

    @Test
    void unknownCategoryCanReturnNoRankedCandidatesInsteadOfFabricatingProducts() {
        UpsellDtos.UpsellPlanResponse response = service.plan(new UpsellDtos.UpsellPlanRequest(
                null,
                "SPAR",
                "local-list",
                List.of(60),
                List.of(),
                "shopping_session",
                List.of(new UpsellDtos.UpsellOpportunityRequest(
                        "station:unknown",
                        List.of(60),
                        List.of("Batterie")
                ))
        ));

        assertEquals("none", response.source());
        assertTrue(response.opportunities().get(0).suggestions().isEmpty());
        assertEquals("openai_unavailable_timeout_or_invalid", response.debug().fallbackReason());
    }

    @Test
    void productClassificationCoversSafetyDomainsAndClassesInternally() {
        assertEquals(UpsellSuggestionService.ProductFamily.BUTTER,
                service.classifyProduct(new Product(30, "Butter 250g", 2.39, "525/1/1/2")).family());
        assertEquals("apple",
                service.classifyProduct(new Product(40, "Bio Aepfel 1kg", 2.99, "310/1/1/1")).classKey());
        assertEquals("flour",
                service.classifyProduct(new Product(23, "Weizenmehl 1kg", 0.99, "445/1/1/1")).classKey());
        assertEquals(UpsellSuggestionService.ProductDomain.DRINK,
                service.classifyProduct(new Product(70, "Coca-Cola 1.5L", 1.79, "700/1/1/1")).domain());
        assertEquals(UpsellSuggestionService.ProductDomain.CLEANING,
                service.classifyProduct(new Product(90, "Frosch Citrus Dusche & Bad-Reiniger", 2.99, "800/1/1/1")).domain());
        assertEquals(UpsellSuggestionService.ProductDomain.LAUNDRY,
                service.classifyProduct(new Product(100, "Weichspueler Sommerfrische", 2.49, "810/1/1/1")).domain());
        assertEquals(UpsellSuggestionService.ProductDomain.UNKNOWN,
                service.classifyProduct(new Product(60, "Batterie AA 4er", 3.99, "999/1/1/1")).domain());
    }

    @Test
    void colaDoesNotFallbackToFlourPastaButterOrEggs() {
        UpsellDtos.UpsellPlanResponse response = service.plan(new UpsellDtos.UpsellPlanRequest(
                null,
                "SPAR",
                "local-list",
                List.of(70),
                List.of(),
                "shopping_session",
                List.of(new UpsellDtos.UpsellOpportunityRequest(
                        "item:cola",
                        List.of(70),
                        List.of("Coca-Cola 1.5L")
                ))
        ));

        List<Integer> ids = response.opportunities().get(0).suggestions().stream()
                .map(suggestion -> suggestion.product().id())
                .toList();

        assertFalse(ids.contains(1), ids::toString);
        assertFalse(ids.contains(23), ids::toString);
        assertFalse(ids.contains(22), ids::toString);
        assertFalse(ids.contains(30), ids::toString);
        assertTrue(ids.isEmpty() || ids.contains(71), ids::toString);
    }

    @Test
    void unavailableAiReturnsNoRisottoFallbackInsteadOfServerGuessing() {
        UpsellDtos.UpsellPlanResponse response = service.plan(new UpsellDtos.UpsellPlanRequest(
                null,
                "SPAR",
                "local-list",
                List.of(80),
                List.of(),
                "shopping_session",
                List.of(new UpsellDtos.UpsellOpportunityRequest(
                        "item:risotto",
                        List.of(80),
                        List.of("Risotto Reis")
                ))
        ));

        List<Integer> ids = response.opportunities().get(0).suggestions().stream()
                .map(suggestion -> suggestion.product().id())
                .toList();

        assertEquals("none", response.source());
        assertTrue(ids.isEmpty(), ids::toString);
    }

    @Test
    void cleanerDoesNotReceiveFoodSuggestions() {
        UpsellDtos.UpsellPlanResponse response = service.plan(new UpsellDtos.UpsellPlanRequest(
                null,
                "SPAR",
                "local-list",
                List.of(90),
                List.of(),
                "shopping_session",
                List.of(new UpsellDtos.UpsellOpportunityRequest(
                        "item:cleaner",
                        List.of(90),
                        List.of("Bad-Reiniger")
                ))
        ));

        List<Integer> ids = response.opportunities().get(0).suggestions().stream()
                .map(suggestion -> suggestion.product().id())
                .toList();

        assertFalse(ids.stream().anyMatch(id -> List.of(1, 2, 3, 23, 40, 41, 42, 70, 80).contains(id)), ids::toString);
        assertTrue(ids.isEmpty() || ids.stream().allMatch(id -> List.of(91, 92, 93, 94).contains(id)), ids::toString);
    }

    @Test
    void softenerReceivesOnlyLaundrySuggestionsOrEmptyResult() {
        UpsellDtos.UpsellPlanResponse response = service.plan(new UpsellDtos.UpsellPlanRequest(
                null,
                "SPAR",
                "local-list",
                List.of(100),
                List.of(),
                "shopping_session",
                List.of(new UpsellDtos.UpsellOpportunityRequest(
                        "item:softener",
                        List.of(100),
                        List.of("Weichspueler")
                ))
        ));

        List<Integer> ids = response.opportunities().get(0).suggestions().stream()
                .map(suggestion -> suggestion.product().id())
                .toList();

        assertFalse(ids.stream().anyMatch(id -> List.of(1, 2, 3, 23, 40, 41, 42, 70, 80, 90, 91).contains(id)), ids::toString);
        assertTrue(ids.isEmpty() || ids.stream().allMatch(id -> List.of(101, 102).contains(id)), ids::toString);
    }

    @Test
    void unavailableAiReturnsNoAppleFallbackInsteadOfServerGuessing() {
        UpsellDtos.UpsellPlanResponse response = service.plan(new UpsellDtos.UpsellPlanRequest(
                null,
                "SPAR",
                "local-list",
                List.of(40),
                List.of(),
                "shopping_session",
                List.of(new UpsellDtos.UpsellOpportunityRequest(
                        "item:apple",
                        List.of(40),
                        List.of("Aepfel")
                ))
        ));

        List<Integer> ids = response.opportunities().get(0).suggestions().stream()
                .map(suggestion -> suggestion.product().id())
                .toList();

        assertEquals("none", response.source());
        assertTrue(ids.isEmpty(), ids::toString);
    }

    @Test
    void planLevelDedupeKeepsFlourClassOnOnlyOneOpportunity() {
        UpsellDtos.UpsellPlanResponse response = service.plan(new UpsellDtos.UpsellPlanRequest(
                null,
                "SPAR",
                "local-list",
                List.of(30, 22),
                List.of(),
                "shopping_session",
                List.of(
                        new UpsellDtos.UpsellOpportunityRequest(
                                "item:butter",
                                List.of(30),
                                List.of("Butter")
                        ),
                        new UpsellDtos.UpsellOpportunityRequest(
                                "item:eggs",
                                List.of(22),
                                List.of("Eier")
                        )
                )
        ));

        long flourOccurrences = response.opportunities().stream()
                .flatMap(opportunity -> opportunity.suggestions().stream())
                .filter(suggestion -> suggestion.product().id() == 23)
                .count();

        assertTrue(flourOccurrences <= 1, response.opportunities()::toString);
    }

    @Test
    void openAiValidationDiscardsInvalidAndDuplicateProductIdsButKeepsAiSemanticChoices() {
        FakeOpenAiService fakeService = new FakeOpenAiService();
        service = fakeService;
        configureService(service);
        service.openAiEnabled = true;
        service.openAiApiKey = Optional.of("test-key");
        fakeService.openAiSuggestions = List.of(new UpsellDtos.AiOpportunitySuggestion(
                "item:risotto",
                List.of(
                        new UpsellDtos.AiSuggestion(999, "Nicht vorhanden.", 0.99),
                        new UpsellDtos.AiSuggestion(40, "Obst waere falsch.", 0.99),
                        new UpsellDtos.AiSuggestion(2, "Passt gut zu Risotto.", 0.91),
                        new UpsellDtos.AiSuggestion(2, "Duplikat.", 0.90)
                )
        ));

        UpsellDtos.UpsellPlanResponse response = service.plan(new UpsellDtos.UpsellPlanRequest(
                null,
                "SPAR",
                "local-list",
                List.of(80),
                List.of(),
                "shopping_session",
                List.of(new UpsellDtos.UpsellOpportunityRequest(
                        "item:risotto",
                        List.of(80),
                        List.of("Risotto Reis")
                ))
        ));

        List<Integer> ids = response.opportunities().get(0).suggestions().stream()
                .map(suggestion -> suggestion.product().id())
                .toList();

        assertEquals("openai", response.source());
        assertEquals(List.of(40, 2), ids);
        assertTrue(fakeService.openAiCalled);
    }

    @Test
    void openAiUnavailableReturnsEmptyPlanWithoutServerFallbackSuggestions() {
        FakeOpenAiService fakeService = new FakeOpenAiService();
        service = fakeService;
        configureService(service);
        service.openAiEnabled = true;
        service.openAiApiKey = Optional.of("test-key");
        fakeService.openAiSuggestions = null;

        UpsellDtos.UpsellPlanResponse response = service.plan(new UpsellDtos.UpsellPlanRequest(
                null,
                "SPAR",
                "local-list",
                List.of(70),
                List.of(),
                "shopping_session",
                List.of(new UpsellDtos.UpsellOpportunityRequest(
                        "item:cola",
                        List.of(70),
                        List.of("Coca-Cola 1.5L")
                ))
        ));

        List<Integer> ids = response.opportunities().get(0).suggestions().stream()
                .map(suggestion -> suggestion.product().id())
                .toList();

        assertEquals("none", response.source());
        assertTrue(fakeService.openAiCalled);
        assertFalse(ids.contains(23), ids::toString);
        assertFalse(ids.contains(1), ids::toString);
        assertTrue(ids.isEmpty(), ids::toString);
    }

    private static final class FakeOpenSearchService extends OpenSearchService {
        int productLookups = 0;
        boolean emptyCandidates = false;
        boolean storeScopedEmpty = false;
        final Map<Integer, Product> products = new LinkedHashMap<>();
        /** Products of other markets; only the old global (unscoped) candidate query could return them. */
        final List<Product> foreignStoreProducts = new java.util.ArrayList<>();

        FakeOpenSearchService() {
            products.put(1, new Product(1, "Spaghetti", 1.49, "430/1/1/1"));
            products.put(2, new Product(2, "Parmesan", 2.99, "525/1/1/1"));
            products.put(3, new Product(3, "Tomatensauce", 1.99, "420/1/1/1"));
            products.put(4, new Product(4, "Basilikum", 1.29, "310/1/1/1"));
            products.put(5, new Product(5, "Olivenoel", 4.99, "450/1/1/1"));
            products.put(20, new Product(20, "Toastbrot 500g", 1.79, "510/1/1/1"));
            products.put(21, new Product(21, "Marillenmarmelade 450g", 2.49, "470/1/1/1"));
            products.put(22, new Product(22, "Freilandeier 10 Stueck", 3.79, "445/1/1/1"));
            products.put(23, new Product(23, "Weizenmehl 1kg", 0.99, "445/1/1/1"));
            products.put(24, new Product(24, "Vollmilch 1L", 1.39, "520/1/1/1"));
            products.put(30, new Product(30, "Butter 250g", 2.39, "525/1/1/2"));
            products.put(40, new Product(40, "Aepfel 1kg", 2.99, "310/1/1/1"));
            products.put(41, new Product(41, "Naturjoghurt 500g", 1.49, "520/1/1/2"));
            products.put(42, new Product(42, "Haferflocken 500g", 1.19, "440/1/1/1"));
            products.put(43, new Product(43, "Bio Aepfel lose", 3.49, "310/1/1/2"));
            products.put(60, new Product(60, "Batterie AA 4er", 3.99, "999/1/1/1"));
            products.put(70, new Product(70, "Coca-Cola 1.5L", 1.79, "700/1/1/1"));
            products.put(71, new Product(71, "S-BUDGET Chips gesalzen", 1.29, "710/1/1/1"));
            products.put(80, new Product(80, "Risotto Reis 500g", 2.19, "450/1/1/2"));
            products.put(81, new Product(81, "Gemuesebruehe Wuerfel", 1.49, "450/1/1/3"));
            products.put(82, new Product(82, "Champignons 250g", 1.99, "310/1/1/3"));
            products.put(83, new Product(83, "Zwiebeln 1kg", 1.49, "310/1/1/4"));
            products.put(90, new Product(90, "Frosch Citrus Dusche & Bad-Reiniger", 2.99, "800/1/1/1"));
            products.put(91, new Product(91, "Kuechenrolle 4 Rollen", 2.49, "820/1/1/1"));
            products.put(92, new Product(92, "Putzschwamm 3er", 1.49, "820/1/1/2"));
            products.put(93, new Product(93, "Muellsack 35L", 1.99, "820/1/1/3"));
            products.put(94, new Product(94, "Reinigungshandschuhe", 2.49, "820/1/1/4"));
            products.put(100, new Product(100, "Weichspueler Sommerfrische", 2.49, "810/1/1/1"));
            products.put(101, new Product(101, "Colorwaschmittel 1L", 4.99, "810/1/1/2"));
            products.put(102, new Product(102, "Fleckenentferner Spray", 3.49, "810/1/1/3"));
        }

        @Override
        public Product getProductById(Integer id) throws IOException {
            productLookups++;
            return products.get(id);
        }

        @Override
        public Product getProductById(Integer id, String storeId, String storeCode) throws IOException {
            return getProductById(id);
        }

        @Override
        public List<Product> findUpsellCandidates(Integer size, String storeId, String storeCode) throws IOException {
            if (emptyCandidates) {
                return List.of();
            }
            boolean scoped = storeId != null || storeCode != null;
            if (scoped && storeScopedEmpty) {
                return List.of();
            }
            List<Product> pool = new java.util.ArrayList<>(products.values());
            if (!scoped) {
                pool.addAll(foreignStoreProducts);
            }
            return pool.stream()
                    .limit(size == null ? pool.size() : size)
                    .toList();
        }

        @Override
        public List<Product> findUnscopedUpsellCandidates(Integer size) throws IOException {
            if (emptyCandidates) {
                return List.of();
            }
            return products.values().stream()
                    .limit(size == null ? products.size() : size)
                    .toList();
        }
    }

    private static final class FakeCacheRepository extends UpsellSuggestionCacheRepository {
        private final Map<String, UpsellSuggestionCacheEntity> entries = new HashMap<>();

        @Override
        public Optional<UpsellSuggestionCacheEntity> findFreshByContextHash(String contextHash, Instant now) {
            return Optional.ofNullable(entries.get(contextHash))
                    .filter(entry -> entry.expiresAt.isAfter(now));
        }

        @Override
        public Optional<UpsellSuggestionCacheEntity> findByContextHash(String contextHash) {
            return Optional.ofNullable(entries.get(contextHash));
        }

        @Override
        public void upsert(UpsellSuggestionCacheEntity incoming) {
            entries.put(incoming.contextHash, incoming);
        }
    }

    private static final class FakeOpenAiService extends UpsellSuggestionService {
        List<UpsellDtos.AiOpportunitySuggestion> openAiSuggestions;
        boolean openAiCalled = false;

        @Override
        Optional<OpenAiPlanResult> rankPlanWithOpenAi(List<RankedOpportunity> rankedOpportunities, String requestId) {
            openAiCalled = true;
            if (openAiSuggestions == null) {
                return Optional.empty();
            }
            return Optional.of(new OpenAiPlanResult(
                    openAiSuggestions,
                    new UpsellDtos.UpsellPlanDebug(
                            requestId,
                            openAiModel,
                            "openai",
                            null,
                            12L,
                            30,
                            12,
                            42,
                            0,
                            0,
                            null,
                            rankedOpportunities.size(),
                            rankedOpportunities.stream().mapToInt(opportunity -> opportunity.candidates().size()).sum()
                    )
            ));
        }
    }
}
