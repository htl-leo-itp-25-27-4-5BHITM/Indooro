package at.htl.admin.service;

import at.htl.admin.dto.CommonDtos;
import at.htl.admin.dto.RecipeDtos;
import at.htl.admin.entity.StoreEntity;
import at.htl.admin.entity.recipe.RecipeEntity;
import at.htl.admin.entity.recipe.IngredientProductMappingEntity;
import at.htl.admin.entity.recipe.RecipeIngredientEntity;
import at.htl.admin.entity.recipe.RecipeStepEntity;
import at.htl.admin.repository.StoreRepository;
import at.htl.admin.repository.recipe.IngredientProductMappingRepository;
import at.htl.admin.repository.recipe.RecipeIngredientRepository;
import at.htl.admin.repository.recipe.RecipeRepository;
import at.htl.model.Product;
import at.htl.service.OpenSearchService;
import io.quarkus.hibernate.orm.panache.PanacheQuery;
import io.quarkus.panache.common.Sort;
import jakarta.ws.rs.WebApplicationException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RecipeServiceTest {

    private static final UUID RECIPE_ID = UUID.fromString("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private static final UUID INGREDIENT_ID = UUID.fromString("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");

    RecipeService service;
    RecipeIngredientRepository ingredientRepository;
    IngredientProductMappingRepository mappingRepository;
    StoreRepository storeRepository;
    RecipeRepository recipeRepository;
    OpenSearchService openSearchService;
    AtomicReference<IngredientProductMappingEntity> savedMapping;

    @BeforeEach
    void setUp() throws IOException {
        service = new RecipeService();
        ingredientRepository = mock(RecipeIngredientRepository.class);
        mappingRepository = mock(IngredientProductMappingRepository.class);
        storeRepository = mock(StoreRepository.class);
        recipeRepository = mock(RecipeRepository.class);
        openSearchService = mock(OpenSearchService.class);
        service.ingredientRepository = ingredientRepository;
        service.mappingRepository = mappingRepository;
        service.storeRepository = storeRepository;
        service.recipeRepository = recipeRepository;
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
        when(openSearchService.getProductById(42)).thenReturn(new Product(42, "Katalog Tomaten", 1.99, "310/1", null, "demo-store"));
    }

    @Test
    void recipeSummaryIncludesNumberOfSteps() {
        RecipeEntity recipe = new RecipeEntity();
        recipe.id = RECIPE_ID;
        recipe.slug = "tomaten-pasta";
        recipe.title = "Tomaten Pasta";
        recipe.steps.add(step(recipe, 1));
        recipe.steps.add(step(recipe, 2));
        recipe.steps.add(step(recipe, 3));

        PanacheQuery<RecipeEntity> query = mock(PanacheQuery.class);
        when(recipeRepository.find(anyString(), any(Sort.class), anyMap())).thenReturn(query);
        when(query.list()).thenReturn(List.of(recipe));
        when(query.count()).thenReturn(1L);

        CommonDtos.PageResponse<RecipeDtos.RecipeSummaryResponse> response = service.listAdminRecipes(null, null, null, 0, 20, "title");

        assertEquals(3, response.content().get(0).stepCount());
    }

    @Test
    void recipeSortIsAppliedBeforePagingAcrossNumericTitles() {
        RecipeEntity ten = recipeWithTitle("Rezept 10");
        RecipeEntity two = recipeWithTitle("Rezept 2");
        RecipeEntity one = recipeWithTitle("Rezept 1");
        PanacheQuery<RecipeEntity> query = mock(PanacheQuery.class);
        when(recipeRepository.find(anyString(), any(Sort.class), anyMap())).thenReturn(query);
        when(query.list()).thenReturn(List.of(ten, two, one));

        var first = service.listAdminRecipes(null, null, null, 0, 1, "title");
        var second = service.listAdminRecipes(null, null, null, 1, 1, "title");
        var third = service.listAdminRecipes(null, null, null, 2, 1, "title");

        assertEquals(3, first.totalElements());
        assertEquals("Rezept 1", first.content().get(0).title());
        assertEquals("Rezept 2", second.content().get(0).title());
        assertEquals("Rezept 10", third.content().get(0).title());
    }

    private RecipeEntity recipeWithTitle(String title) {
        RecipeEntity recipe = new RecipeEntity();
        recipe.id = UUID.randomUUID();
        recipe.slug = title.toLowerCase().replace(' ', '-');
        recipe.title = title;
        return recipe;
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

    private RecipeIngredientEntity ingredient() {
        RecipeIngredientEntity ingredient = new RecipeIngredientEntity();
        ingredient.id = INGREDIENT_ID;
        ingredient.displayName = "Tomaten";
        ingredient.canonicalName = "tomato";
        return ingredient;
    }

    private RecipeStepEntity step(RecipeEntity recipe, int position) {
        RecipeStepEntity step = new RecipeStepEntity();
        step.recipe = recipe;
        step.position = position;
        step.instruction = "Step " + position;
        return step;
    }
}
