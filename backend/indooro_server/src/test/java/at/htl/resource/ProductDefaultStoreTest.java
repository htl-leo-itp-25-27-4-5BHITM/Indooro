package at.htl.resource;

import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import at.htl.service.OpenSearchService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static io.restassured.RestAssured.given;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/** With indooro.catalog.default-store-code set: requests without a store are filtered to the default store. */
@QuarkusTest
@TestProfile(ProductDefaultStoreTest.DefaultStoreProfile.class)
class ProductDefaultStoreTest {

    private static final String DEFAULT_CODE = "SPAR-Leonding-001";

    @InjectMock OpenSearchService products;

    @Test
    void searchWithoutStoreUsesDefaultStore() throws Exception {
        given().queryParam("q", "Backpulver")
                .when().get("/api/products/search")
                .then().statusCode(200);

        verify(products).searchProducts("Backpulver", 10, null, DEFAULT_CODE);
    }

    @Test
    void explicitStoreCodeOverridesDefaultStore() throws Exception {
        given().queryParam("q", "Backpulver").queryParam("storeCode", "demo-store")
                .when().get("/api/products/search")
                .then().statusCode(200);

        verify(products).searchProducts("Backpulver", 10, null, "demo-store");
        verify(products, never()).searchProducts(anyString(), anyInt(), any(), eq(DEFAULT_CODE));
    }

    @Test
    void listAndProductByIdWithoutStoreUseDefaultStore() throws Exception {
        given().when().get("/api/products").then().statusCode(200);
        verify(products).getAllProducts(100, null, DEFAULT_CODE);

        given().when().get("/api/products/101").then().statusCode(404);
        verify(products).getProductById(101, null, DEFAULT_CODE);
    }

    public static class DefaultStoreProfile implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of("indooro.catalog.default-store-code", DEFAULT_CODE);
        }
    }
}
