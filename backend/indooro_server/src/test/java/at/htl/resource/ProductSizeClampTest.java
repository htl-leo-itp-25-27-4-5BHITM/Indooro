package at.htl.resource;

import at.htl.service.OpenSearchService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import java.util.List;

import static io.restassured.RestAssured.given;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Out-of-range size values are clamped (not rejected); missing sizes keep their defaults. */
@QuarkusTest
class ProductSizeClampTest {

    @InjectMock OpenSearchService products;

    @Test
    void listSizeIsClampedToOneToFiveHundred() throws Exception {
        when(products.getAllProducts(anyInt(), any(), any())).thenReturn(List.of());

        given().queryParam("size", 9999).when().get("/api/products").then().statusCode(200);
        given().queryParam("size", 0).when().get("/api/products").then().statusCode(200);

        verify(products).getAllProducts(500, null, null);
        verify(products).getAllProducts(1, null, null);
    }

    @Test
    void listDefaultSizeIsUnchanged() throws Exception {
        when(products.getAllProducts(anyInt(), any(), any())).thenReturn(List.of());

        given().when().get("/api/products").then().statusCode(200);

        verify(products).getAllProducts(100, null, null);
    }

    @Test
    void searchSizeIsClampedToOneToOneHundred() throws Exception {
        when(products.searchProducts(anyString(), anyInt(), isNull(), any())).thenReturn(List.of());

        given().queryParam("q", "mehl").queryParam("size", 1000).when().get("/api/products/search").then().statusCode(200);
        given().queryParam("q", "mehl").queryParam("size", -3).when().get("/api/products/search").then().statusCode(200);

        verify(products).searchProducts("mehl", 100, null, null);
        verify(products).searchProducts("mehl", 1, null, null);
    }
}
