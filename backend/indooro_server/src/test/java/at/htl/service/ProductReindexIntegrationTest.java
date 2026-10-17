package at.htl.service;

import at.htl.model.Product;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.opensearch.client.opensearch.indices.GetIndexRequest;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Integrationstest fuer Reindex und Alias-Umschaltung gegen einen ECHTEN OpenSearch (Opt-in).
 *
 * <p>Ablauf: Quellindex {@code qtest_src} mit Demo-Produkten, Reindex nach {@code qtest_v1} und {@code qtest_v2},
 * Umschaltung des Alias {@code qtest_live} auf v1, dann v2, dann Rollback auf v1. Der Quellindex und alle
 * Versionen bleiben erhalten; am Ende werden alle Indizes {@code qtest_*} geloescht.
 * Der Produktindex {@code products} und der Alias {@code products_live} werden nie beruehrt.
 *
 * <p>Ohne erreichbaren OpenSearch wird der Test uebersprungen (Assumption), nicht fehlgeschlagen.
 * <pre>
 * SEARCH_QUALITY_PORT=9201 sh ./mvnw -B test -Dtest=ProductReindexIntegrationTest
 * </pre>
 * {@code SEARCH_QUALITY_PORT} (Default 9201) = OpenSearch-HTTP-Port auf localhost (gleicher Schalter wie SearchQualityTest).
 */
