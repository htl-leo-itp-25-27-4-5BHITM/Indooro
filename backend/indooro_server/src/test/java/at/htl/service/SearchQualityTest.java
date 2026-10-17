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

import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Suchqualitaet gegen einen ECHTEN OpenSearch (Demo-Katalog {@code demoproducts.ndjson}, Queries aus
 * {@code src/test/resources/search-quality/queries.csv}). Misst hit@3 (Gate-Kennzahl), precision@3 (strikt)
 * und hit@3 je Query-Art (kind). Schreibt den Bericht nach stdout und {@code target/search-quality-report.txt}.
 *
 * <p>Ohne erreichbaren OpenSearch wird der Test uebersprungen (Assumption), nicht fehlgeschlagen.
 * Der Test schreibt ausschliesslich in den Testindex {@code products_quality_test} und beruehrt den Produktindex
 * {@code products} nie.
 *
 * <p>Start (OpenSearch lokal auf Port 9201):
 * <pre>
 * SEARCH_QUALITY_PORT=9201 SEARCH_QUALITY_MIN_HIT=0.85 sh ./mvnw -B test -Dtest=SearchQualityTest
 * </pre>
 * {@code SEARCH_QUALITY_PORT} (Default 9201) = OpenSearch-HTTP-Port auf localhost.
 * {@code SEARCH_QUALITY_MIN_HIT} (ohne Wert: nur messen, nie fehlschlagen) = Mindestwert fuer hit@3.
 */
