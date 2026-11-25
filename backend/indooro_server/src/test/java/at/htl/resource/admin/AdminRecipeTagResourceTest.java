package at.htl.resource.admin;

import at.htl.admin.dto.RecipeDtos;
import at.htl.admin.entity.RecordStatus;
import at.htl.admin.service.RecipeService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.CoreMatchers.equalTo;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@QuarkusTest
class AdminRecipeTagResourceTest {

    private static final UUID TAG_ID = UUID.fromString("12121212-1212-1212-1212-121212121212");

    @InjectMock
    RecipeService recipeService;

    @Test
    void rejectsAnonymousRecipeTagAccess() {
        given()
                .when().get("/api/admin/recipe-tags")
                .then()
                .statusCode(401);
    }

    @Test
    @TestSecurity(user = "region", roles = "region-manager")
    void rejectsNonAdminRecipeTagAccess() {
        given()
                .when().get("/api/admin/recipe-tags")
                .then()
                .statusCode(403);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void listsRecipeTagsWithFilters() {
        when(recipeService.listTags(eq(RecordStatus.ACTIVE), eq("schnell")))
                .thenReturn(List.of(tag("quick", "Schnell", "ACTIVE")));

        given()
                .queryParam("status", "ACTIVE")
                .queryParam("q", "schnell")
                .when().get("/api/admin/recipe-tags")
                .then()
                .statusCode(200)
                .body("[0].code", equalTo("quick"))
                .body("[0].name", equalTo("Schnell"));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void createsUpdatesAndArchivesRecipeTags() {
        when(recipeService.createTag(any())).thenReturn(tag("quick", "Schnell", "ACTIVE"));
        when(recipeService.updateTag(eq(TAG_ID), any())).thenReturn(tag("quick", "Schnell & einfach", "ACTIVE"));
        when(recipeService.archiveTag(TAG_ID)).thenReturn(tag("quick", "Schnell & einfach", "ARCHIVED"));

        given()
                .contentType("application/json")
                .body("{\"code\":\"quick\",\"name\":\"Schnell\",\"kind\":\"category\"}")
                .when().post("/api/admin/recipe-tags")
                .then()
                .statusCode(201);

        given()
                .contentType("application/json")
                .body("{\"code\":\"quick\",\"name\":\"Schnell & einfach\",\"kind\":\"category\"}")
                .when().put("/api/admin/recipe-tags/{tagId}", TAG_ID)
                .then()
                .statusCode(200)
                .body("name", equalTo("Schnell & einfach"));

        given()
                .when().patch("/api/admin/recipe-tags/{tagId}/archive", TAG_ID)
                .then()
                .statusCode(200)
                .body("status", equalTo("ARCHIVED"));
    }

    private RecipeDtos.RecipeTagResponse tag(String code, String name, String status) {
        return new RecipeDtos.RecipeTagResponse(TAG_ID, code, name, "category", status);
    }
}
