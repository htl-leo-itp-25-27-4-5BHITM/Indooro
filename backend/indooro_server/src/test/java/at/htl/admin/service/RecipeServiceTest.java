package at.htl.admin.service;

import at.htl.admin.dto.CommonDtos;
import at.htl.admin.dto.RecipeDtos;
import at.htl.admin.entity.StoreEntity;
import at.htl.admin.entity.recipe.RecipeEntity;
import at.htl.admin.entity.recipe.IngredientProductMappingEntity;
import at.htl.admin.entity.recipe.RecipeIngredientEntity;
import at.htl.admin.entity.recipe.RecipeTagAssignmentEntity;
import at.htl.admin.entity.recipe.RecipeTagEntity;
import at.htl.admin.repository.StoreRepository;
import at.htl.admin.repository.recipe.IngredientProductMappingRepository;
import at.htl.admin.repository.recipe.RecipeIngredientRepository;
import at.htl.admin.repository.recipe.RecipeRepository;
import at.htl.admin.repository.recipe.RecipeStepRepository;
import at.htl.model.Product;
import at.htl.service.OpenSearchService;
import io.quarkus.hibernate.orm.panache.PanacheQuery;
import io.quarkus.panache.common.Sort;
import jakarta.ws.rs.WebApplicationException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RecipeServiceTest {

    private static final UUID RECIPE_ID = UUID.fromString("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private static final UUID INGREDIENT_ID = UUID.fromString("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
    private static final UUID STORE_ID = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    RecipeService service;
    RecipeIngredientRepository ingredientRepository;
    IngredientProductMappingRepository mappingRepository;
    StoreRepository storeRepository;
    RecipeRepository recipeRepository;
    RecipeStepRepository stepRepository;
    OpenSearchService openSearchService;
    AtomicReference<IngredientProductMappingEntity> savedMapping;

    @BeforeEach
    void setUp() throws IOException {
        service = new RecipeService();
        ingredientRepository = mock(RecipeIngredientRepository.class);
        mappingRepository = mock(IngredientProductMappingRepository.class);
        storeRepository = mock(StoreRepository.class);
        recipeRepository = mock(RecipeRepository.class);
        stepRepository = mock(RecipeStepRepository.class);
        openSearchService = mock(OpenSearchService.class);
        service.ingredientRepository = ingredientRepository;
        service.mappingRepository = mappingRepository;
        service.storeRepository = storeRepository;
        service.recipeRepository = recipeRepository;
        service.stepRepository = stepRepository;
        service.openSearchService = openSearchService;
        service.adminAccessService = mock(AdminAccessService.class);
        service.auditLogService = mock(AuditLogService.class);
        savedMapping = new AtomicReference<>();

        PanacheQuery<RecipeIngredientEntity> ingredientQuery = mock(PanacheQuery.class);
        when(ingredientQuery.firstResultOptional()).thenReturn(Optional.of(ingredient()));
        when(ingredientRepository.find("id = ?1 and recipe.id = ?2", INGREDIENT_ID, RECIPE_ID)).thenReturn(ingredientQuery);
        when(mappingRepository.findActiveByIngredientAndProduct(eq(INGREDIENT_ID), any(), any())).thenReturn(Optional.empty());
        doAnswer(invocation -> {
            savedMapping.set(invocation.getArgument(0, IngredientProductMappingEntity.class));
            return null;
        }).when(mappingRepository).persist(any(IngredientProductMappingEntity.class));
        when(mappingRepository.listActiveByIngredient(INGREDIENT_ID))
                .thenAnswer(invocation -> savedMapping.get() == null ? List.of() : List.of(savedMapping.get()));
        when(openSearchService.getProductById(42)).thenReturn(tomatoProduct());
        when(openSearchService.getProductsByIds(anyCollection())).thenReturn(Map.of("42", tomatoProduct()));
    }

    @Test
    void recipeSummaryIncludesNumberOfSteps() {
        RecipeEntity recipe = recipeWithTitle("Tomaten Pasta");
        recipe.id = RECIPE_ID;
        stubSortedRecipes(recipe);
        stubTaggedRecipes(recipe);
        when(stepRepository.countByRecipeIds(anyCollection())).thenReturn(Map.of(RECIPE_ID, 3L));

        CommonDtos.PageResponse<RecipeDtos.RecipeSummaryResponse> response = service.listAdminRecipes(null, null, null, 0, 20, "title");

        assertEquals(3, response.content().get(0).stepCount());
        assertEquals(1, response.totalElements());
    }

    @Test
    void recipeSortIsAppliedBeforePagingAcrossNumericTitles() {
        RecipeEntity ten = recipeWithTitle("Rezept 10");
        RecipeEntity two = recipeWithTitle("Rezept 2");
        RecipeEntity one = recipeWithTitle("Rezept 1");
        stubSortedRecipes(ten, two, one);
        stubTaggedRecipes(ten, two, one);

        var first = service.listAdminRecipes(null, null, null, 0, 1, "title");
        var second = service.listAdminRecipes(null, null, null, 1, 1, "title");
        var third = service.listAdminRecipes(null, null, null, 2, 1, "title");

        assertEquals(3, first.totalElements());
        assertEquals("Rezept 1", first.content().get(0).title());
        assertEquals("Rezept 2", second.content().get(0).title());
        assertEquals("Rezept 10", third.content().get(0).title());
    }

    @Test
    void listSummariesUseFixedQueriesPerPageWithoutCatalogLookups() throws IOException {
        RecipeEntity pasta = recipeWithTitle("Pasta");
        RecipeEntity salat = recipeWithTitle("Salat");
        pasta.tagAssignments.add(tagAssignment(pasta, "Vegan"));
        pasta.tagAssignments.add(tagAssignment(pasta, "Asiatisch"));
        List<UUID> pageIds = List.of(pasta.id, salat.id);
        when(recipeRepository.listPageIds(anyString(), anyMap(), eq(0), eq(20))).thenReturn(pageIds);
        when(recipeRepository.countMatching(anyString(), anyMap())).thenReturn(5L);
        stubTaggedRecipes(salat, pasta);
        when(mappingRepository.countMappedIngredientsByRecipeIds(pageIds, STORE_ID)).thenReturn(Map.of(pasta.id, 2L));
        when(ingredientRepository.countByRecipeIds(pageIds)).thenReturn(Map.of(pasta.id, 4L));
        when(stepRepository.countByRecipeIds(pageIds)).thenReturn(Map.of(pasta.id, 3L, salat.id, 1L));

        CommonDtos.PageResponse<RecipeDtos.RecipeSummaryResponse> response = service.listMobileRecipes(null, null, 0, 20, STORE_ID);

        assertEquals(5, response.totalElements());
        assertEquals(List.of("Pasta", "Salat"), response.content().stream().map(RecipeDtos.RecipeSummaryResponse::title).toList());
        RecipeDtos.RecipeSummaryResponse pastaSummary = response.content().get(0);
        assertEquals(3, pastaSummary.stepCount());
        assertEquals(2, pastaSummary.mappedIngredientCount());
        assertEquals(4, pastaSummary.totalIngredientCount());
        assertEquals(List.of("Asiatisch", "Vegan"), pastaSummary.tags().stream().map(RecipeDtos.RecipeTagResponse::name).toList());
        RecipeDtos.RecipeSummaryResponse salatSummary = response.content().get(1);
        assertEquals(1, salatSummary.stepCount());
        assertEquals(0, salatSummary.mappedIngredientCount());
        assertEquals(0, salatSummary.totalIngredientCount());
        assertEquals(List.of(), salatSummary.tags());

        verify(recipeRepository, times(1)).listPageIds(anyString(), anyMap(), eq(0), eq(20));
        verify(recipeRepository, times(1)).countMatching(anyString(), anyMap());
        verify(recipeRepository, times(1)).listWithTagsByIds(anyCollection());
        verify(mappingRepository, times(1)).countMappedIngredientsByRecipeIds(pageIds, STORE_ID);
        verify(ingredientRepository, times(1)).countByRecipeIds(pageIds);
        verify(stepRepository, times(1)).countByRecipeIds(pageIds);
        verify(mappingRepository, never()).listActiveByIngredient(any());
        verify(openSearchService, never()).getProductById(any());
        verify(openSearchService, never()).getProductsByIds(anyCollection());
    }

    @Test
    void emptyPageSkipsSummaryQueries() {
        when(recipeRepository.listPageIds(anyString(), anyMap(), anyInt(), anyInt())).thenReturn(List.of());
        when(recipeRepository.countMatching(anyString(), anyMap())).thenReturn(0L);

        CommonDtos.PageResponse<RecipeDtos.RecipeSummaryResponse> response = service.listMobileRecipes(null, null, 3, 20, null);

        assertEquals(List.of(), response.content());
        assertEquals(0, response.totalElements());
        verify(recipeRepository, never()).listWithTagsByIds(anyCollection());
        verify(mappingRepository, never()).countMappedIngredientsByRecipeIds(anyCollection(), any());
        verify(ingredientRepository, never()).countByRecipeIds(anyCollection());
        verify(stepRepository, never()).countByRecipeIds(anyCollection());
    }

    @Test
    void mappingStatusResolvesAllDistinctProductsWithOneCatalogLookup() throws IOException {
        RecipeEntity recipe = recipeWithTitle("Pasta");
        recipe.id = RECIPE_ID;
        RecipeIngredientEntity tomato = ingredient(1, "Tomaten");
        RecipeIngredientEntity milk = ingredient(2, "Milch");
        RecipeIngredientEntity salt = ingredient(3, "Salz");
        recipe.ingredients.addAll(List.of(salt, tomato, milk));
        when(recipeRepository.findByIdOptional(RECIPE_ID)).thenReturn(Optional.of(recipe));
        when(mappingRepository.listActiveByIngredient(tomato.id)).thenReturn(List.of(mapping(42)));
        when(mappingRepository.listActiveByIngredient(milk.id)).thenReturn(List.of(mapping(77)));
        when(mappingRepository.listActiveByIngredient(salt.id)).thenReturn(List.of(mapping(42)));
        when(openSearchService.getProductsByIds(anyCollection())).thenReturn(Map.of(
                "42", tomatoProduct(),
                "77", new Product(77, "Milch", 1.29, null)));

        RecipeDtos.RecipeProductMappingResponse response = service.mappingStatus(RECIPE_ID, null, null, false);

        assertEquals(List.of("MAPPED", "PRODUCT_WITHOUT_LAYOUT", "MAPPED"),
                response.ingredients().stream().map(RecipeDtos.IngredientMappingStatusResponse::status).toList());
        assertEquals("Katalog Tomaten", response.ingredients().get(0).product().name());
        ArgumentCaptor<Collection<String>> idsCaptor = ArgumentCaptor.forClass(Collection.class);
        verify(openSearchService, times(1)).getProductsByIds(idsCaptor.capture());
        assertEquals(2, idsCaptor.getValue().size());
        verify(openSearchService, never()).getProductById(any());
    }

    @Test
    void mappingStatusReportsUnresolvableProductWhenCatalogIsDown() throws IOException {
        RecipeEntity recipe = recipeWithTitle("Pasta");
        recipe.id = RECIPE_ID;
        RecipeIngredientEntity tomato = ingredient(1, "Tomaten");
        recipe.ingredients.add(tomato);
        when(recipeRepository.findByIdOptional(RECIPE_ID)).thenReturn(Optional.of(recipe));
        when(mappingRepository.listActiveByIngredient(tomato.id)).thenReturn(List.of(mapping(42)));
        when(openSearchService.getProductsByIds(anyCollection())).thenThrow(new IOException("catalog down"));

        RecipeDtos.RecipeProductMappingResponse response = service.mappingStatus(RECIPE_ID, null, null, false);

        assertEquals("UNAVAILABLE_IN_STORE", response.ingredients().get(0).status());
    }

    @Test
    void confirmMappingPersistsSnapshotFromCatalogProduct() {
        RecipeDtos.IngredientMappingStatusResponse response = service.confirmMapping(
                RECIPE_ID,
                INGREDIENT_ID,
                new RecipeDtos.ProductMappingRequest(
                        42,
                        "Gefakter Browsername",
                        "FAKE-1",
                        null,
                        null,
                        "MANUAL",
                        BigDecimal.ONE,
                        true
                )
        );

        assertEquals("MAPPED", response.status());
        assertEquals(42, response.product().id());
        assertEquals("Katalog Tomaten", response.product().name());
        assertEquals("310/1", response.product().layoutCode());
        assertEquals("demo-store", response.product().storeCode());
        assertNotNull(savedMapping.get());
        assertNull(savedMapping.get().canonicalName, "recipe-specific mappings must not occupy the global canonical mapping key");
        assertEquals("Katalog Tomaten", savedMapping.get().productNameSnapshot);
        assertEquals("310/1", savedMapping.get().layoutCodeSnapshot);
        assertEquals("demo-store", savedMapping.get().storeCode);
    }

    @Test
    void confirmMappingRejectsUnknownProductId() throws IOException {
        when(openSearchService.getProductById(999)).thenReturn(null);

        WebApplicationException exception = assertThrows(WebApplicationException.class, () -> service.confirmMapping(
                RECIPE_ID,
                INGREDIENT_ID,
                new RecipeDtos.ProductMappingRequest(999, null, null, null, null, "MANUAL", BigDecimal.ONE, true)
        ));

        assertEquals(404, exception.getResponse().getStatus());
    }

    @Test
    void confirmMappingRejectsDuplicateActiveMapping() {
        when(mappingRepository.findActiveByIngredientAndProduct(INGREDIENT_ID, 42, null))
                .thenReturn(Optional.of(new IngredientProductMappingEntity()));

        WebApplicationException exception = assertThrows(WebApplicationException.class, () -> service.confirmMapping(
                RECIPE_ID,
                INGREDIENT_ID,
                new RecipeDtos.ProductMappingRequest(42, null, null, null, null, "MANUAL", BigDecimal.ONE, true)
        ));

        assertEquals(409, exception.getResponse().getStatus());
    }

    @Test
    void confirmMappingAllowsProductWithoutLayoutButReportsWarningStatus() throws IOException {
        when(openSearchService.getProductById(77)).thenReturn(new Product(77, "Milch", 1.29, null));
        when(openSearchService.getProductsByIds(anyCollection())).thenReturn(Map.of("77", new Product(77, "Milch", 1.29, null)));

        RecipeDtos.IngredientMappingStatusResponse response = service.confirmMapping(
                RECIPE_ID,
                INGREDIENT_ID,
                new RecipeDtos.ProductMappingRequest(77, null, null, null, null, "MANUAL", BigDecimal.ONE, true)
        );

        assertEquals("PRODUCT_WITHOUT_LAYOUT", response.status());
        assertEquals("Produkt hat keinen Layout-Code.", response.reason());
        assertEquals("Milch", savedMapping.get().productNameSnapshot);
    }

    @Test
    void confirmMappingRejectsMismatchingStoreContext() throws IOException {
        UUID requestedStore = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        StoreEntity store = new StoreEntity();
        store.id = requestedStore;
        store.storeCode = "REQUESTED";
        when(storeRepository.findByIdOptional(requestedStore)).thenReturn(Optional.of(store));
        when(openSearchService.getProductById(88)).thenReturn(new Product(
                88,
                "Store Produkt",
                2.49,
                "111/1",
                "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                "OTHER"
        ));

        WebApplicationException exception = assertThrows(WebApplicationException.class, () -> service.confirmMapping(
                RECIPE_ID,
                INGREDIENT_ID,
                new RecipeDtos.ProductMappingRequest(88, null, null, requestedStore, null, "MANUAL", BigDecimal.ONE, true)
        ));

        assertEquals(400, exception.getResponse().getStatus());
    }

    @Test
    void confirmMappingReportsCatalogLookupFailureAsServerError() throws IOException {
        when(openSearchService.getProductById(55)).thenThrow(new IOException("catalog down"));

        WebApplicationException exception = assertThrows(WebApplicationException.class, () -> service.confirmMapping(
                RECIPE_ID,
                INGREDIENT_ID,
                new RecipeDtos.ProductMappingRequest(55, null, null, null, null, "MANUAL", BigDecimal.ONE, true)
        ));

        assertEquals(500, exception.getResponse().getStatus());
    }

    private void stubSortedRecipes(RecipeEntity... recipes) {
        PanacheQuery<RecipeEntity> query = mock(PanacheQuery.class);
        when(recipeRepository.find(anyString(), any(Sort.class), anyMap())).thenReturn(query);
        when(query.list()).thenReturn(List.of(recipes));
    }

    private void stubTaggedRecipes(RecipeEntity... recipes) {
        when(recipeRepository.listWithTagsByIds(anyCollection())).thenAnswer(invocation -> {
            Collection<UUID> ids = invocation.getArgument(0);
            return Arrays.stream(recipes).filter(recipe -> ids.contains(recipe.id)).toList();
        });
    }

    private RecipeEntity recipeWithTitle(String title) {
        RecipeEntity recipe = new RecipeEntity();
        recipe.id = UUID.randomUUID();
        recipe.slug = title.toLowerCase().replace(' ', '-');
        recipe.title = title;
        return recipe;
    }

    private RecipeTagAssignmentEntity tagAssignment(RecipeEntity recipe, String tagName) {
        RecipeTagEntity tag = new RecipeTagEntity();
        tag.id = UUID.randomUUID();
        tag.code = tagName.toLowerCase();
        tag.name = tagName;
        RecipeTagAssignmentEntity assignment = new RecipeTagAssignmentEntity();
        assignment.recipe = recipe;
        assignment.tag = tag;
        return assignment;
    }

    private IngredientProductMappingEntity mapping(Integer productId) {
        IngredientProductMappingEntity mapping = new IngredientProductMappingEntity();
        mapping.productId = productId;
        return mapping;
    }

    private Product tomatoProduct() {
        return new Product(42, "Katalog Tomaten", 1.99, "310/1", null, "demo-store");
    }

    private RecipeIngredientEntity ingredient() {
        RecipeIngredientEntity ingredient = new RecipeIngredientEntity();
        ingredient.id = INGREDIENT_ID;
        ingredient.displayName = "Tomaten";
        ingredient.canonicalName = "tomato";
        return ingredient;
    }

    private RecipeIngredientEntity ingredient(int position, String displayName) {
        RecipeIngredientEntity ingredient = new RecipeIngredientEntity();
        ingredient.id = UUID.randomUUID();
        ingredient.position = position;
        ingredient.displayName = displayName;
        return ingredient;
    }
}
