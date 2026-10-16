package at.htl.resource.admin;

import at.htl.admin.dto.CommonDtos;
import at.htl.admin.dto.RecipeDtos;
import at.htl.admin.service.ErrorLogService;
import at.htl.admin.service.RecipeService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.CoreMatchers.equalTo;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.when;

@QuarkusTest
class AdminRecipeResourceTest {

    private static final UUID RECIPE_ID = UUID.fromString("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private static final UUID INGREDIENT_ID = UUID.fromString("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");

    @InjectMock
    RecipeService recipeService;

    @InjectMock
    ErrorLogService errorLogService;

    @Test
    void rejectsAnonymousRecipeAdminAccess() {
        given()
                .when().get("/api/admin/recipes")
                .then()
                .statusCode(401);
    }

    @Test
    @TestSecurity(user = "store", roles = "store-manager")
    void rejectsNonAdminRecipeAdminAccess() {
        given()
                .when().get("/api/admin/recipes")
                .then()
                .statusCode(403);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void listsRecipesForAdmin() {
        when(recipeService.listAdminRecipes(eq(null), eq(null), eq(null), eq(0), eq(20), eq(null)))
                .thenReturn(new CommonDtos.PageResponse<>(List.of(summary("DRAFT")), 0, 20, 1));

        given()
                .when().get("/api/admin/recipes")
                .then()
                .statusCode(200)
                .body("content[0].status", equalTo("DRAFT"));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void rejectsUnknownRecipeSort() {
        given()
                .queryParam("sort", "random")
                .when().get("/api/admin/recipes")
                .then().statusCode(400);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void createsAndPublishesRecipe() {
        when(recipeService.createRecipe(any())).thenReturn(detail("DRAFT"));
        when(recipeService.publishRecipe(RECIPE_ID)).thenReturn(detail("PUBLISHED"));

        given()
                .contentType("application/json")
                .body("""
                        {
                          "recipe": {
                            "slug": "tomaten-pasta",
                            "title": "Tomaten Pasta",
                            "servings": 2,
                            "status": "DRAFT"
                          },
                          "ingredients": [],
                          "steps": []
                        }
                        """)
                .when().post("/api/admin/recipes")
                .then()
                .statusCode(200)
                .body("title", equalTo("Tomaten Pasta"));

        given()
                .when().patch("/api/admin/recipes/{recipeId}/publish", RECIPE_ID)
                .then()
                .statusCode(200)
                .body("status", equalTo("PUBLISHED"));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void returnsRecipeDetailAndUpdatesRecipe() {
        when(recipeService.getAdminRecipe(RECIPE_ID)).thenReturn(detail("DRAFT"));
        when(recipeService.updateRecipe(eq(RECIPE_ID), any())).thenReturn(detail("DRAFT"));

        given()
                .when().get("/api/admin/recipes/{recipeId}", RECIPE_ID)
                .then()
                .statusCode(200)
                .body("id", equalTo(RECIPE_ID.toString()))
                .body("title", equalTo("Tomaten Pasta"));

        given()
                .contentType("application/json")
                .body("""
                        {
                          "slug": "tomaten-pasta",
                          "title": "Tomaten Pasta",
                          "servings": 2,
                          "status": "DRAFT"
                        }
                        """)
                .when().put("/api/admin/recipes/{recipeId}", RECIPE_ID)
                .then()
                .statusCode(200)
                .body("slug", equalTo("tomaten-pasta"));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void deactivatesAndArchivesRecipe() {
        when(recipeService.deactivateRecipe(RECIPE_ID)).thenReturn(detail("DRAFT"));
        when(recipeService.archiveRecipe(RECIPE_ID)).thenReturn(detail("ARCHIVED"));

        given()
                .when().patch("/api/admin/recipes/{recipeId}/deactivate", RECIPE_ID)
                .then()
                .statusCode(200)
                .body("status", equalTo("DRAFT"));

        given()
                .when().patch("/api/admin/recipes/{recipeId}/archive", RECIPE_ID)
                .then()
                .statusCode(200)
                .body("status", equalTo("ARCHIVED"));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void returnsConflictForDuplicateSlug() {
        when(recipeService.createRecipe(any()))
                .thenThrow(new WebApplicationException("Slug existiert bereits.", Response.Status.CONFLICT));

        given()
                .contentType("application/json")
                .body("""
                        {
                          "recipe": {
                            "slug": "tomaten-pasta",
                            "title": "Tomaten Pasta",
                            "servings": 2,
                            "status": "DRAFT"
                          },
                          "ingredients": [],
                          "steps": []
                        }
                        """)
                .when().post("/api/admin/recipes")
                .then()
                .statusCode(409);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void returnsBadRequestForInvalidPublishState() {
        when(recipeService.publishRecipe(RECIPE_ID))
                .thenThrow(new WebApplicationException("Rezept ist nicht publish-ready.", Response.Status.BAD_REQUEST));

        given()
                .when().patch("/api/admin/recipes/{recipeId}/publish", RECIPE_ID)
                .then()
                .statusCode(400);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void createsUpdatesAndDeletesIngredients() {
        when(recipeService.addIngredient(eq(RECIPE_ID), any())).thenReturn(ingredient("Tomaten"));
        when(recipeService.updateIngredient(eq(RECIPE_ID), eq(INGREDIENT_ID), any())).thenReturn(ingredient("Cherry Tomaten"));
        doNothing().when(recipeService).deleteIngredient(RECIPE_ID, INGREDIENT_ID);

        given()
                .contentType("application/json")
                .body("""
                        {
                          "position": 1,
                          "displayName": "Tomaten",
                          "canonicalName": "tomato",
                          "quantityText": "250 g",
                          "unitCode": "g",
                          "optional": false
                        }
                        """)
                .when().post("/api/admin/recipes/{recipeId}/ingredients", RECIPE_ID)
                .then()
                .statusCode(200)
                .body("displayName", equalTo("Tomaten"));

        given()
                .contentType("application/json")
                .body("""
                        {
                          "position": 1,
                          "displayName": "Cherry Tomaten",
                          "canonicalName": "tomato",
                          "quantityText": "250 g",
                          "unitCode": "g",
                          "optional": false
                        }
                        """)
                .when().put("/api/admin/recipes/{recipeId}/ingredients/{ingredientId}", RECIPE_ID, INGREDIENT_ID)
                .then()
                .statusCode(200)
                .body("displayName", equalTo("Cherry Tomaten"));

        given()
                .when().delete("/api/admin/recipes/{recipeId}/ingredients/{ingredientId}", RECIPE_ID, INGREDIENT_ID)
                .then()
                .statusCode(204);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void createsUpdatesAndDeletesSteps() {
        UUID stepId = UUID.fromString("ffffffff-ffff-ffff-ffff-ffffffffffff");
        when(recipeService.addStep(eq(RECIPE_ID), any()))
                .thenReturn(new RecipeDtos.RecipeStepResponse(stepId, 1, "Kochen.", 10));
        when(recipeService.updateStep(eq(RECIPE_ID), eq(stepId), any()))
                .thenReturn(new RecipeDtos.RecipeStepResponse(stepId, 1, "Sanft kochen.", 12));
        doNothing().when(recipeService).deleteStep(RECIPE_ID, stepId);

        given()
                .contentType("application/json")
                .body("{\"position\":1,\"instruction\":\"Kochen.\",\"durationMinutes\":10}")
                .when().post("/api/admin/recipes/{recipeId}/steps", RECIPE_ID)
                .then()
                .statusCode(200)
                .body("instruction", equalTo("Kochen."));

        given()
                .contentType("application/json")
                .body("{\"position\":1,\"instruction\":\"Sanft kochen.\",\"durationMinutes\":12}")
                .when().put("/api/admin/recipes/{recipeId}/steps/{stepId}", RECIPE_ID, stepId)
                .then()
                .statusCode(200)
                .body("durationMinutes", equalTo(12));

        given()
                .when().delete("/api/admin/recipes/{recipeId}/steps/{stepId}", RECIPE_ID, stepId)
                .then()
                .statusCode(204);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void returnsAdminMappingStatusAndArchivesMapping() {
        UUID mappingId = UUID.fromString("99999999-9999-9999-9999-999999999999");
        when(recipeService.mappingStatus(RECIPE_ID, null, "demo-store", false))
                .thenReturn(new RecipeDtos.RecipeProductMappingResponse(RECIPE_ID, null, "demo-store", List.of(
                        new RecipeDtos.IngredientMappingStatusResponse(
                                INGREDIENT_ID,
                                "Tomaten",
                                "MAPPED",
                                new RecipeDtos.MappedRecipeProduct(42, "Tomaten", 1.99, "310/1", null, "demo-store"),
                                List.of(),
                                BigDecimal.ONE,
                                true,
                                null
                        )
                )));
        doNothing().when(recipeService).archiveMapping(RECIPE_ID, INGREDIENT_ID, mappingId);

        given()
                .queryParam("storeCode", "demo-store")
                .when().get("/api/admin/recipes/{recipeId}/mapping-status", RECIPE_ID)
                .then()
                .statusCode(200)
                .body("ingredients[0].status", equalTo("MAPPED"));

        given()
                .when().delete("/api/admin/recipes/{recipeId}/ingredients/{ingredientId}/product-mapping/{mappingId}",
                        RECIPE_ID, INGREDIENT_ID, mappingId)
                .then()
                .statusCode(204);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void returnsConflictForDuplicateMapping() {
        when(recipeService.confirmMapping(eq(RECIPE_ID), eq(INGREDIENT_ID), any()))
                .thenThrow(new WebApplicationException("Mapping existiert bereits.", Response.Status.CONFLICT));

        given()
                .contentType("application/json")
                .body("""
                        {
                          "productId": 42,
                          "mappingType": "MANUAL",
                          "confidence": 1,
                          "manuallyConfirmed": true
                        }
                        """)
                .when().put("/api/admin/recipes/{recipeId}/ingredients/{ingredientId}/product-mapping", RECIPE_ID, INGREDIENT_ID)
                .then()
                .statusCode(409);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void returnsNotFoundForUnknownMappingProduct() {
        when(recipeService.confirmMapping(eq(RECIPE_ID), eq(INGREDIENT_ID), any()))
                .thenThrow(new WebApplicationException("Produkt nicht gefunden.", Response.Status.NOT_FOUND));

        given()
                .contentType("application/json")
                .body("{\"productId\":999,\"mappingType\":\"MANUAL\",\"confidence\":1,\"manuallyConfirmed\":true}")
                .when().put("/api/admin/recipes/{recipeId}/ingredients/{ingredientId}/product-mapping", RECIPE_ID, INGREDIENT_ID)
                .then()
                .statusCode(404);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void returnsMappingSuggestions() {
        when(recipeService.mappingSuggestions(eq(RECIPE_ID), eq(INGREDIENT_ID), eq(null), eq("tomaten"), eq(10)))
                .thenReturn(List.of(new RecipeDtos.MappedRecipeProduct(42, "Tomaten", 1.99, "310/1", null, "demo-store")));

        given()
                .queryParam("q", "tomaten")
                .when().get("/api/admin/recipes/{recipeId}/ingredients/{ingredientId}/mapping-suggestions", RECIPE_ID, INGREDIENT_ID)
                .then()
                .statusCode(200)
                .body("[0].id", equalTo(42))
                .body("[0].name", equalTo("Tomaten"))
                .body("[0].price", equalTo(1.99f))
                .body("[0].layoutCode", equalTo("310/1"))
                .body("[0].storeCode", equalTo("demo-store"));
    }

    private RecipeDtos.RecipeIngredientResponse ingredient(String displayName) {
        return new RecipeDtos.RecipeIngredientResponse(
                INGREDIENT_ID,
                1,
                displayName,
                "tomato",
                BigDecimal.valueOf(250),
                "250 g",
                "g",
                "Gramm",
                null,
                false
        );
    }

    private RecipeDtos.RecipeSummaryResponse summary(String status) {
        return new RecipeDtos.RecipeSummaryResponse(
                RECIPE_ID,
                "tomaten-pasta",
                "Tomaten Pasta",
                "Schnelle Pasta",
                null,
                2,
                10,
                15,
                25,
                status,
                null,
                0,
                0,
                List.of()
        );
    }

    private RecipeDtos.RecipeDetailResponse detail(String status) {
        return new RecipeDtos.RecipeDetailResponse(
                RECIPE_ID,
                "tomaten-pasta",
                "Tomaten Pasta",
                "Schnelle Pasta",
                null,
                null,
                null,
                2,
                10,
                15,
                25,
                status,
                null,
                null,
                null,
                null,
                List.of(),
                List.of(new RecipeDtos.RecipeIngredientResponse(
                        INGREDIENT_ID,
                        1,
                        "Tomaten",
                        "tomato",
                        BigDecimal.valueOf(250),
                        "250",
                        "g",
                        "Gramm",
                        null,
                        false
                )),
                List.of(new RecipeDtos.RecipeStepResponse(UUID.randomUUID(), 1, "Kochen.", 10))
        );
    }
}
