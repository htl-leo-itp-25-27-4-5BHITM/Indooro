package at.htl.service;

import at.htl.model.Product;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.opensearch.client.opensearch.OpenSearchClient;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

/**
 * Marktisolation gegen einen ECHTEN OpenSearch mit dem Repo-Mapping ({@code products-index.json}).
 *
 * <p>Zwei Maerkte haben dasselbe Produkt ("SPAR Frische Vollmilch 1L") unter derselben Produkt-ID 1, aber mit
 * verschiedenem {@code layoutCode}. Dazu kommt ein Altdokument ohne {@code storeCode}. Geprueft wird nur das
 * marktgebundene Verhalten (Liste, Suche, Abfrage per ID). Das Verhalten ohne Markt wird bewusst nicht geprueft.
 *
 * <p>Faellt das Mapping von {@code storeCode} auf {@code text} zurueck, wird "SPAR-Iso-A" in Teilterme zerlegt,
 * der exakte Term-Filter trifft nichts mehr und dieser Test wird rot.
 *
 * <p>Lokal ohne erreichbaren OpenSearch wird der Test uebersprungen. In der CI ({@code CI=true}) schlaegt er
 * stattdessen fehl, damit er nie still entfaellt. Eigener Index {@code qiso_products}; der Produktindex
 * {@code products} wird nie beruehrt.
 * <pre>
 * docker run -d --name indooro-iso-os -p 127.0.0.1:9201:9200 -e discovery.type=single-node \
 *   -e plugins.security.disabled=true -e DISABLE_INSTALL_DEMO_CONFIG=true opensearchproject/opensearch:2.9.0
 * sh ./mvnw -B test -Dtest=StoreIsolationOpenSearchIntegrationTest
 * </pre>
 * Port ueber {@code STORE_ISOLATION_OPENSEARCH_PORT} (Default 9201; die CI setzt 9200 fuer den Service-Container).
 */
