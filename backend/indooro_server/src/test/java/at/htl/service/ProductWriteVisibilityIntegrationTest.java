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
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Regression: "Produkt anlegen, dann in der Admin-Liste sehen" gegen einen ECHTEN OpenSearch (Opt-in).
 *
 * <p>Die Admin-UI laedt die Produktliste unmittelbar nach dem POST/DELETE neu. Ohne {@code refresh=wait_for}
 * beim Einzelschreiben war das neue Produkt bis zum naechsten Index-Refresh (Standard 1 s) nicht sichtbar bzw.
 * ein geloeschtes noch da. Der Test legt einen eigenen Index {@code qvis_products} mit dem echten Produktmapping an
 * und fragt direkt nach jedem Schreibvorgang mit dem Markt-Filter der Admin-Liste ab; kein Sleep, kein manueller Refresh.
 * Der Produktindex {@code products} wird nie beruehrt.
 *
 * <p>Ohne erreichbaren OpenSearch wird der Test uebersprungen.
 * <pre>
 * SEARCH_QUALITY_PORT=9200 sh ./mvnw -B test -Dtest=ProductWriteVisibilityIntegrationTest
 * </pre>
 */
@QuarkusTest
@TestProfile(ProductWriteVisibilityIntegrationTest.VisibilityIndexProfile.class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ProductWriteVisibilityIntegrationTest {

    private static final String ENV_PORT = "SEARCH_QUALITY_PORT";
    private static final int DEFAULT_PORT = 9201;
    private static final String INDEX = "qvis_products";
    private static final String STORE_ID = "11111111-1111-1111-1111-111111111111";
    private static final String STORE_CODE = "QVIS-STORE";

    @Inject
    OpenSearchService service;

    @Inject
    OpenSearchClient client;

    @ConfigProperty(name = "opensearch.index")
    String indexName;

    private boolean reachable;

    /** Eigener Index mit eigenem Praefix und Alias; nie der Produktindex. */
    public static class VisibilityIndexProfile implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of(
                    "opensearch.host", "localhost",
                    "opensearch.port", String.valueOf(configuredPort()),
                    "opensearch.index", INDEX,
                    "opensearch.index-prefix", "qvis_v",
                    "opensearch.alias", "qvis_live");
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
    }

    @BeforeEach
    void requireOpenSearch() {
        Assumptions.assumeTrue(reachable,
                "OpenSearch nicht erreichbar – ProductWriteVisibilityIntegrationTest übersprungen (localhost:" + configuredPort() + ")");
    }

    @AfterAll
    void tearDown() {
        if (reachable) {
            deleteIndex();
        }
    }

    @Test
    void createdProductIsListedForItsStoreImmediately() throws IOException {
        Product product = product(4711, "Regression Apfelsaft");

        service.indexProduct(product);

        var page = service.searchAdminProductsPage("", 0, 20, "id", null, STORE_ID, STORE_CODE);
        assertTrue(page.content().stream().anyMatch(item -> item.getId() == 4711),
                "frisch angelegtes Produkt muss ohne Wartezeit in der Markt-Liste stehen");

        var searched = service.searchAdminProductsPage("Regression Apfelsaft", 0, 20, "id", null, STORE_ID, STORE_CODE);
        assertTrue(searched.content().stream().anyMatch(item -> item.getId() == 4711),
                "frisch angelegtes Produkt muss ohne Wartezeit per Namenssuche gefunden werden");
    }

    @Test
    void deletedProductDisappearsFromTheListImmediately() throws IOException {
        service.indexProduct(product(4712, "Regression Birnensaft"));
        var before = service.searchAdminProductsPage("", 0, 20, "id", null, STORE_ID, STORE_CODE);
        assertTrue(before.content().stream().anyMatch(item -> item.getId() == 4712));

        assertTrue(service.deleteProduct(4712, STORE_CODE));

        var after = service.searchAdminProductsPage("", 0, 20, "id", null, STORE_ID, STORE_CODE);
        assertTrue(after.content().stream().noneMatch(item -> item.getId() == 4712),
                "geloeschtes Produkt darf direkt nach dem Loeschen nicht mehr in der Liste stehen");
    }

    private static Product product(int id, String name) {
        Product product = new Product();
        product.setId(id);
        product.setName(name);
        product.setPrice(2.49);
        product.setLayoutCode("310/1/1/1");
        product.setStoreId(STORE_ID);
        product.setStoreCode(STORE_CODE);
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