@QuarkusTest
@TestProfile(ProductReindexIntegrationTest.ReindexIndexProfile.class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ProductReindexIntegrationTest {

    private static final String ENV_PORT = "SEARCH_QUALITY_PORT";
    private static final int DEFAULT_PORT = 9201;
    private static final String SOURCE = "qtest_src";
    private static final String PREFIX = "qtest_v";
    private static final String ALIAS = "qtest_live";
    private static final String PRODUCTION_INDEX = "products";
    private static final String TEST_WILDCARD = "qtest_*";
    private static final Path CATALOG = Path.of("../../demoproducts.ndjson");
    private static final int PRODUCT_COUNT = 12;

    @Inject
    OpenSearchService service;

    @Inject
    OpenSearchClient client;

    @ConfigProperty(name = "opensearch.index")
    String indexName;

    @ConfigProperty(name = "opensearch.index-prefix")
    String indexPrefix;

    @ConfigProperty(name = "opensearch.alias")
    String aliasName;

    private boolean reachable;

    /** Eigener Testpraefix, Quellindex und Alias; nie der Produktindex. */
    public static class ReindexIndexProfile implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of(
                    "opensearch.host", "localhost",
                    "opensearch.port", String.valueOf(configuredPort()),
                    "opensearch.index", SOURCE,
                    "opensearch.index-prefix", PREFIX,
                    "opensearch.alias", ALIAS);
        }
    }

    @BeforeAll
    void setUp() throws IOException {
        reachable = isReachable("localhost", configuredPort());
        if (!reachable) {
            return; // @BeforeEach ueberspringt den Test mit Begruendung
        }
        assertEquals(SOURCE, indexName);
        assertEquals(PREFIX, indexPrefix);
        assertEquals(ALIAS, aliasName);
        assertNotEquals(PRODUCTION_INDEX, indexName);

        deleteTestIndices();
        client.indices().create(c -> c.index(SOURCE));

        List<Product> catalog = loadCatalog();
        List<Product> products = catalog.subList(0, Math.min(PRODUCT_COUNT, catalog.size()));
        CatalogBulkResult result = service.indexProducts(products);
        if (result.failed() > 0 || result.unknown() > 0) {
            throw new IllegalStateException("Bulk-Indexierung in " + SOURCE + " unvollstaendig: failed="
                    + result.failed() + ", unknown=" + result.unknown());
        }
        client.indices().refresh(r -> r.index(SOURCE));
    }

    @BeforeEach
    void requireOpenSearch() {
        Assumptions.assumeTrue(reachable,
                "OpenSearch nicht erreichbar – ProductReindexIntegrationTest übersprungen (localhost:" + configuredPort() + ")");
    }

    @AfterAll
    void tearDown() {
        if (reachable) {
            deleteTestIndices();
        }
    }

    @Test
    void reindexAndAliasSwitchKeepSourceAndVersions() throws IOException {
        long expected = documentCount(SOURCE);
        assertTrue(expected > 0, "Quellindex " + SOURCE + " hat keine Dokumente");

        OpenSearchService.ReindexResult first = service.reindexProducts();
        assertEquals(SOURCE, first.source());
        assertEquals("qtest_v1", first.target());
        assertEquals(expected, first.sourceCount());
        assertEquals(expected, first.targetCount());
        assertEquals("OK", first.status());
        assertEquals(expected, documentCount("qtest_v1"));

        OpenSearchService.ReindexResult second = service.reindexProducts();
        assertEquals("qtest_v2", second.target());
        assertEquals(expected, second.targetCount());
        assertTrue(indexExists("qtest_v1"), "qtest_v1 muss nach dem zweiten Reindex erhalten bleiben");

        OpenSearchService.ActivateResult toV1 = service.activateIndex("qtest_v1");
        assertEquals(ALIAS, toV1.alias());
        assertEquals("qtest_v1", toV1.index());
        assertEquals(List.of(), toV1.previous());
        assertEquals(Set.of("qtest_v1"), aliasTargets());
        assertEquals(expected, documentCount(ALIAS));

        OpenSearchService.ActivateResult toV2 = service.activateIndex("qtest_v2");
        assertEquals(List.of("qtest_v1"), toV2.previous());
        assertEquals(Set.of("qtest_v2"), aliasTargets());
        assertTrue(indexExists("qtest_v1"), "qtest_v1 darf nach der Umschaltung nicht geloescht sein");
        assertTrue(indexExists(SOURCE), "Quellindex darf nicht geloescht sein");

        OpenSearchService.ActivateResult rollback = service.activateIndex("qtest_v1");
        assertEquals(List.of("qtest_v2"), rollback.previous());
        assertEquals(Set.of("qtest_v1"), aliasTargets());
        assertEquals(expected, documentCount(SOURCE));
    }

    private long documentCount(String index) throws IOException {
        return client.count(c -> c.index(index)).count();
    }

    private boolean indexExists(String index) throws IOException {
        return client.indices().exists(e -> e.index(index)).value();
    }

    private Set<String> aliasTargets() throws IOException {
        return client.indices().getAlias(a -> a.name(ALIAS)).result().keySet();
    }

    /** Loescht ausschliesslich Indizes mit dem Testpraefix {@code qtest_}. */
    private void deleteTestIndices() {
        try {
            for (String name : client.indices().get(GetIndexRequest.of(g -> g.index(TEST_WILDCARD))).result().keySet()) {
                if (!name.startsWith("qtest_")) continue;
                client.indices().delete(d -> d.index(name));
            }
        } catch (Exception ignored) {
            // Nichts zu loeschen oder OpenSearch nicht erreichbar.
        }
    }

    private List<Product> loadCatalog() throws IOException {
        if (!Files.exists(CATALOG)) {
            throw new IllegalStateException("Katalog nicht gefunden: " + CATALOG.toAbsolutePath());
        }
        ObjectMapper mapper = new ObjectMapper();
        List<Product> products = new ArrayList<>();
        for (String line : Files.readAllLines(CATALOG, StandardCharsets.UTF_8)) {
            if (line.isBlank()) continue;
            JsonNode node = mapper.readTree(line);
            // Bulk-Action-Zeilen ({"index": ...}) haben kein "id"-Feld und werden uebersprungen.
            if (node.has("id")) {
                products.add(mapper.treeToValue(node, Product.class));
            }
        }
        return products;
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