@QuarkusTest
@TestProfile(SearchQualityTest.QualityIndexProfile.class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SearchQualityTest {

    private static final String ENV_PORT = "SEARCH_QUALITY_PORT";
    private static final String ENV_MIN_HIT = "SEARCH_QUALITY_MIN_HIT";
    private static final int DEFAULT_PORT = 9201;
    private static final String TEST_INDEX = "products_quality_test";
    private static final String PRODUCTION_INDEX = "products";
    private static final int TOP_K = 3;
    private static final int SEARCH_SIZE = 10;
    private static final Path CATALOG = Path.of("../../demoproducts.ndjson");
    private static final Path REPORT = Path.of("target/search-quality-report.txt");

    @Inject
    OpenSearchService service;

    @Inject
    OpenSearchClient client;

    @ConfigProperty(name = "opensearch.index")
    String indexName;

    private boolean reachable;
    private Map<Integer, String> productNames;
    private List<QueryCase> queries;

    record QueryCase(String query, Set<Integer> relevantIds, String kind) {}

    record Outcome(QueryCase queryCase, List<Product> top, int relevantInTop) {
        boolean hit() { return relevantInTop > 0; }
        double precision() { return relevantInTop / (double) Math.min(TOP_K, queryCase.relevantIds().size()); }
    }

    /** Testindex-Konfiguration: eigener Index, nie der Produktindex. */
    public static class QualityIndexProfile implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of(
                    "opensearch.host", "localhost",
                    "opensearch.port", String.valueOf(configuredPort()),
                    "opensearch.index", TEST_INDEX);
        }
    }

    @BeforeAll
    void setUp() throws IOException {
        reachable = isReachable("localhost", configuredPort());
        if (!reachable) {
            return; // @BeforeEach ueberspringt den Test mit Begruendung
        }
        assertNotEquals(PRODUCTION_INDEX, indexName, "Testindex darf nicht der Produktindex 'products' sein");

        deleteTestIndexQuietly();
        service.createIndex();

        List<Product> catalog = loadCatalog();
        productNames = catalog.stream().collect(Collectors.toMap(Product::getId, Product::getName, (a, b) -> a));
        CatalogBulkResult result = service.indexProducts(catalog);
        if (result.failed() > 0 || result.unknown() > 0) {
            CatalogBulkResult.Row firstProblem = result.rows().stream().filter(r -> !"saved".equals(r.status())).findFirst().orElse(null);
            throw new IllegalStateException("Bulk-Indexierung unvollstaendig: failed=" + result.failed()
                    + ", unknown=" + result.unknown() + ", erstes Problem=" + firstProblem);
        }
        client.indices().refresh(r -> r.index(indexName));

        queries = loadQueries();
    }

    @BeforeEach
    void requireOpenSearch() {
        Assumptions.assumeTrue(reachable,
                "OpenSearch nicht erreichbar – SearchQualityTest übersprungen (localhost:" + configuredPort() + ")");
    }

    @AfterAll
    void tearDown() {
        if (reachable) {
            deleteTestIndexQuietly();
        }
    }

    @Test
    void measureSearchQuality() throws IOException {
        List<Outcome> outcomes = new ArrayList<>();
        for (QueryCase queryCase : queries) {
            List<Product> hits = service.searchProducts(queryCase.query(), SEARCH_SIZE, null, null);
            List<Product> top = hits.stream().limit(TOP_K).toList();
            int relevantInTop = (int) top.stream()
                    .filter(p -> p.getId() != null && queryCase.relevantIds().contains(p.getId()))
                    .count();
            outcomes.add(new Outcome(queryCase, top, relevantInTop));
        }

        long hitCount = outcomes.stream().filter(Outcome::hit).count();
        double hitAt3 = ratio(hitCount, outcomes.size());
        double precisionAt3 = outcomes.stream().mapToDouble(Outcome::precision).average().orElse(0.0);

        TreeMap<String, int[]> byKind = new TreeMap<>();
        for (Outcome outcome : outcomes) {
            int[] counts = byKind.computeIfAbsent(outcome.queryCase().kind(), k -> new int[2]);
            counts[0]++;
            if (outcome.hit()) counts[1]++;
        }

        Set<Integer> missingFromCatalog = new TreeSet<>();
        for (QueryCase queryCase : queries) {
            for (Integer id : queryCase.relevantIds()) {
                if (!productNames.containsKey(id)) missingFromCatalog.add(id);
            }
        }

        String report = buildReport(outcomes, hitAt3, precisionAt3, byKind, missingFromCatalog);
        System.out.println(report);
        Files.createDirectories(REPORT.getParent());
        Files.writeString(REPORT, report, StandardCharsets.UTF_8);

        String minRaw = firstNonBlank(System.getenv(ENV_MIN_HIT), System.getProperty(ENV_MIN_HIT));
        if (minRaw != null) {
            double min = Double.parseDouble(minRaw.trim());
            assertTrue(hitAt3 >= min, String.format(Locale.ROOT,
                    "hit@3 %.3f liegt unter dem Gate %.3f (%s)", hitAt3, min, REPORT));
        }
    }

    private String buildReport(List<Outcome> outcomes, double hitAt3, double precisionAt3,
                               Map<String, int[]> byKind, Set<Integer> missingFromCatalog) {
        StringBuilder sb = new StringBuilder();
        sb.append("Search-Quality-Report ").append(LocalDateTime.now()).append('\n');
        sb.append("Index: ").append(indexName).append(", Katalog: ").append(productNames.size())
                .append(" Produkte, Queries: ").append(outcomes.size()).append('\n');
        sb.append(String.format(Locale.ROOT, "hit@3 (Gate):          %.3f  (%d/%d)%n", hitAt3,
                outcomes.stream().filter(Outcome::hit).count(), outcomes.size()));
        sb.append(String.format(Locale.ROOT, "precision@3 (strikt):  %.3f%n", precisionAt3));
        sb.append("\nnach kind:\n");
        byKind.forEach((kind, counts) -> sb.append(String.format(Locale.ROOT, "  %-10s hit@3 %.3f  (%d/%d)%n",
                kind, ratio(counts[1], counts[0]), counts[1], counts[0])));

        if (!missingFromCatalog.isEmpty()) {
            sb.append("\nWARNUNG: relevante IDs nicht im Katalog: ").append(missingFromCatalog).append('\n');
        }

        List<Outcome> failed = outcomes.stream().filter(o -> !o.hit()).toList();
        sb.append("\nFehlgeschlagen (kein relevanter Treffer in Top-3): ").append(failed.size()).append('\n');
        for (Outcome outcome : failed) {
            QueryCase queryCase = outcome.queryCase();
            String expected = queryCase.relevantIds().stream()
                    .map(id -> id + " " + productNames.getOrDefault(id, "<nicht im Katalog>"))
                    .collect(Collectors.joining("; "));
            String actual = outcome.top().isEmpty() ? "(keine Treffer)" : outcome.top().stream()
                    .map(p -> p.getId() + " " + p.getName())
                    .collect(Collectors.joining("; "));
            sb.append("  - \"").append(queryCase.query()).append("\" [").append(queryCase.kind()).append("]\n");
            sb.append("      erwartet: ").append(expected).append('\n');
            sb.append("      Top-3:    ").append(actual).append('\n');
        }
        return sb.toString();
    }

    private void deleteTestIndexQuietly() {
        try {
            if (client.indices().exists(e -> e.index(indexName)).value()) {
                client.indices().delete(d -> d.index(indexName));
            }
        } catch (Exception ignored) {
            // Testindex existiert nicht oder OpenSearch ist nicht erreichbar: nichts zu loeschen.
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

    private static List<QueryCase> loadQueries() throws IOException {
        try (InputStream in = SearchQualityTest.class.getResourceAsStream("/search-quality/queries.csv")) {
            Objects.requireNonNull(in, "search-quality/queries.csv nicht im Classpath");
            String content = new String(in.readAllBytes(), StandardCharsets.UTF_8).replace("﻿", "");
            List<QueryCase> cases = new ArrayList<>();
            List<String> lines = content.lines().toList();
            for (int i = 1; i < lines.size(); i++) { // Zeile 0 = Header
                String line = lines.get(i);
                if (line.isBlank()) continue;
                String[] parts = line.split(",", 3);
                if (parts.length != 3) {
                    throw new IllegalStateException("queries.csv Zeile " + (i + 1) + " hat keine 3 Spalten: " + line);
                }
                Set<Integer> relevant = Arrays.stream(parts[1].split("\\|"))
                        .map(String::trim)
                        .filter(s -> !s.isEmpty())
                        .map(Integer::valueOf)
                        .collect(Collectors.toCollection(LinkedHashSet::new));
                cases.add(new QueryCase(parts[0].trim(), relevant, parts[2].trim()));
            }
            return cases;
        }
    }

    private static int configuredPort() {
        String raw = firstNonBlank(System.getenv(ENV_PORT), System.getProperty(ENV_PORT));
        return raw == null ? DEFAULT_PORT : Integer.parseInt(raw.trim());
    }

    private static boolean isReachable(String host, int port) {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), 500);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    private static double ratio(long part, long total) {
        return total == 0 ? 0.0 : part / (double) total;
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return null;
    }
}
