package at.htl.admin.service;

import at.htl.admin.dto.UpsellDtos;
import at.htl.admin.entity.UpsellDismissalEntity;
import at.htl.admin.entity.UpsellSuggestionCacheEntity;
import at.htl.admin.repository.UpsellDismissalRepository;
import at.htl.admin.repository.UpsellSuggestionCacheRepository;
import at.htl.model.Product;
import at.htl.service.OpenSearchService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.Collection;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UpsellSuggestionServiceTest {

    UpsellSuggestionService service;
    FakeOpenSearchService openSearchService;
    FakeDismissalRepository dismissals;

    @BeforeEach
    void setUp() {
        service = new UpsellSuggestionService();
        openSearchService = new FakeOpenSearchService();
        dismissals = new FakeDismissalRepository();
        configureService(service);
    }

    private void configureService(UpsellSuggestionService target) {
        target.openSearchService = openSearchService;
        target.objectMapper = new ObjectMapper().findAndRegisterModules();
        target.cacheRepository = new FakeCacheRepository();
        target.dismissalRepository = dismissals;
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
                null,
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
                null,
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
                        null,
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
                null,
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
                null,
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
                null,
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
                null,
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
                )),
                null
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
                ),
                null
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
                )),
                null
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
                        List.of(),
                        null
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
                )),
                null
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
                null,
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
                null,
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
                )),
                null
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
                ),
                null
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
                )),
                null
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
                )),
                null
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
                )),
                null
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
                )),
                null
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
                )),
                null
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
                )),
                null
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
                )),
                null
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
                )),
                null
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
                ),
                null
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
                )),
                null
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
                )),
                null
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

    // ---- Candidate lookup failures, empty results and OpenAI call counts (6.x) ----

    @Test
    void candidateLookupFailureIsRetryableNotCachedAndSkipsOpenAi() {
        FakeOpenAiService fakeService = useFakeOpenAi();
        fakeService.openAiSuggestions = List.of(aiOpportunity("item:apple", suggestion(41)));
        openSearchService.failCandidateLookup = true;
        UpsellDtos.UpsellPlanRequest request = applePlanRequest();

        UpsellDtos.UpsellPlanResponse failed = service.plan(request);

        assertEquals("none", failed.source());
        assertTrue(failed.opportunities().get(0).suggestions().isEmpty());
        UpsellDtos.UpsellPlanDebug debug = failed.debug();
        assertNotNull(debug.requestId());
        assertFalse(debug.requestId().isBlank());
        assertEquals("candidate_lookup_failed", debug.fallbackReason());
        assertEquals(Boolean.TRUE, debug.retryable());
        assertEquals(Integer.valueOf(0), debug.candidateCount());
        assertNoTokenFields(debug);
        assertEquals(0, fakeService.rankPlanCalls);
        assertFalse(fakeService.openAiCalled);

        // Nothing was cached, so the same request with a working catalog is computed normally.
        openSearchService.failCandidateLookup = false;
        UpsellDtos.UpsellPlanResponse retried = service.plan(request);

        assertEquals("openai", retried.source());
        assertEquals(List.of(41), suggestionIds(retried.opportunities().get(0)));
        assertEquals(1, fakeService.rankPlanCalls);
    }

    @Test
    void planResolvesAllTriggerAndListProductsWithExactlyOneBatchLookup() {
        UpsellDtos.UpsellPlanResponse response = service.plan(planRequest(
                List.of(40),
                List.of(41),
                opportunity("station:1", List.of(1, 2), "Spaghetti", "Parmesan"),
                opportunity("station:2", List.of(3, 4)),
                opportunity("station:3", List.of(20, 21)),
                opportunity("station:4", List.of(22, 23)),
                opportunity("station:5", List.of(24, 30))
        ));

        assertEquals(5, response.opportunities().size());
        assertEquals(1, openSearchService.batchLookups);
        assertEquals(0, openSearchService.productLookups);
    }

    @Test
    void planCandidateQueryCarriesTriggerAndComplementCategoriesOfAllOpportunities() {
        service.plan(planRequest(
                List.of(),
                List.of(),
                opportunity("station:1", List.of(1), "Spaghetti"),
                opportunity("station:2", List.of(30))
        ));

        assertEquals(List.of("430", "525"), openSearchService.lastTriggerCategories);
        assertTrue(openSearchService.lastComplementaryCategories.containsAll(List.of("420", "450", "445", "510", "520")));
    }

    @Test
    void failedBatchLookupKeepsPlanTolerantAndStillRunsCandidateQuery() {
        openSearchService.failProductBatch = true;

        UpsellDtos.UpsellPlanResponse response = service.plan(planRequest(
                List.of(40),
                List.of(),
                opportunity("station:1", List.of(1, 2), "Spaghetti", "Parmesan")
        ));

        assertEquals(1, response.opportunities().size());
        assertEquals(1, openSearchService.batchLookups);
        assertEquals(0, openSearchService.productLookups);
        assertFalse("candidate_lookup_failed".equals(response.debug().fallbackReason()));
        assertEquals(List.of(), openSearchService.lastTriggerCategories);
    }

    @Test
    void singleSuggestionResolvesListWithOneBatchLookupAndPassesCheckedCategory() {
        UpsellDtos.UpsellSuggestionResponse response = service.suggestions(new UpsellDtos.UpsellSuggestionRequest(
                null,
                null,
                1,
                "local-list",
                List.of(3, 40),
                List.of(41),
                "shopping_session",
                null,
                null
        ));

        assertNotNull(response);
        assertEquals(1, openSearchService.batchLookups);
        // Only the checked product itself is looked up one by one (store-scoped), never the list entries.
        assertEquals(1, openSearchService.productLookups);
        assertEquals(List.of("430"), openSearchService.lastTriggerCategories);
        assertTrue(openSearchService.lastComplementaryCategories.containsAll(List.of("420", "450", "525", "445")));
    }

    @Test
    void failedBatchLookupKeepsSingleSuggestionTolerant() {
        openSearchService.failProductBatch = true;

        UpsellDtos.UpsellSuggestionResponse response = service.suggestions(new UpsellDtos.UpsellSuggestionRequest(
                null,
                null,
                1,
                "local-list",
                List.of(3, 40),
                List.of(41),
                "shopping_session",
                null,
                null
        ));

        assertNotNull(response);
        assertEquals(1, openSearchService.batchLookups);
        assertEquals(List.of("430"), openSearchService.lastTriggerCategories);
    }

    @Test
    void emptyCandidateLookupIsCachedAsNonRetryableNoCandidates() {
        FakeOpenAiService fakeService = useFakeOpenAi();
        // Both the store-scoped and the unscoped lookup come back empty (applePlanRequest also queries unscoped).
        openSearchService.emptyCandidates = true;

        UpsellDtos.UpsellPlanResponse first = service.plan(applePlanRequest());

        assertEquals("none", first.source());
        assertEquals("no_candidates", first.debug().fallbackReason());
        assertEquals(Boolean.FALSE, first.debug().retryable());
        assertEquals(Integer.valueOf(0), first.debug().candidateCount());
        assertNoTokenFields(first.debug());
        assertEquals(0, fakeService.rankPlanCalls);

        UpsellDtos.UpsellPlanResponse second = service.plan(applePlanRequest());

        assertEquals("cache", second.source());
        assertEquals("no_candidates", second.debug().fallbackReason());
        assertEquals(0, fakeService.rankPlanCalls);
    }

    @Test
    void candidatesAllExcludedByContractAreCachedAsGenuineEmptyResult() {
        FakeOpenAiService fakeService = useFakeOpenAi();
        // The catalog is not empty, but every product is the trigger, on the current list or already completed.
        List<Integer> others = openSearchService.products.keySet().stream()
                .filter(id -> id != 40)
                .toList();
        int half = others.size() / 2;
        UpsellDtos.UpsellPlanRequest request = planRequest(
                others.subList(0, half),
                others.subList(half, others.size()),
                opportunity("item:apple", List.of(40), "Aepfel 1kg")
        );

        UpsellDtos.UpsellPlanResponse first = service.plan(request);

        assertEquals("none", first.source());
        assertEquals("no_candidates", first.debug().fallbackReason());
        assertEquals(Boolean.FALSE, first.debug().retryable());
        assertEquals(Integer.valueOf(0), first.debug().candidateCount());
        assertNoTokenFields(first.debug());
        assertEquals(0, fakeService.rankPlanCalls);

        UpsellDtos.UpsellPlanResponse second = service.plan(request);

        assertEquals("cache", second.source());
        assertEquals(0, fakeService.rankPlanCalls);
    }

    @Test
    void emptyOpenAiSuggestionsAreCachedAsSuccessfulNonRetryableResult() {
        FakeOpenAiService fakeService = useFakeOpenAi();
        fakeService.openAiSuggestions = List.of(aiOpportunity("item:apple"));

        UpsellDtos.UpsellPlanResponse first = service.plan(applePlanRequest());

        assertEquals("openai", first.source());
        assertTrue(first.opportunities().get(0).suggestions().isEmpty());
        assertEquals(Boolean.FALSE, first.debug().retryable());
        assertNull(first.debug().fallbackReason());
        assertEquals(1, fakeService.rankPlanCalls);

        UpsellDtos.UpsellPlanResponse second = service.plan(applePlanRequest());

        assertEquals("cache", second.source());
        assertEquals(1, fakeService.rankPlanCalls);
    }

    @Test
    void cachedOpenAiPlanDoesNotCallOpenAiAgain() {
        FakeOpenAiService fakeService = useFakeOpenAi();
        fakeService.openAiSuggestions = List.of(aiOpportunity("item:apple", suggestion(41)));
        UpsellDtos.UpsellPlanRequest request = applePlanRequest();

        UpsellDtos.UpsellPlanResponse first = service.plan(request);
        UpsellDtos.UpsellPlanResponse second = service.plan(request);

        assertEquals("openai", first.source());
        assertEquals("cache", second.source());
        assertEquals(1, fakeService.rankPlanCalls);
        assertEquals(List.of(41), suggestionIds(second.opportunities().get(0)));
        assertEquals(Integer.valueOf(30), first.debug().inputTokens());
        assertEquals(Integer.valueOf(12), first.debug().outputTokens());
        assertEquals(Integer.valueOf(42), first.debug().totalTokens());
        assertEquals(Integer.valueOf(first.debug().inputTokens() + first.debug().outputTokens()), first.debug().totalTokens());
    }

    @Test
    void eachPlanRequestCallsOpenAiExactlyOnceEvenWhenItReturnsNothing() {
        FakeOpenAiService fakeService = useFakeOpenAi();
        // null makes rankPlanWithOpenAi return Optional.empty(), the timeout/invalid path.
        fakeService.openAiSuggestions = null;
        service.plan(applePlanRequest());
        assertEquals(1, fakeService.rankPlanCalls);

        fakeService.openAiSuggestions = List.of();
        service.plan(planRequest(List.of(), List.of(), opportunity("item:cola", List.of(70), "Coca-Cola 1.5L")));
        assertEquals(2, fakeService.rankPlanCalls);
    }

    @Test
    void openAiPlanOutcomesKeepTokenAndRequestIdConsistency() {
        FakeOpenAiService fakeService = useFakeOpenAi();
        fakeService.openAiSuggestions = List.of(aiOpportunity("item:apple", suggestion(41)));

        UpsellDtos.UpsellPlanResponse response = service.plan(applePlanRequest());

        UpsellDtos.UpsellPlanDebug debug = response.debug();
        assertNotNull(debug.requestId());
        assertFalse(debug.requestId().isBlank());
        assertEquals("openai", debug.responseSource());
        assertNull(debug.fallbackReason());
        assertEquals(Boolean.FALSE, debug.retryable());
        assertTrue(debug.candidateCount() > 0, debug::toString);
        assertNotNull(debug.totalTokens());
        assertEquals(Integer.valueOf(debug.inputTokens() + debug.outputTokens()), debug.totalTokens());
    }

    // ---- Product equivalence in AI output (7.x) ----

    @Test
    void appleTriggerRemovesOtherAppleVariantsFromAiOutput() {
        UpsellDtos.UpsellPlanResponse response = planWithAi(
                "item:apple", List.of(40), List.of("Aepfel 1kg"),
                suggestion(200), suggestion(43), suggestion(41)
        );

        assertEquals("openai", response.source());
        assertEquals(List.of(41), suggestionIds(response.opportunities().get(0)));
    }

    @Test
    void kitchenRollTriggerRemovesKitchenPaperAndOtherRollPackages() {
        UpsellDtos.UpsellPlanResponse response = planWithAi(
                "item:kitchen-roll", List.of(91), List.of("Kuechenrolle 4 Rollen"),
                suggestion(201), suggestion(211), suggestion(92)
        );

        assertEquals(List.of(92), suggestionIds(response.opportunities().get(0)));
    }

    @Test
    void stationTriggersRemoveOtherToothpasteAndEquivalentCleaner() {
        UpsellDtos.UpsellPlanResponse response = planWithAi(
                "station:bath", List.of(202, 90),
                List.of("Zahnpasta Elmex 75ml", "Frosch Citrus Dusche & Bad-Reiniger"),
                suggestion(203), suggestion(209), suggestion(210)
        );

        assertEquals(List.of(210), suggestionIds(response.opportunities().get(0)));
    }

    @Test
    void colaTriggerRemovesOtherColaVariants() {
        UpsellDtos.UpsellPlanResponse response = planWithAi(
                "item:cola", List.of(70), List.of("Coca-Cola 1.5L"),
                suggestion(204), suggestion(71)
        );

        assertEquals(List.of(71), suggestionIds(response.opportunities().get(0)));
    }

    @Test
    void risottoTriggerKeepsOneButterAndOtherComplements() {
        UpsellDtos.UpsellPlanResponse response = planWithAi(
                "item:risotto", List.of(80), List.of("Risotto Reis"),
                suggestion(30), suggestion(205), suggestion(81)
        );

        assertEquals(List.of(30, 81), suggestionIds(response.opportunities().get(0)));
    }

    @Test
    void eggsTriggerKeepsFlourAndMilkButNotOtherEggsOrSecondFlour() {
        UpsellDtos.UpsellPlanResponse response = planWithAi(
                "item:eggs", List.of(22), List.of("Eier"),
                suggestion(208), suggestion(23), suggestion(206), suggestion(24)
        );

        assertEquals(List.of(23, 24), suggestionIds(response.opportunities().get(0)));
    }

    @Test
    void twoButterVariantsKeepOnlyTheFirstInAiOrder() {
        UpsellDtos.UpsellPlanResponse response = planWithAi(
                "item:toast", List.of(20), List.of("Toastbrot 500g"),
                suggestion(205), suggestion(30)
        );

        assertEquals(List.of(205), suggestionIds(response.opportunities().get(0)));
    }

    @Test
    void mixedAiOutputDropsInvalidVariantsAndKeepsValidComplementsInAiOrder() {
        UpsellDtos.UpsellPlanResponse response = planWithAi(
                "item:apple", List.of(40), List.of("Aepfel 1kg"),
                suggestion(999),
                suggestion(43),
                weakSuggestion(2),
                suggestion(42),
                suggestion(41),
                suggestion(41),
                suggestion(200)
        );

        assertEquals("openai", response.source());
        assertEquals(List.of(42, 41), suggestionIds(response.opportunities().get(0)));
    }

    @Test
    void allAiSuggestionsFilteredLeavesOpportunityEmptyWithoutDeterministicFallback() {
        UpsellDtos.UpsellPlanResponse response = planWithAi(
                "item:apple", List.of(40), List.of("Aepfel 1kg"),
                suggestion(43), suggestion(200)
        );

        assertEquals("filtered", response.source());
        assertTrue(response.opportunities().get(0).suggestions().isEmpty());
        assertNull(response.debug().fallbackReason());
    }

    @Test
    void aiSuggestionsOnCurrentCompletedOrTriggerListAreDropped() {
        FakeOpenAiService fakeService = useFakeOpenAi();
        fakeService.openAiSuggestions = List.of(aiOpportunity(
                "item:cola", suggestion(70), suggestion(24), suggestion(22), suggestion(71)
        ));

        UpsellDtos.UpsellPlanResponse response = service.plan(planRequest(
                List.of(24),
                List.of(22),
                opportunity("item:cola", List.of(70), "Coca-Cola 1.5L")
        ));

        assertEquals(List.of(71), suggestionIds(response.opportunities().get(0)));
    }

    @Test
    void validatedSuggestionsRejectTriggerEquivalentProductsAndKeepFirstOfEachClass() {
        List<UpsellDtos.UpsellSuggestion> suggestions = service.validatedSuggestions(
                List.of(suggestion(203), suggestion(210), suggestion(206), suggestion(23)),
                candidateMap(203, 210, 206, 23),
                List.of(ProductEquivalence.ProductIdentity.of("Zahnpasta Elmex 75ml", null)),
                "request-validation",
                "station:bath"
        );

        assertEquals(List.of(210, 206), suggestions.stream().map(suggestion -> suggestion.product().id()).toList());
    }

    // ---- Plan prompt grounding and cache version (4.7) ----

    @Test
    @SuppressWarnings("unchecked")
    void planSystemPromptCarriesExamplesEmptyArrayAndNoRepeatedClassRules() throws IOException {
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

        Map<String, Object> body = service.openAiPlanRequestBody(List.of(
                new UpsellSuggestionService.RankedOpportunity(opportunity, null, List.of(scoredCandidate))
        ));
        List<Map<String, Object>> input = (List<Map<String, Object>>) body.get("input");
        String system = (String) input.get(0).get("content");

        assertEquals("system", input.get(0).get("role"));
        assertTrue(system.contains("risotto suggests butter"), system);
        assertTrue(system.contains("eggs suggest flour or milk"), system);
        assertTrue(system.contains("another apple or apple variant"), system);
        assertTrue(system.contains("kitchen paper or another kitchen roll package"), system);
        assertTrue(system.contains("another toothpaste"), system);
        assertTrue(system.contains("Return an empty suggestions array when nothing clearly fits."), system);
        assertTrue(system.contains("Do not suggest two products of the same product class within one opportunity."), system);
        assertTrue(system.contains("Do not suggest the same product type in another brand, package size, flavor, or variant; suggest complements, not alternatives."), system);
        assertTrue(system.contains("Select only productIds from candidateProducts"), system);
        assertTrue(system.contains("only opportunityIds from opportunities"), system);
        assertTrue(system.contains("Do not invent products or opportunityIds"), system);
    }

    @Test
    void planCacheContextVersionIsBumpedToV6() throws ReflectiveOperationException {
        Field version = UpsellSuggestionService.class.getDeclaredField("PLAN_CACHE_CONTEXT_VERSION");
        version.setAccessible(true);

        assertEquals("upsell-plan-v6", version.get(null));
    }

    // ---- helpers for the tests above ----

    /** OpenAI path returning two apple-plan picks (41, 42), so plan tests have suggestions to dismiss. */
    private FakeOpenAiService useAppleOpenAiPicks() {
        FakeOpenAiService fakeService = useFakeOpenAi();
        fakeService.openAiSuggestions = List.of(aiOpportunity("item:apple", suggestion(41), suggestion(42)));
        return fakeService;
    }

    private FakeOpenAiService useFakeOpenAi() {
        FakeOpenAiService fakeService = new FakeOpenAiService();
        service = fakeService;
        configureService(service);
        service.openAiEnabled = true;
        service.openAiApiKey = Optional.of("test-key");
        return fakeService;
    }

    private UpsellDtos.UpsellPlanResponse planWithAi(
            String opportunityId,
            List<Integer> triggerProductIds,
            List<String> triggerNames,
            UpsellDtos.AiSuggestion... aiSuggestions
    ) {
        FakeOpenAiService fakeService = useFakeOpenAi();
        fakeService.openAiSuggestions = List.of(aiOpportunity(opportunityId, aiSuggestions));
        return service.plan(planRequest(
                List.of(),
                List.of(),
                new UpsellDtos.UpsellOpportunityRequest(opportunityId, triggerProductIds, triggerNames)
        ));
    }

    private static UpsellDtos.UpsellPlanRequest planRequest(
            List<Integer> currentListProductIds,
            List<Integer> completedProductIds,
            UpsellDtos.UpsellOpportunityRequest... opportunities
    ) {
        return new UpsellDtos.UpsellPlanRequest(
                null,
                "SPAR",
                "local-list",
                currentListProductIds,
                completedProductIds,
                "shopping_session",
                List.of(opportunities),
                null
        );
    }

    private static UpsellDtos.UpsellPlanRequest applePlanRequest() {
        return planRequest(List.of(), List.of(), opportunity("item:apple", List.of(40), "Aepfel 1kg"));
    }

    private static UpsellDtos.UpsellOpportunityRequest opportunity(
            String opportunityId,
            List<Integer> triggerProductIds,
            String... triggerNames
    ) {
        return new UpsellDtos.UpsellOpportunityRequest(opportunityId, triggerProductIds, List.of(triggerNames));
    }

    private static UpsellDtos.AiOpportunitySuggestion aiOpportunity(
            String opportunityId,
            UpsellDtos.AiSuggestion... suggestions
    ) {
        return new UpsellDtos.AiOpportunitySuggestion(opportunityId, List.of(suggestions));
    }

    private static UpsellDtos.AiSuggestion suggestion(int productId) {
        return new UpsellDtos.AiSuggestion(productId, "Passt gut dazu.", 0.90);
    }

    private static UpsellDtos.AiSuggestion weakSuggestion(int productId) {
        return new UpsellDtos.AiSuggestion(productId, "Vielleicht.", 0.10);
    }

    private static List<Integer> suggestionIds(UpsellDtos.UpsellOpportunityResponse opportunity) {
        return opportunity.suggestions().stream()
                .map(suggestion -> suggestion.product().id())
                .toList();
    }

    private Map<Integer, Product> candidateMap(Integer... productIds) {
        Map<Integer, Product> candidateMap = new LinkedHashMap<>();
        for (Integer productId : productIds) {
            candidateMap.put(productId, openSearchService.products.get(productId));
        }
        return candidateMap;
    }

    private static void assertNoTokenFields(UpsellDtos.UpsellPlanDebug debug) {
        assertNull(debug.openAiElapsedMs());
        assertNull(debug.inputTokens());
        assertNull(debug.outputTokens());
        assertNull(debug.totalTokens());
        assertNull(debug.cachedInputTokens());
        assertNull(debug.reasoningTokens());
    }

    private static final class FakeOpenSearchService extends OpenSearchService {
        int productLookups = 0;
        int batchLookups = 0;
        boolean failProductBatch = false;
        List<String> lastTriggerCategories = List.of();
        List<String> lastComplementaryCategories = List.of();
        boolean emptyCandidates = false;
        boolean failCandidateLookup = false;
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
            // Equivalence fixtures (ids 200+): apple, kitchen paper, toothpaste, cola, butter, flour, milk, eggs,
            // cleaner and a non-equivalent toothpaste complement.
            products.put(200, new Product(200, "Aepfel Gala 1kg", 2.49, "310/1/1/5"));
            products.put(201, new Product(201, "Kuechenpapier 2 Rollen", 2.19, "820/1/1/5"));
            products.put(202, new Product(202, "Zahnpasta Elmex 75ml", 2.99, "830/1/1/1"));
            products.put(203, new Product(203, "Zahncreme Aronal", 3.49, "830/1/1/2"));
            products.put(204, new Product(204, "Pepsi Cola 2L", 1.99, "700/1/1/2"));
            products.put(205, new Product(205, "Butter Bio 250g", 2.79, "525/1/1/3"));
            products.put(206, new Product(206, "Mehl Type 480 1kg", 1.09, "445/1/1/2"));
            products.put(207, new Product(207, "Vollmilch 3,5% 1L", 1.19, "520/1/1/3"));
            products.put(208, new Product(208, "Freilandeier 6 Stueck", 2.89, "445/1/1/3"));
            products.put(209, new Product(209, "Allzweckreiniger Zitrone", 2.49, "800/1/1/2"));
            products.put(210, new Product(210, "Zahnseide Minze", 1.79, "830/1/1/3"));
            products.put(211, new Product(211, "Haushaltsrollen 3 Stueck", 3.29, "820/1/1/6"));
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
        public Map<Integer, Product> getProductsByNumericIds(Collection<Integer> ids) throws IOException {
            batchLookups++;
            if (failProductBatch) {
                throw new IOException("simulated OpenSearch outage");
            }
            Map<Integer, Product> result = new LinkedHashMap<>();
            for (Integer id : ids) {
                if (products.containsKey(id)) {
                    result.put(id, products.get(id));
                }
            }
            return result;
        }

        @Override
        public List<Product> findUpsellCandidates(Integer size, String storeId, String storeCode) throws IOException {
            return findUpsellCandidates(size, storeId, storeCode, List.of(), List.of());
        }

        @Override
        public List<Product> findUpsellCandidates(Integer size, String storeId, String storeCode,
                                                  Collection<String> triggerCategories,
                                                  Collection<String> complementaryCategories) throws IOException {
            lastTriggerCategories = List.copyOf(triggerCategories);
            lastComplementaryCategories = List.copyOf(complementaryCategories);
            if (failCandidateLookup) {
                throw new IOException("simulated OpenSearch outage");
            }
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
            return findUnscopedUpsellCandidates(size, List.of(), List.of());
        }

        @Override
        public List<Product> findUnscopedUpsellCandidates(Integer size,
                                                          Collection<String> triggerCategories,
                                                          Collection<String> complementaryCategories) throws IOException {
            if (failCandidateLookup) {
                throw new IOException("simulated OpenSearch outage");
            }
            if (emptyCandidates) {
                return List.of();
            }
            return products.values().stream()
                    .limit(size == null ? products.size() : size)
                    .toList();
        }
    }

    @Test
    void dismissedSuggestionIsNotReturnedAfterDismissal() {
        UpsellDtos.UpsellSuggestionRequest request = suggestionRequest(1, null);
        UpsellDtos.UpsellSuggestionResponse first = service.suggestions(request);
        int dismissedId = first.suggestions().get(0).product().id();

        dismissals.add(1, dismissedId, null, null, Instant.now().plus(Duration.ofHours(1)));
        UpsellDtos.UpsellSuggestionResponse second = service.suggestions(request);

        assertEquals("fallback", second.source(), "a changed dismissal set must not be served from the old cache entry");
        assertFalse(second.suggestions().stream().anyMatch(suggestion -> suggestion.product().id() == dismissedId));
    }

    @Test
    void dismissalWithoutSuggestedProductSuppressesAllSuggestionsForCheckedProduct() {
        dismissals.add(1, null, null, null, Instant.now().plus(Duration.ofHours(1)));

        UpsellDtos.UpsellSuggestionResponse response = service.suggestions(suggestionRequest(1, null));

        assertTrue(response.suggestions().isEmpty());
        assertEquals("none", response.source());
    }

    @Test
    void wholeProductDismissalDoesNotAffectOtherCheckedProducts() {
        UpsellDtos.UpsellSuggestionRequest otherProduct = suggestionRequest(2, null);
        List<Integer> before = service.suggestions(otherProduct).suggestions().stream()
                .map(suggestion -> suggestion.product().id())
                .toList();

        dismissals.add(1, null, null, null, Instant.now().plus(Duration.ofHours(1)));
        List<Integer> after = service.suggestions(otherProduct).suggestions().stream()
                .map(suggestion -> suggestion.product().id())
                .toList();

        assertEquals(before, after);
    }

    @Test
    void expiredDismissalIsNotApplied() {
        UpsellDtos.UpsellSuggestionRequest request = suggestionRequest(1, null);
        int candidateId = service.suggestions(request).suggestions().get(0).product().id();

        dismissals.add(1, candidateId, null, null, Instant.now().minus(Duration.ofMinutes(1)));
        UpsellDtos.UpsellSuggestionResponse response = service.suggestions(request);

        assertTrue(response.suggestions().stream().anyMatch(suggestion -> suggestion.product().id() == candidateId));
    }

    @Test
    void dismissalForAnotherStoreIsNotApplied() {
        UUID storeA = UUID.randomUUID();
        UUID storeB = UUID.randomUUID();
        UpsellDtos.UpsellSuggestionRequest request = suggestionRequest(1, storeB);
        int candidateId = service.suggestions(request).suggestions().get(0).product().id();

        dismissals.add(1, candidateId, storeA, null, Instant.now().plus(Duration.ofHours(1)));
        UpsellDtos.UpsellSuggestionResponse response = service.suggestions(request);

        assertTrue(response.suggestions().stream().anyMatch(suggestion -> suggestion.product().id() == candidateId));
    }

    @Test
    void withoutDismissedKeepsCandidatesWhenNothingIsSuppressed() {
        List<Product> candidates = List.of(new Product(2, "A", 1.0, "450/1/1/1"), new Product(3, "B", 1.0, "450/1/1/1"));

        assertEquals(candidates, service.withoutDismissed(candidates, List.of()));
        assertEquals(List.of(3), service.withoutDismissed(candidates, List.of(dismissal(1, 2, null))).stream()
                .map(Product::getId).toList());
        assertTrue(service.withoutDismissed(candidates, List.of(dismissal(1, null, null))).isEmpty());
    }

    @Test
    void dismissalAwareHashIsStableAndChangesWithTheDismissalSet() {
        assertEquals("ctx", service.dismissalAwareHash("ctx", List.of()));
        String withOne = service.dismissalAwareHash("ctx", List.of(dismissal(1, 2, null)));
        assertEquals(withOne, service.dismissalAwareHash("ctx", List.of(dismissal(1, 2, null))));
        assertFalse(withOne.equals("ctx"));
        assertFalse(withOne.equals(service.dismissalAwareHash("ctx", List.of(dismissal(1, 3, null)))));
    }

    @Test
    void dismissedCandidatesAreRemovedBeforeTheDeterministicFallbackRanks() {
        // Plan candidates are unscored without OpenAI, so the fallback is checked directly on strongly scored candidates.
        UpsellSuggestionService.RankedOpportunity ranked = new UpsellSuggestionService.RankedOpportunity(appleOpportunity(), null, List.of(
                new UpsellSuggestionService.ScoredCandidate(openSearchService.products.get(41), "520", null, 120, List.of("family_strong"), true),
                new UpsellSuggestionService.ScoredCandidate(openSearchService.products.get(42), "440", null, 120, List.of("family_strong"), true)
        ));

        List<UpsellDtos.AiOpportunitySuggestion> fallback = service.fallbackPlanRank(
                service.withoutDismissedPlanCandidates(List.of(ranked), List.of(dismissal(40, 41, null))));

        assertEquals(List.of(42), fallback.get(0).suggestions().stream().map(UpsellDtos.AiSuggestion::productId).toList());
    }

    @Test
    void planNeverSendsDismissedCandidatesToOpenAiAndDropsDismissedAiOutput() {
        FakeOpenAiService fakeService = useFakeOpenAi();
        fakeService.openAiSuggestions = List.of(aiOpportunity("item:apple", suggestion(41)));
        service.plan(applePlanRequest());
        int dismissedId = candidateIds(fakeService.lastRanked, "item:apple").get(0);

        dismissals.add(40, dismissedId, null, null, Instant.now().plus(Duration.ofHours(1)));
        // A misbehaving model that still names the dismissed product must not get it returned.
        fakeService.openAiSuggestions = List.of(aiOpportunity("item:apple", suggestion(dismissedId), suggestion(41)));
        UpsellDtos.UpsellPlanResponse response = service.plan(applePlanRequest());

        assertEquals(2, fakeService.rankPlanCalls);
        assertFalse(candidateIds(fakeService.lastRanked, "item:apple").contains(dismissedId));
        assertFalse(suggestionIds(response.opportunities().get(0)).contains(dismissedId));
    }

    @Test
    void wholeProductDismissalOfTheOnlyTriggerYieldsEmptyOpportunityWithoutOpenAi() {
        FakeOpenAiService fakeService = useFakeOpenAi();
        dismissals.add(40, null, null, null, Instant.now().plus(Duration.ofHours(1)));

        UpsellDtos.UpsellPlanResponse response = service.plan(applePlanRequest());

        assertEquals(1, response.opportunities().size());
        assertEquals("item:apple", response.opportunities().get(0).opportunityId());
        assertTrue(response.opportunities().get(0).suggestions().isEmpty());
        assertEquals("none", response.source());
        assertEquals("no_ranked_candidates", response.debug().fallbackReason());
        assertEquals(0, fakeService.rankPlanCalls);
    }

    @Test
    void wholeProductDismissalOfOneOfSeveralTriggersKeepsTheOpportunity() {
        FakeOpenAiService fakeService = useFakeOpenAi();
        dismissals.add(40, null, null, null, Instant.now().plus(Duration.ofHours(1)));

        service.plan(planRequest(List.of(), List.of(), opportunity("item:mix", List.of(40, 1), "Aepfel 1kg", "Spaghetti")));

        assertFalse(candidateIds(fakeService.lastRanked, "item:mix").isEmpty());
    }

    @Test
    void dismissalsApplyPerOpportunityNotAcrossOpportunities() {
        FakeOpenAiService fakeService = useFakeOpenAi();
        service.plan(planRequest(List.of(), List.of(),
                opportunity("item:apple", List.of(40), "Aepfel 1kg"),
                opportunity("item:pasta", List.of(1), "Spaghetti")));
        int pastaCandidateId = candidateIds(fakeService.lastRanked, "item:pasta").get(0);

        dismissals.add(40, null, null, null, Instant.now().plus(Duration.ofHours(1)));
        dismissals.add(1, pastaCandidateId, null, null, Instant.now().plus(Duration.ofHours(1)));
        service.plan(planRequest(List.of(), List.of(),
                opportunity("item:apple", List.of(40), "Aepfel 1kg"),
                opportunity("item:pasta", List.of(1), "Spaghetti")));

        assertTrue(candidateIds(fakeService.lastRanked, "item:apple").isEmpty());
        List<Integer> pastaCandidates = candidateIds(fakeService.lastRanked, "item:pasta");
        assertFalse(pastaCandidates.isEmpty());
        assertFalse(pastaCandidates.contains(pastaCandidateId));
    }

    @Test
    void dismissalOfAnotherStoreOrSessionDoesNotSuppressPlanSuggestions() {
        useAppleOpenAiPicks();
        UUID storeA = UUID.randomUUID();
        UUID storeB = UUID.randomUUID();
        UpsellDtos.UpsellPlanRequest storeBRequest = sessionPlanRequest(storeB, null, appleOpportunity());
        int candidateId = firstSuggestionId(service.plan(storeBRequest));

        dismissals.add(40, candidateId, storeA, null, Instant.now().plus(Duration.ofHours(1)));
        dismissals.add(40, candidateId, storeB, sessionHash("sess-A"), Instant.now().plus(Duration.ofHours(1)));

        assertTrue(suggestionIds(service.plan(storeBRequest).opportunities().get(0)).contains(candidateId));
        assertTrue(suggestionIds(service.plan(sessionPlanRequest(storeB, "sess-B", appleOpportunity()))
                .opportunities().get(0)).contains(candidateId));
    }

    @Test
    void sessionScopedPlanDismissalAppliesOnlyToItsSession() {
        useAppleOpenAiPicks();
        int candidateId = firstSuggestionId(service.plan(sessionPlanRequest(null, "sess-A", appleOpportunity())));

        dismissals.add(40, candidateId, null, sessionHash("sess-A"), Instant.now().plus(Duration.ofHours(1)));

        assertFalse(suggestionIds(service.plan(sessionPlanRequest(null, "sess-A", appleOpportunity()))
                .opportunities().get(0)).contains(candidateId));
        assertTrue(suggestionIds(service.plan(sessionPlanRequest(null, "sess-B", appleOpportunity()))
                .opportunities().get(0)).contains(candidateId));
        assertTrue(suggestionIds(service.plan(applePlanRequest()).opportunities().get(0)).contains(candidateId));
    }

    @Test
    void expiredPlanDismissalIsIgnored() {
        useAppleOpenAiPicks();
        UpsellDtos.UpsellPlanRequest request = applePlanRequest();
        UpsellDtos.UpsellPlanResponse baseline = service.plan(request);
        int candidateId = firstSuggestionId(baseline);

        dismissals.add(40, candidateId, null, null, Instant.now().minus(Duration.ofMinutes(1)));

        assertEquals(suggestionIds(baseline.opportunities().get(0)),
                suggestionIds(service.plan(request).opportunities().get(0)));
    }

    @Test
    void newPlanDismissalIsNotServedFromStaleCacheAndIdenticalDismissalSetHitsCache() {
        useAppleOpenAiPicks();
        UpsellDtos.UpsellPlanRequest request = applePlanRequest();
        int dismissedId = firstSuggestionId(service.plan(request));
        assertEquals("cache", service.plan(request).source());

        dismissals.add(40, dismissedId, null, null, Instant.now().plus(Duration.ofHours(1)));
        UpsellDtos.UpsellPlanResponse afterDismissal = service.plan(request);

        assertNotEquals("cache", afterDismissal.source());
        assertFalse(suggestionIds(afterDismissal.opportunities().get(0)).contains(dismissedId));
        assertEquals("cache", service.plan(request).source());
    }

    @Test
    void planLooksUpDismissalsOfAllTriggersInOneBatchedQuery() {
        int batchesBefore = dismissals.batchQueries;
        int singlesBefore = dismissals.singleQueries;

        service.plan(planRequest(List.of(), List.of(),
                opportunity("item:apple", List.of(40), "Aepfel 1kg"),
                opportunity("item:pasta", List.of(1, 2), "Spaghetti", "Parmesan")));

        assertEquals(batchesBefore + 1, dismissals.batchQueries);
        assertEquals(singlesBefore, dismissals.singleQueries);
        assertEquals(Set.of(1, 2, 40), Set.copyOf(dismissals.lastBatchIds));
        assertEquals(3, dismissals.lastBatchIds.size());
    }

    @Test
    void suggestionsMatchSessionScopedDismissalOnlyForThatSession() {
        UpsellDtos.UpsellSuggestionRequest anonymous = suggestionRequest(1, null);
        int candidateId = service.suggestions(anonymous).suggestions().get(0).product().id();

        dismissals.add(1, candidateId, null, sessionHash("sess-A"), Instant.now().plus(Duration.ofHours(1)));

        UpsellDtos.UpsellSuggestionResponse sessionResponse = service.suggestions(suggestionRequest(1, null, "sess-A"));
        assertFalse(sessionResponse.suggestions().stream().anyMatch(suggestion -> suggestion.product().id() == candidateId));
        UpsellDtos.UpsellSuggestionResponse anonymousResponse = service.suggestions(anonymous);
        assertTrue(anonymousResponse.suggestions().stream().anyMatch(suggestion -> suggestion.product().id() == candidateId));
    }

    @Test
    void sessionIdDoesNotChangeThePlainContextHashes() {
        assertEquals(service.contextHash(suggestionRequest(1, null)), service.contextHash(suggestionRequest(1, null, "sess-A")));
        UpsellDtos.UpsellPlanRequest withSession = sessionPlanRequest(null, "sess-A", appleOpportunity());
        assertEquals(service.planContextHash(applePlanRequest(), applePlanRequest().opportunities()),
                service.planContextHash(withSession, withSession.opportunities()));
    }

    private UpsellDtos.UpsellSuggestionRequest suggestionRequest(Integer checkedProductId, UUID storeId) {
        return suggestionRequest(checkedProductId, storeId, null);
    }

    private UpsellDtos.UpsellSuggestionRequest suggestionRequest(Integer checkedProductId, UUID storeId, String sessionId) {
        return new UpsellDtos.UpsellSuggestionRequest(
                storeId,
                null,
                checkedProductId,
                "local-list",
                List.of(),
                List.of(),
                "shopping_session",
                null,
                sessionId
        );
    }

    private static UpsellDtos.UpsellOpportunityRequest appleOpportunity() {
        return opportunity("item:apple", List.of(40), "Aepfel 1kg");
    }

    private static UpsellDtos.UpsellPlanRequest sessionPlanRequest(
            UUID storeId,
            String sessionId,
            UpsellDtos.UpsellOpportunityRequest... opportunities
    ) {
        return new UpsellDtos.UpsellPlanRequest(
                storeId,
                "SPAR",
                "local-list",
                List.of(),
                List.of(),
                "shopping_session",
                List.of(opportunities),
                sessionId
        );
    }

    private static int firstSuggestionId(UpsellDtos.UpsellPlanResponse response) {
        List<Integer> ids = suggestionIds(response.opportunities().get(0));
        assertFalse(ids.isEmpty(), "fixture needs a suggestion to dismiss");
        return ids.get(0);
    }

    private static List<Integer> candidateIds(List<UpsellSuggestionService.RankedOpportunity> rankedOpportunities, String opportunityId) {
        assertNotNull(rankedOpportunities, "OpenAI was not called");
        return rankedOpportunities.stream()
                .filter(ranked -> ranked.opportunity().opportunityId().equals(opportunityId))
                .findFirst()
                .orElseThrow()
                .candidates().stream()
                .map(candidate -> candidate.product().getId())
                .toList();
    }

    private static String sessionHash(String sessionId) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(sessionId.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static UpsellDismissalEntity dismissal(Integer checkedProductId, Integer suggestedProductId, UUID storeId) {
        UpsellDismissalEntity entity = new UpsellDismissalEntity();
        entity.checkedProductId = checkedProductId;
        entity.suggestedProductId = suggestedProductId;
        entity.storeId = storeId;
        entity.suppressedUntil = Instant.now().plus(Duration.ofHours(1));
        return entity;
    }

    private static final class FakeDismissalRepository extends UpsellDismissalRepository {
        private final List<UpsellDismissalEntity> rows = new ArrayList<>();
        int singleQueries = 0;
        int batchQueries = 0;
        List<Integer> lastBatchIds = List.of();

        void add(Integer checkedProductId, Integer suggestedProductId, UUID storeId, String sessionHash, Instant suppressedUntil) {
            UpsellDismissalEntity entity = dismissal(checkedProductId, suggestedProductId, storeId);
            entity.sessionHash = sessionHash;
            entity.suppressedUntil = suppressedUntil;
            rows.add(entity);
        }

        @Override
        public List<UpsellDismissalEntity> findActiveForCheckedProduct(Integer checkedProductId, UUID storeId,
                                                                      String sessionHash, Instant now) {
            singleQueries++;
            return active(row -> Objects.equals(row.checkedProductId, checkedProductId), storeId, sessionHash, now);
        }

        @Override
        public List<UpsellDismissalEntity> findActiveForCheckedProducts(Collection<Integer> checkedProductIds, UUID storeId,
                                                                       String sessionHash, Instant now) {
            batchQueries++;
            lastBatchIds = List.copyOf(checkedProductIds);
            return active(row -> checkedProductIds.contains(row.checkedProductId), storeId, sessionHash, now);
        }

        private List<UpsellDismissalEntity> active(java.util.function.Predicate<UpsellDismissalEntity> checked,
                                                   UUID storeId, String sessionHash, Instant now) {
            return rows.stream()
                    .filter(checked)
                    .filter(row -> Objects.equals(row.storeId, storeId))
                    .filter(row -> Objects.equals(row.sessionHash, sessionHash))
                    .filter(row -> row.suppressedUntil != null && row.suppressedUntil.isAfter(now))
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
        /** Number of rankPlanWithOpenAi calls; the service must make exactly one per plan request. */
        int rankPlanCalls = 0;
        /** Candidates exactly as they were sent to OpenAI on the last call. */
        List<RankedOpportunity> lastRanked;

        @Override
        Optional<OpenAiPlanResult> rankPlanWithOpenAi(List<RankedOpportunity> rankedOpportunities, String requestId) {
            openAiCalled = true;
            rankPlanCalls++;
            lastRanked = rankedOpportunities;
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
                            rankedOpportunities.stream().mapToInt(opportunity -> opportunity.candidates().size()).sum(),
                            false
                    )
            ));
        }
    }
}
