package at.htl.resource;

import at.htl.model.Product;
import at.htl.service.OpenSearchService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import java.util.List;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Without indooro.catalog.default-store-code: requests without a store keep the old, unfiltered behavior. */
@QuarkusTest
class ProductStoreReadTest {

    private static final String PILOT_CODE = "SPAR-Leonding-001";

    @InjectMock OpenSearchService products;

    @Test
    void searchWithStoreCodePassesStoreFilter() throws Exception {
        when(products.searchProducts(anyString(), anyInt(), isNull(), any())).thenReturn(List.of(product(101, PILOT_CODE)));

        given().queryParam("q", "Backpulver").queryParam("storeCode", PILOT_CODE)
                .when().get("/api/products/search")
                .then().statusCode(200).body("[0].storeCode", equalTo(PILOT_CODE));

        verify(products).searchProducts("Backpulver", 10, null, PILOT_CODE);
    }

    @Test
    void searchWithoutStoreAndWithoutDefaultStaysUnfiltered() throws Exception {
        given().queryParam("q", "Backpulver")
                .when().get("/api/products/search")
                .then().statusCode(200);

        verify(products).searchProducts("Backpulver", 10, null, null);
    }

    @Test
    void listWithStoreCodePassesStoreFilter() throws Exception {
        given().queryParam("storeCode", PILOT_CODE)
                .when().get("/api/products")
                .then().statusCode(200);

        verify(products).getAllProducts(100, null, PILOT_CODE);
    }

    @Test
    void productByIdWithStoreCodeLooksUpInsideStore() throws Exception {
        when(products.getProductById(101, null, PILOT_CODE)).thenReturn(product(101, PILOT_CODE));

        given().queryParam("storeCode", PILOT_CODE)
                .when().get("/api/products/101")
                .then().statusCode(200).body("id", equalTo(101));

        verify(products).getProductById(101, null, PILOT_CODE);
    }

    private static Product product(int id, String storeCode) {
        return new Product(id, "Backpulver", 0.89, "310/1/1/1", null, storeCode);
    }
}