@QuarkusTest
@TestProfile(StoreIsolationOpenSearchIntegrationTest.IsolationIndexProfile.class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class StoreIsolationOpenSearchIntegrationTest {

    private static final String ENV_PORT = "STORE_ISOLATION_OPENSEARCH_PORT";
    private static final int DEFAULT_PORT = 9201;
    private static final String INDEX = "qiso_products";

    private static final String STORE_A = "SPAR-Iso-A";
    private static final String STORE_B = "Spar-Hörsching-Iso-B";
    private static final String LAYOUT_A = "520/1/1/1";
    private static final String LAYOUT_B = "310/2/1/1";
    private static final String LAYOUT_LEGACY = "999/9/9/9";
    private static final String MILK = "SPAR Frische Vollmilch 1L";

    @Inject
    OpenSearchService service;

    @Inject
    OpenSearchClient client;

    @ConfigProperty(name = "opensearch.index")
    String indexName;

    private boolean reachable;

    /** Eigener Index mit eigenem Praefix und Alias; nie der Produktindex. */
    public static class IsolationIndexProfile implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of(
                    "opensearch.host", "localhost",
                    "opensearch.port", String.valueOf(configuredPort()),
                    "opensearch.index", INDEX,
                    "opensearch.index-prefix", "qiso_v",
                    "opensearch.alias", "qiso_live");
        }
    }

    @BeforeAll
    void setUp() throws IOException {
        reachable = isReachable("localhost", configuredPort());
        if (!reachable) {
            return;
        }
        assertEquals(INDEX, indexName);
        assertNotEquals("products", indexName);
        deleteIndex();
        client.indices().create(ProductIndexDefinition.createIndexRequest(INDEX));

        service.indexProduct(product(1, MILK, LAYOUT_A, STORE_A));
        service.indexProduct(product(1, MILK, LAYOUT_B, STORE_B));
        service.indexProduct(product(2, "Käse Gouda Scheiben", "310/3/1/1", STORE_B));
        // Altdokument: gleiche Produkt-ID 1, kein storeCode.
        service.indexProduct(product(1, "Vollmilch Legacy", LAYOUT_LEGACY, null));
    }

    @BeforeEach
    void requireOpenSearch() {
        if (!reachable && isCi()) {
            fail("OpenSearch nicht erreichbar auf localhost:" + configuredPort()
                    + " – in der CI darf StoreIsolationOpenSearchIntegrationTest nicht uebersprungen werden."
                    + " Service-Container im Job backend-test pruefen.");
        }
        Assumptions.assumeTrue(reachable,
                "OpenSearch nicht erreichbar – StoreIsolationOpenSearchIntegrationTest übersprungen (localhost:" + configuredPort() + ")");
    }

    @AfterAll
    void tearDown() {
        if (reachable) {
            deleteIndex();
        }
    }

    @Test
    void listReturnsOnlyTheOwnStoresDocuments() throws IOException {
        List<Product> a = service.getAllProducts(100, null, STORE_A);
        assertEquals(List.of(LAYOUT_A), layouts(a));
        assertTrue(a.stream().allMatch(p -> STORE_A.equals(p.getStoreCode())));

        List<Product> b = service.getAllProducts(100, null, STORE_B);
        assertEquals(Set.of(LAYOUT_B, "310/3/1/1"), Set.copyOf(layouts(b)));
        assertEquals(2, b.size());
        assertTrue(b.stream().allMatch(p -> STORE_B.equals(p.getStoreCode())));
    }

    @Test
    void searchReturnsOnlyTheOwnStoresDocuments() throws IOException {
        List<Product> a = service.searchProducts("Vollmilch", 10, null, STORE_A);
        assertEquals(List.of(LAYOUT_A), layouts(a), "Markt A darf nur sein eigenes Regal sehen");
        assertEquals(MILK, a.get(0).getName());

        List<Product> b = service.searchProducts("Vollmilch", 10, null, STORE_B);
        assertEquals(List.of(LAYOUT_B), layouts(b), "Markt B darf nur sein eigenes Regal sehen");
        assertEquals(MILK, b.get(0).getName());
    }

    @Test
    void searchDoesNotLeakOtherStoresOrLegacyDocuments() throws IOException {
        assertTrue(service.searchProducts("Käse", 10, null, STORE_A).isEmpty(),
                "Produkt nur in Markt B darf in Markt A nicht erscheinen");
        assertEquals(1, service.searchProducts("Käse", 10, null, STORE_B).size(), "Umlaut in Suche und Marktcode");
        assertTrue(service.searchProducts("Legacy", 10, null, STORE_A).isEmpty());
        assertTrue(service.searchProducts("Legacy", 10, null, STORE_B).isEmpty());
    }

    @Test
    void getByIdReturnsTheOwnStoresDocumentForTheSharedProductId() throws IOException {
        Product a = service.getProductById(1, null, STORE_A);
        assertNotNull(a);
        assertEquals(STORE_A, a.getStoreCode());
        assertEquals(LAYOUT_A, a.getLayoutCode());

        Product b = service.getProductById(1, null, STORE_B);
        assertNotNull(b);
        assertEquals(STORE_B, b.getStoreCode());
        assertEquals(LAYOUT_B, b.getLayoutCode());

        assertNull(service.getProductById(2, null, STORE_A), "ID 2 existiert nur in Markt B");
        assertNotNull(service.getProductById(2, null, STORE_B));
    }

    @Test
    void umlautStoreCodeIsMatchedExactly() throws IOException {
        List<Product> all = service.getAllProducts(100, null, STORE_B);
        assertEquals(2, all.size());
        assertNotNull(service.getProductById(1, null, STORE_B));
        assertEquals(1, service.searchProducts("Vollmilch", 10, null, STORE_B).size());
    }

    @Test
    void lowercaseStoreCodeMatchesNothing() throws IOException {
        for (String code : List.of(STORE_A.toLowerCase(), STORE_B.toLowerCase())) {
            assertTrue(service.getAllProducts(100, null, code).isEmpty(), "list " + code);
            assertTrue(service.searchProducts("Vollmilch", 10, null, code).isEmpty(), "search " + code);
            assertNull(service.getProductById(1, null, code), "get " + code);
        }
    }

    @Test
    void unknownStoreCodeMatchesNothing() throws IOException {
        String code = "UNKNOWN-Iso";
        assertTrue(service.getAllProducts(100, null, code).isEmpty());
        assertTrue(service.searchProducts("Vollmilch", 10, null, code).isEmpty());
        assertNull(service.getProductById(1, null, code));
    }

    private static List<String> layouts(List<Product> products) {
        return products.stream().map(Product::getLayoutCode).collect(Collectors.toList());
    }

    private static Product product(int id, String name, String layoutCode, String storeCode) {
        Product product = new Product();
        product.setId(id);
        product.setName(name);
        product.setPrice(1.79);
        product.setLayoutCode(layoutCode);
        product.setStoreCode(storeCode);
        return product;
    }

    private void deleteIndex() {
        try {
            if (client.indices().exists(e -> e.index(INDEX)).value()) {
                client.indices().delete(d -> d.index(INDEX));
            }
        } catch (Exception ignored) {
            // Nichts zu loeschen oder OpenSearch nicht erreichbar.
        }
    }

    private static boolean isCi() {
        return "true".equalsIgnoreCase(System.getenv("CI"));
    }

    private static int configuredPort() {
        String raw = System.getenv(ENV_PORT);
        if (raw == null || raw.isBlank()) raw = System.getProperty(ENV_PORT);
        return (raw == null || raw.isBlank()) ? DEFAULT_PORT : Integer.parseInt(raw.trim());
    }

    private static boolean isReachable(String host, int port) {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), 500);
            return true;
        } catch (IOException e) {
            return false;
        }
    }
}
