package at.htl.resource;

import at.htl.admin.dto.AccessAssignmentDtos;
import at.htl.admin.dto.BeaconDtos;
import at.htl.admin.dto.LayoutDtos;
import at.htl.admin.dto.RecipeDtos;
import at.htl.admin.dto.RegionDtos;
import at.htl.admin.dto.StoreDtos;
import at.htl.admin.service.AccessAssignmentService;
import at.htl.admin.service.AdminAccessService;
import at.htl.admin.service.AuditLogService;
import at.htl.admin.service.BeaconAdminService;
import at.htl.admin.service.ErrorLogService;
import at.htl.admin.service.RecipeService;
import at.htl.admin.service.RegionAdminService;
import at.htl.admin.service.StoreAdminService;
import at.htl.admin.service.StoreLayoutAdminService;
import at.htl.model.Category;
import at.htl.model.Product;
import at.htl.service.CatalogBulkResult;
import at.htl.service.CatalogStoreResolver;
import at.htl.service.CategoryService;
import at.htl.service.LegacyDocumentGuard;
import at.htl.service.OpenSearchService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.restassured.response.ExtractableResponse;
import io.restassured.response.Response;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * Create contract: 201 + Location + empty body for creates, 201/204 + Location for upserts,
 * and a readable GET at every Location.
 */
@QuarkusTest
class CreateContractTest {

    private static final UUID ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID PARENT = UUID.fromString("22222222-2222-2222-2222-222222222222");
    private static final String STORE_CODE = "demo-store";
    private static final String PRODUCT = "{\"id\":101,\"name\":\"Backpulver\",\"price\":0.89,"
            + "\"layoutCode\":\"310/1/1/1\",\"storeCode\":\"" + STORE_CODE + "\"}";
    private static final String CATEGORY = "{\"categoryCode\":7,\"categoryName\":\"Obst\"}";

