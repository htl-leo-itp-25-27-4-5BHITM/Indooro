package at.htl.resource;

import at.htl.admin.dto.MobileDtos;
import at.htl.admin.dto.UpsellDtos;
import at.htl.admin.service.AdminAccessService;
import at.htl.admin.service.MobileStoreService;
import at.htl.admin.service.UpsellSuggestionService;
import at.htl.model.Category;
import at.htl.service.CatalogBulkResult;
import at.htl.service.CategoryService;
import at.htl.service.LayoutService;
import at.htl.service.OpenSearchService;
import at.htl.service.PdfExportService;
import at.htl.service.PdfImportService;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.stream.Stream;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.anyOf;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.params.provider.Arguments.arguments;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Matrix for the legacy write endpoints that were previously reachable without a role check.
 * Anonymous callers get 401, store-manager and region-manager get 403, admin passes the security layer.
 * Public read routes and anonymous mobile POSTs must stay anonymous.
 */
@QuarkusTest
class LegacyWriteSecurityMatrixTest {

    private static final String SUGGESTIONS_BODY = """
            {
              "storeId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
              "storeCode": "demo-store",
              "checkedProductId": 1,
              "shoppingListId": "local-list",
              "currentListProductIds": [1],
              "completedProductIds": [1],
              "source": "shopping_session"
            }
            """;

    @InjectMock
    OpenSearchService openSearchService;

    @InjectMock
    CategoryService categoryService;

    @InjectMock
    LayoutService layoutService;

    @InjectMock
    PdfImportService pdfImportService;

    @InjectMock
    PdfExportService pdfExportService;

    @InjectMock
    AdminAccessService adminAccessService;

    @InjectMock
    MobileStoreService mobileStoreService;

    @InjectMock
    UpsellSuggestionService upsellSuggestionService;

    static Stream<Arguments> protectedWrites() {
        // Arguments: method, path, JSON body (null = none), multipart upload
        return Stream.of(
                arguments("POST", "/api/layout/current", "{\"elements\":[{\"type\":\"shelf\"}]}", false),
                arguments("POST", "/api/convert/pdf-to-json", null, true),
                arguments("POST", "/api/export/pdf", "[]", false),
                arguments("POST", "/api/products", "{}", false),
                arguments("POST", "/api/products/bulk", "[]", false),
                arguments("POST", "/api/categories", "{\"categoryCode\":310,\"categoryName\":\"Obst\"}", false),
                arguments("PUT", "/api/categories/310", "{\"categoryCode\":310,\"categoryName\":\"Obst\"}", false),
                arguments("POST", "/api/categories/bulk", "[]", false),
                arguments("POST", "/api/admin/index/create", "{}", false),
                arguments("DELETE", "/api/admin/index", null, false)
        );
    }

    @ParameterizedTest(name = "{0} {1}")
    @MethodSource("protectedWrites")
    void anonymousWriteIsUnauthorized(String method, String path, String body, boolean multipart) {
        send(method, path, body, multipart).then().statusCode(401);
        verifyNoInteractions(layoutService, pdfImportService, pdfExportService, openSearchService, categoryService);
    }

    @ParameterizedTest(name = "{0} {1}")
    @MethodSource("protectedWrites")
    @TestSecurity(user = "store", roles = "store-manager")
    void storeManagerWriteIsForbidden(String method, String path, String body, boolean multipart) {
        send(method, path, body, multipart).then().statusCode(403);
        verifyNoInteractions(layoutService, pdfImportService, pdfExportService, openSearchService, categoryService);
    }

    @ParameterizedTest(name = "{0} {1}")
    @MethodSource("protectedWrites")
    @TestSecurity(user = "region", roles = "region-manager")
    void regionManagerWriteIsForbidden(String method, String path, String body, boolean multipart) {
        send(method, path, body, multipart).then().statusCode(403);
        verifyNoInteractions(layoutService, pdfImportService, pdfExportService, openSearchService, categoryService);
    }

    @ParameterizedTest(name = "{0} {1}")
    @MethodSource("protectedWrites")
    @TestSecurity(user = "admin", roles = "admin")
    void adminWriteIsNotBlockedBySecurity(String method, String path, String body, boolean multipart) throws Exception {
        stubAdminWrites();
        send(method, path, body, multipart).then().statusCode(anyOf(is(200), is(400)));
    }

    @Test
    void anonymousPublicReadsStayAnonymous() throws Exception {
        when(layoutService.getCurrentLayout()).thenReturn(new ObjectMapper().readTree("{\"shopName\":\"Indooro\"}"));
        when(layoutService.getRecentLayouts(any())).thenReturn(List.of(
                new LayoutService.LayoutHistoryEntry("layout-1", "Indooro", "2026-10-11T00:00:00Z", "2026-10-11T00:00:00Z", 0)));
        when(openSearchService.searchProducts(eq("milch"), any(), any(), any())).thenReturn(List.of());
        when(openSearchService.getAllProducts(any())).thenReturn(List.of());
        when(categoryService.getAllCategories(any())).thenReturn(List.of(new Category(310, "Obst")));
        when(mobileStoreService.listBeaconIdentities())
                .thenReturn(new MobileDtos.BeaconIdentitiesResponse(List.of("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")));

        given().get("/api/layout/current").then().statusCode(200).body("shopName", equalTo("Indooro"));
        given().get("/api/layout/history").then().statusCode(200);
        given().queryParam("q", "milch").get("/api/products/search").then().statusCode(200);
        given().queryParam("size", 5).get("/api/products").then().statusCode(200);
        given().get("/api/products/1").then().statusCode(anyOf(is(200), is(404)));
        given().get("/api/categories").then().statusCode(200).body("[0].categoryCode", equalTo(310));
        given().get("/api/mobile/stores").then().statusCode(200);
        given().get("/api/mobile/stores/beacon-identities").then().statusCode(200);
    }

    @Test
    void anonymousMobilePostsStayOpen() {
        when(upsellSuggestionService.suggestions(any())).thenReturn(new UpsellDtos.UpsellSuggestionResponse(
                1, List.of(), "fallback", Instant.parse("2026-06-02T12:00:00Z")));

        given().contentType("application/json").body(SUGGESTIONS_BODY)
                .post("/api/mobile/upsell/suggestions").then().statusCode(200);
        given().contentType("application/json").body("{}")
                .post("/api/mobile/upsell/events").then().statusCode(not(anyOf(is(401), is(403))));
    }

    private static Response send(String method, String path, String body, boolean multipart) {
        RequestSpecification spec = given();
        if (multipart) {
            spec = spec.multiPart("file", "belegplan.pdf",
                    "%PDF-1.4 test".getBytes(StandardCharsets.UTF_8), "application/pdf");
        } else if (body != null) {
            spec = spec.contentType("application/json").body(body);
        }
        return spec.request(method, path);
    }

    private void stubAdminWrites() throws Exception {
        when(layoutService.saveCurrentLayout(any())).thenReturn(
                new LayoutService.LayoutHistoryEntry("layout-1", "Indooro", "2026-10-11T00:00:00Z", "2026-10-11T00:00:00Z", 1));
        when(pdfImportService.parsePdf(any())).thenReturn(List.of());
        when(pdfExportService.generatePdf(any())).thenReturn(new byte[]{1, 2, 3});
        when(categoryService.bulkInsert(anyList())).thenReturn(new CatalogBulkResult("All rows indexed", 0, 0, 0, 0, List.of()));
    }
}
