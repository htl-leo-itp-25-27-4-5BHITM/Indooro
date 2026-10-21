package at.htl.admin.readiness;

import at.htl.admin.readiness.ReadinessDtos.ProductPage;
import at.htl.admin.readiness.ReadinessDtos.ReadinessInput;
import at.htl.admin.readiness.ReadinessDtos.ReadinessReport;
import at.htl.model.Product;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** A store with own products is checked against those only; a store without own products keeps the global catalog. */
class StoreProductSourceTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final UUID STORE_ID = UUID.fromString("b0308337-1d4b-4096-b022-200e6118e86c");
    private static final String STORE_CODE = "SPAR-Leonding-002";
    private static final String MATCHING_CODE = "520/1/1/1";

    private static Product global(int id, String layoutCode) {
        return new Product(id, "Global " + id, 1.0, layoutCode, null, null);
    }

    private static Product ownByCode(int id, String layoutCode) {
        return new Product(id, "Own " + id, 1.0, layoutCode, null, STORE_CODE);
    }

    private static Product ownById(int id, String layoutCode) {
        return new Product(id, "Own " + id, 1.0, layoutCode, STORE_ID.toString(), null);
    }

    @Test
    void ownProductsReplaceTheGlobalCatalog() {
        List<Product> loaded = List.of(global(1, "999/9/9/9"), global(2, "999/9/9/9"),
                ownByCode(3, MATCHING_CODE), ownById(4, MATCHING_CODE));

        ProductPage page = StoreProductSource.select(loaded, STORE_ID, STORE_CODE, false);

        assertEquals(List.of(3, 4), page.products().stream().map(ReadinessDtos.ProductRef::id).toList());
        assertEquals(2, page.skippedGlobalProducts());
        assertFalse(page.truncated());
    }

    @Test
    void storeWithoutOwnProductsKeepsTheGlobalCatalog() {
        List<Product> loaded = List.of(global(1, "999/9/9/9"), global(2, "999/9/9/9"));

        ProductPage page = StoreProductSource.select(loaded, STORE_ID, STORE_CODE, true);

        assertEquals(2, page.products().size());
        assertEquals(0, page.skippedGlobalProducts());
        assertTrue(page.truncated());
    }

    @Test
    void storeIdMatchIgnoresCaseAndBlankStoreCodeMatchesNothing() {
        Product upper = new Product(5, "Own", 1.0, MATCHING_CODE, STORE_ID.toString().toUpperCase(), null);

        ProductPage page = StoreProductSource.select(List.of(global(1, "x"), upper), STORE_ID, "  ", false);

        assertEquals(1, page.products().size());
        assertEquals(1, page.skippedGlobalProducts());
    }

    @Test
    void globalProductsCreateNeitherNoShelfNorDuplicateFindingsWhenTheStoreHasOwnProducts() {
        List<Product> loaded = new ArrayList<>();
        // Global legacy products: ids overlap with the own ones and none matches the shelf.
        for (int id = 1; id <= 5; id++) {
            loaded.add(global(id, "999/9/9/9"));
        }
        loaded.add(ownByCode(3, MATCHING_CODE));
        loaded.add(ownByCode(4, MATCHING_CODE));

        ReadinessReport report = evaluate(StoreProductSource.select(loaded, STORE_ID, STORE_CODE, false));

        assertTrue(report.findings().stream().noneMatch(f -> "PRODUCT_NO_SHELF".equals(f.code())), report.findings().toString());
        assertTrue(report.findings().stream().noneMatch(f -> "DUPLICATE_PRODUCT_ID".equals(f.code())), report.findings().toString());
        assertEquals(2, report.counts().products());
        assertEquals(5, report.counts().skippedGlobalProducts());
    }

    @Test
    void globalCatalogIsCheckedAsBeforeWhenTheStoreHasNoOwnProducts() {
        List<Product> loaded = List.of(global(1, "999/9/9/9"), global(2, MATCHING_CODE), global(2, MATCHING_CODE));

        ReadinessReport report = evaluate(StoreProductSource.select(loaded, STORE_ID, STORE_CODE, false));

        assertTrue(report.findings().stream().anyMatch(f -> "PRODUCT_NO_SHELF".equals(f.code()) && f.productId() == 1));
        assertTrue(report.findings().stream().anyMatch(f -> "DUPLICATE_PRODUCT_ID".equals(f.code()) && f.productId() == 2));
        assertEquals(3, report.counts().products());
        assertEquals(0, report.counts().skippedGlobalProducts());
    }

    private static ReadinessReport evaluate(ProductPage page) {
        return new StoreReadinessEvaluator().evaluate(new ReadinessInput(
                STORE_ID, UUID.randomUUID(), 1, layoutWithOneShelf(), page.products(), page.truncated(),
                List.of(), 8.0, "market", page.skippedGlobalProducts()));
    }

    private static JsonNode layoutWithOneShelf() {
        ObjectNode layout = JSON.createObjectNode();
        ObjectNode grid = layout.putObject("gridSize");
        grid.put("width", 10);
        grid.put("height", 10);
        var elements = layout.putArray("elements");
        ObjectNode entrance = elements.addObject();
        entrance.put("id", "e1").put("type", "entrance").put("x", 0).put("y", 0).put("width", 1).put("height", 1);
        ObjectNode shelf = elements.addObject();
        shelf.put("id", "s1").put("type", "shelf").put("x", 3).put("y", 3).put("width", 2).put("height", 1);
        shelf.put("category", "520/1/1/1").put("label", "Milch");
        return layout;
    }
}