    @InjectMock RegionAdminService regions;
    @InjectMock StoreAdminService stores;
    @InjectMock RecipeService recipes;
    @InjectMock BeaconAdminService beacons;
    @InjectMock AccessAssignmentService assignments;
    @InjectMock StoreLayoutAdminService layouts;
    @InjectMock OpenSearchService openSearch;
    @InjectMock CategoryService categories;
    @InjectMock AdminAccessService access;
    @InjectMock CatalogStoreResolver storeResolver;
    @InjectMock LegacyDocumentGuard legacyDocumentGuard;
    @InjectMock AuditLogService auditLogService;
    @InjectMock ErrorLogService errorLogService;

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void region() {
        var created = new RegionDtos.RegionResponse(ID, "r", "Region", null, "ACTIVE", null, null);
        when(regions.createRegion(any())).thenReturn(created);
        when(regions.getRegion(ID)).thenReturn(created);

        follow(created("/api/regions", "{\"code\":\"r\",\"name\":\"Region\"}"), "/api/regions/" + ID)
                .then().statusCode(200).body("id", equalTo(ID.toString()));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void store() {
        var created = new StoreDtos.StoreDetailResponse(ID, "s", "Markt", "Weg 1", "4060", "Leonding", "AT",
                null, null, null, "ACTIVE", null, null, null, null, null, "standard", false);
        when(stores.createStore(any())).thenReturn(created);
        when(stores.getStore(ID)).thenReturn(created);

        follow(created("/api/stores", "{\"regionId\":\"" + PARENT + "\",\"storeCode\":\"s\",\"name\":\"Markt\","
                + "\"street\":\"Weg 1\",\"zipCode\":\"4060\",\"city\":\"Leonding\",\"country\":\"AT\"}"),
                "/api/stores/" + ID).then().statusCode(200).body("storeCode", equalTo("s"));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void recipe() {
        var created = new RecipeDtos.RecipeDetailResponse(ID, "pasta", "Pasta", null, null, null, null, 2,
                null, null, null, "DRAFT", null, null, null, null, List.of(), List.of(), List.of());
        when(recipes.createRecipe(any())).thenReturn(created);
        when(recipes.getAdminRecipe(ID)).thenReturn(created);

        follow(created("/api/admin/recipes", "{\"recipe\":{\"slug\":\"pasta\",\"title\":\"Pasta\",\"servings\":2}}"),
                "/api/admin/recipes/" + ID).then().statusCode(200).body("slug", equalTo("pasta"));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void recipeIngredient() {
        var created = new RecipeDtos.RecipeIngredientResponse(ID, 1, "Mehl", null, null, null, null, null, null, false);
        when(recipes.addIngredient(eq(PARENT), any())).thenReturn(created);
        when(recipes.getIngredient(PARENT, ID)).thenReturn(created);
        String base = "/api/admin/recipes/" + PARENT + "/ingredients";

        follow(created(base, "{\"position\":1,\"displayName\":\"Mehl\"}"), base + "/" + ID)
                .then().statusCode(200).body("displayName", equalTo("Mehl"));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void recipeStep() {
        var created = new RecipeDtos.RecipeStepResponse(ID, 1, "Kochen", null);
        when(recipes.addStep(eq(PARENT), any())).thenReturn(created);
        when(recipes.getStep(PARENT, ID)).thenReturn(created);
        String base = "/api/admin/recipes/" + PARENT + "/steps";

        follow(created(base, "{\"position\":1,\"instruction\":\"Kochen\"}"), base + "/" + ID)
                .then().statusCode(200).body("instruction", equalTo("Kochen"));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void recipeTag() {
        var created = new RecipeDtos.RecipeTagResponse(ID, "veg", "Vegetarisch", null, "ACTIVE");
        when(recipes.createTag(any())).thenReturn(created);
        when(recipes.getTag(ID)).thenReturn(created);

        follow(created("/api/admin/recipe-tags", "{\"code\":\"veg\",\"name\":\"Vegetarisch\"}"),
                "/api/admin/recipe-tags/" + ID).then().statusCode(200).body("code", equalTo("veg"));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void beacon() {
        var created = new BeaconDtos.BeaconResponse(ID, "B-1", PARENT.toString(), 1, 2, "k", "ACTIVE",
                null, null, null, null);
        when(beacons.createBeacon(any())).thenReturn(created);
        when(beacons.getBeacon(ID)).thenReturn(created);

        follow(created("/api/beacons", "{\"beaconCode\":\"B-1\",\"uuid\":\"" + PARENT + "\",\"major\":1,\"minor\":2}"),
                "/api/beacons/" + ID).then().statusCode(200).body("beaconCode", equalTo("B-1"));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void accessAssignment() {
        var created = new AccessAssignmentDtos.AccessAssignmentResponse(ID, "sub-1", "anna", null, "admin",
                null, null, null, null, null, "ACTIVE", null, null);
        when(assignments.createAssignment(any())).thenReturn(created);
        when(assignments.getAssignment(ID)).thenReturn(created);

        follow(created("/api/admin/access-assignments",
                "{\"keycloakSubject\":\"sub-1\",\"username\":\"anna\",\"role\":\"admin\"}"),
                "/api/admin/access-assignments/" + ID).then().statusCode(200).body("username", equalTo("anna"));
    }

    @Test
    @TestSecurity(user = "store", roles = "store-manager")
    void accessAssignmentReadKeepsTheRoleRule() {
        given().get("/api/admin/access-assignments/{id}", ID).then().statusCode(403);
        given().get("/api/admin/recipe-tags/{id}", ID).then().statusCode(403);
        given().get("/api/admin/recipes/{id}/steps/{stepId}", PARENT, ID).then().statusCode(403);
        given().get("/api/admin/recipes/{id}/ingredients/{ingredientId}", PARENT, ID).then().statusCode(403);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void layoutVersion() {
        var created = new LayoutDtos.StoreLayoutResponse(ID, PARENT, 3, "DRAFT", null, null, null);
        when(layouts.saveLayoutVersion(eq(PARENT), any())).thenReturn(created);
        when(layouts.getLayoutVersion(PARENT, ID)).thenReturn(created);
        String base = "/api/stores/" + PARENT + "/layout/versions";

        follow(created(base, "{\"activate\":false,\"layout\":{\"elements\":[]}}"), base + "/" + ID)
                .then().statusCode(200).body("versionNo", equalTo(3));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void categoryCreateOnly() throws Exception {
        Category category = new Category();
        category.setCategoryCode(7);
        category.setCategoryName("Obst");
        when(categories.create(any())).thenReturn(category);
        when(categories.getCategoryByCode(7)).thenReturn(category);

        follow(created("/api/categories?createOnly=true", CATEGORY), "/api/categories/7")
                .then().statusCode(200).body("categoryName", equalTo("Obst"));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void categoryUpsert() throws Exception {
        when(categories.bulkInsert(anyList())).thenReturn(
                CatalogBulkResult.fromRows(List.of(new CatalogBulkResult.Row(1, "7", "saved", null))));

        created("/api/categories", CATEGORY);

        when(categories.getCategoryByCode(7)).thenReturn(new Category());
        updated("/api/categories", CATEGORY, "/api/categories/7");
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void product() throws Exception {
        upsertProduct("/api/products", "/api/products/101?storeCode=" + STORE_CODE);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void adminProduct() throws Exception {
        upsertProduct("/api/admin/products", "/api/admin/products/101?storeCode=" + STORE_CODE);
    }

    private void upsertProduct(String collection, String itemPath) throws Exception {
        var store = new CatalogStoreResolver.ResolvedStore(PARENT, STORE_CODE);
        when(storeResolver.require(any(), any())).thenReturn(store);
        Product product = new Product();
        product.setId(101);
        product.setName("Backpulver");
        when(openSearch.getProductById(eq(101), any(), eq(STORE_CODE))).thenReturn(product);

        when(openSearch.indexProduct(any(Product.class))).thenReturn("Created");
        follow(created(collection, PRODUCT), itemPath).then().statusCode(200).body("name", equalTo("Backpulver"));

        when(openSearch.indexProduct(any(Product.class))).thenReturn("Updated");
        updated(collection, PRODUCT, itemPath);
    }

    private static ExtractableResponse<Response> created(String path, String body) {
        return given().contentType("application/json").body(body).post(path).then()
                .statusCode(201).body(equalTo("")).extract();
    }

    private static void updated(String path, String body, String location) {
        given().contentType("application/json").body(body).post(path).then()
                .statusCode(204).header("Location", containsString(location)).body(equalTo(""));
    }

    /** Asserts the Location path and returns the GET on it. */
    private static Response follow(ExtractableResponse<Response> created, String expected) {
        URI location = URI.create(created.header("Location"));
        String path = location.getRawPath() + (location.getRawQuery() == null ? "" : "?" + location.getRawQuery());
        assertEquals(expected, path);
        return given().urlEncodingEnabled(false).get(path);
    }
}
