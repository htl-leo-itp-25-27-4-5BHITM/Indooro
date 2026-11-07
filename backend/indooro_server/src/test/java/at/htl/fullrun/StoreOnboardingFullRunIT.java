package at.htl.fullrun;

import at.htl.admin.service.AdminAccessService;
import at.htl.admin.service.AdminRole;
import at.htl.admin.service.CurrentAdminUser;
import at.htl.service.OpenSearchService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import io.quarkus.test.security.TestSecurity;
import io.restassured.response.Response;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.opensearch.client.opensearch.OpenSearchClient;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

/**
 * Lokaler End-to-End-Durchlauf der Markt-Einrichtung (Story #194) gegen die ECHTEN REST-Endpunkte,
 * eine echte PostgreSQL-Datenbank (Flyway) und einen echten OpenSearch. Datensatzunabhaengig: alles
 * Datensatzspezifische steht in {@code payload.json} (erzeugt von scripts/ops/full_run/prepare.mjs).
 *
 * <p>Laeuft nur, wenn die Systemeigenschaft {@code fullrun.payload} gesetzt ist; sonst wird die Klasse
 * ueberspringen (Assumption). Der Klassenname endet auf {@code IT} und gehoert damit nicht zu den
 * Standard-Includes von Surefire ({@code *Test}); {@code mvn test} und die CI fuehren sie nicht aus.
 * Start ueber scripts/ops/full_run/run_full_local.sh.
 *
 * <p>Nicht abgedeckt: Keycloak-Anmeldung ({@code @TestSecurity}, Rolle admin, AdminAccessService gemockt),
 * Browser-Klicks, echtes BLE.
 */
@QuarkusTest
@TestProfile(StoreOnboardingFullRunIT.FullRunProfile.class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class StoreOnboardingFullRunIT {

    static final String PAYLOAD = "fullrun.payload";
    static final String INDEX = "qfull_products";

    /** Eigene Index-/Alias-Namen; Flyway und Datenbank nur, wenn der Lauf angefordert wurde. */
    public static class FullRunProfile implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            Map<String, String> config = new HashMap<>();
            if (System.getProperty(PAYLOAD) == null) {
                return config;
            }
            config.put("quarkus.flyway.migrate-at-start", "true");
            config.put("quarkus.datasource.jdbc.url", System.getProperty("fullrun.db.url"));
            config.put("quarkus.datasource.username", System.getProperty("fullrun.db.user"));
            config.put("quarkus.datasource.password", System.getenv().getOrDefault("FULLRUN_DB_PASSWORD", ""));
            config.put("opensearch.host", "127.0.0.1");
            config.put("opensearch.port", System.getProperty("fullrun.os.port", "59200"));
            config.put("opensearch.index", INDEX);
            config.put("opensearch.index-prefix", "qfull_v");
            config.put("opensearch.alias", "qfull_live");
            return config;
        }
    }

    @Inject ObjectMapper mapper;
    @Inject OpenSearchService openSearch;
    @Inject OpenSearchClient client;
    @InjectMock AdminAccessService access;

    private JsonNode payload;
    private Path outDir;
    private final StringBuilder report = new StringBuilder();
    private int step;

    @BeforeAll
    void loadPayload() throws IOException {
        String file = System.getProperty(PAYLOAD);
        Assumptions.assumeTrue(file != null && !file.isBlank(), "fullrun.payload nicht gesetzt - Full-Run uebersprungen");
        payload = mapper.readTree(Files.readString(Path.of(file)));
        outDir = Path.of(System.getProperty("fullrun.out", Path.of(file).getParent().toString()));
        int port = Integer.parseInt(System.getProperty("fullrun.os.port", "59200"));
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("127.0.0.1", port), 1000);
        }
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void storeOnboardingFromEmptyMarketToCustomerSearch() throws Exception {
        when(access.currentUser()).thenReturn(new CurrentAdminUser("full-run", "full-run", null, AdminRole.ADMIN, null));
        long start = System.currentTimeMillis();
        JsonNode dataset = payload.get("dataset");
        JsonNode storeDef = dataset.get("store");
        JsonNode second = dataset.get("secondMarket");
        String storeCode = storeDef.get("storeCode").asText();
        report.append("# Full-Run Markt-Einrichtung: ").append(dataset.path("name").asText()).append("\n\n")
                .append("Markt `").append(storeCode).append("`, Zweitmarkt `").append(second.get("storeCode").asText()).append("`\n\n")
                .append("| Schritt | Ergebnis | ms |\n|---|---|---|\n");
        try {
            run();
        } finally {
            report.append("\nGesamtdauer: ").append(System.currentTimeMillis() - start).append(" ms\n");
            Files.createDirectories(outDir);
            Files.writeString(outDir.resolve("report.md"), report.toString(), StandardCharsets.UTF_8);
        }
    }

    private void run() throws Exception {
        JsonNode dataset = payload.get("dataset");
        JsonNode storeDef = dataset.get("store");
        JsonNode second = dataset.get("secondMarket");
        String storeCode = storeDef.get("storeCode").asText();
        String secondCode = second.get("storeCode").asText();

        // Frischer Testindex mit dem Repo-Mapping (Start-Vorbereitung ist im Test-Profil aus).
        if (client.indices().exists(e -> e.index(INDEX)).value()) {
            client.indices().delete(d -> d.index(INDEX));
        }
        openSearch.createIndex();

        // 1 Markt anlegen (Region ueber den Regions-Endpunkt)
        long t = now();
        Response region = post("/api/regions", Map.of("code", dataset.get("region").get("code").asText(),
                "name", dataset.get("region").get("name").asText(), "description", "Full-Run"), 200);
        String regionId = region.path("id");
        String storeId = createStore(regionId, storeDef);
        String secondId = createStore(regionId, second);
        assertEquals(storeCode, given().get("/api/stores/" + storeId).then().statusCode(200).extract().path("storeCode"));
        ok("Markt " + storeCode + " und Zweitmarkt " + secondCode + " angelegt (Region " + regionId + ")", t);

        // 2 Beacons registrieren und dem Markt zuordnen
        t = now();
        for (JsonNode b : dataset.get("beacons")) {
            Map<String, Object> body = new HashMap<>();
            body.put("beaconCode", b.get("code").asText());
            body.put("uuid", b.get("uuid").asText());
            body.put("major", b.get("major").asInt());
            body.put("minor", b.get("minor").asInt());
            String beaconId = post("/api/beacons", body, 200).path("id");
            post("/api/beacons/" + beaconId + "/assign", Map.of("storeId", storeId), 200);
        }
        JsonNode assigned = json(given().get("/api/stores/" + storeId + "/beacons").then().statusCode(200).extract().asString());
        assertEquals(dataset.get("beacons").size(), assigned.size(), "zugeordnete Beacons: " + assigned);
        ok(assigned.size() + " Beacons registriert und zugeordnet", t);

        // 3 Layout-JSON importieren: als Entwurf speichern, aktivieren
        t = now();
        // Wie der Editor beim Waehlen von "Zugeordneter Beacon": Layout-Beacons tragen nur den Code (beaconId).
        // Identity (uuid/major/minor/identityKey/beaconDbId) setzt der Editor aus dem Editor-Kontext. Ohne diesen
        // Schritt meldet die Readiness NO_BEACONS (siehe README, Abschnitt "Befund").
        com.fasterxml.jackson.databind.node.ObjectNode layoutSave = (com.fasterxml.jackson.databind.node.ObjectNode) payload.get("layoutSave").deepCopy();
        JsonNode editorBeacons = json(given().get("/api/stores/" + storeId + "/layout/editor-context")
                .then().statusCode(200).extract().asString()).get("assignedBeacons");
        int enriched = 0;
        for (JsonNode element : layoutSave.get("layout").get("elements")) {
            if (!"beacon".equals(element.path("type").asText()) || element.hasNonNull("identityKey")) continue;
            for (JsonNode b : editorBeacons) {
                if (b.get("beaconCode").asText().equals(element.path("beaconId").asText())) {
                    com.fasterxml.jackson.databind.node.ObjectNode e = (com.fasterxml.jackson.databind.node.ObjectNode) element;
                    e.set("beaconDbId", b.get("beaconId"));
                    e.set("identityKey", b.get("identityKey"));
                    e.set("uuid", b.get("uuid"));
                    e.set("major", b.get("major"));
                    e.set("minor", b.get("minor"));
                    enriched++;
                }
            }
        }
        Response draft = given().contentType("application/json").body(layoutSave.toString())
                .post("/api/stores/" + storeId + "/layout/versions").then().statusCode(200).extract().response();
        assertEquals("DRAFT", draft.path("status"));
        String layoutId = draft.path("layoutId");
        ok("Layout als Entwurf gespeichert (Version " + draft.path("versionNo") + ", Beacon-Identity aus Editor-Kontext fuer " + enriched + " Plaetze ergaenzt)", t);

        // 4 aktivieren
        t = now();
        Response active = post("/api/stores/" + storeId + "/layout/versions/" + layoutId + "/activate", Map.of(), 200);
        assertEquals("ACTIVE", active.path("status"));
        JsonNode current = json(given().get("/api/stores/" + storeId + "/layout/current").then().statusCode(200).extract().asString());
        assertEquals(layoutId, current.get("layoutId").asText());
        ok("Layout aktiviert", t);

        // 5 Readiness muss rot sein: keine Produkte
        t = now();
        JsonNode before = readiness(storeId);
        assertEquals("RED", before.get("status").asText(), before.toString());
        assertTrue(codes(before).contains("NO_STORE_PRODUCTS"), "NO_STORE_PRODUCTS erwartet: " + before);
        ok("Readiness vor Import: RED (" + codes(before) + ")", t);

        // 6 Fehler-CSV: genau die dokumentierten Zeilenfehler, nichts geschrieben
        t = now();
        JsonNode errorImport = payload.get("errorImport");
        assertEquals(payload.get("expectedErrors"), errorImport.get("errors"), "Zeilenfehler der Fehler-CSV");
        assertFalse(errorImport.get("wouldSend").asBoolean(), "Mit Fehlern darf die Oberflaeche nicht senden");
        assertEquals(0, productCount(storeCode, storeId), "Nach Fehler-CSV darf nichts geschrieben sein");
        assertTrue(codes(readiness(storeId)).contains("NO_STORE_PRODUCTS"));
        ok("Fehler-CSV: " + errorImport.get("errors").size() + " Zeilenfehler " + errorImport.get("errors")
                + ", Commit gesperrt, 0 Produkte im Markt", t);

        // 7 gute CSV importieren (Bloecke mit Idempotency-Key, wie die Oberflaeche)
        t = now();
        int sent = 0;
        for (JsonNode batch : payload.get("goodImport").get("batches")) {
            String path = batch.get("path").asText();
            Response result = given().contentType("application/json").header("Idempotency-Key", batch.get("idempotencyKey").asText())
                    .body(batch.get("products").toString()).post(path).then().statusCode(200).extract().response();
            assertEquals(batch.get("products").size(), (int) result.path("saved"), result.asString());
            assertEquals(0, (int) result.path("failed"));
            // Wiederholung mit gleichem Schluessel: gespeicherte Antwort, kein erneutes Schreiben
            given().contentType("application/json").header("Idempotency-Key", batch.get("idempotencyKey").asText())
                    .body(batch.get("products").toString()).post(path).then().statusCode(200).header("Idempotent-Replay", "true");
            sent += batch.get("products").size();
        }
        assertEquals(sent, productCount(storeCode, storeId));
        ok("Gute CSV: " + sent + " Produkte gespeichert (Idempotenz-Wiederholung bestaetigt)", t);

        // 8 Readiness muss gruen sein
        t = now();
        JsonNode after = readiness(storeId);
        assertEquals("GREEN", after.get("status").asText(), after.toString());
        assertEquals(0, after.get("findings").size(), after.toString());
        assertEquals(sent, after.get("counts").get("products").asInt());
        ok("Readiness nach Import: GREEN (startklar), " + after.get("counts"), t);

        // 9 freigeben, Kundenliste
        t = now();
        assertFalse(mobileStoreCodes().contains(storeCode), "Vor der Freigabe nicht in der Kundenliste");
        Response released = given().contentType("application/json").patch("/api/stores/" + storeId + "/release").then().statusCode(200).extract().response();
        assertEquals(true, released.path("released"));
        assertTrue(mobileStoreCodes().contains(storeCode), "Nach der Freigabe in der Kundenliste");
        assertFalse(mobileStoreCodes().contains(secondCode), "Zweitmarkt ist nicht freigegeben");
        ok("Markt freigegeben, erscheint in /api/mobile/stores (Zweitmarkt nicht)", t);

        // 10 Zweitmarkt mit gleichnamigen Produkten in anderen Regalen
        t = now();
        Response seeded = given().contentType("application/json").body(second.get("products").toString())
                .post("/api/admin/products/bulk?storeCode=" + secondCode).then().statusCode(200).extract().response();
        assertEquals(second.get("products").size(), (int) seeded.path("saved"), seeded.asString());
        ok("Zweitmarkt " + secondCode + ": " + seeded.path("saved") + " gleichnamige Produkte in anderen Regalen", t);

        // 11 Suche je Markt
        t = now();
        report.append("\n## Suchergebnisse\n\n| Suche | Markt | Treffer (Name / Regal) |\n|---|---|---|\n");
        Map<String, String> secondLayoutByName = new HashMap<>();
        second.get("products").forEach(p -> secondLayoutByName.put(p.get("name").asText(), p.get("layoutCode").asText()));
        int probes = 0;
        for (JsonNode probe : dataset.get("searchProbes")) {
            String q = probe.get("query").asText();
            String name = probe.get("expectedName").asText();
            JsonNode hitsA = search(q, storeCode);
            JsonNode matchA = find(hitsA, name);
            assertNotNull(matchA, "'" + q + "' in " + storeCode + " muss '" + name + "' finden: " + describe(hitsA));
            assertEquals(probe.get("expectedLayoutCode").asText(), matchA.get("layoutCode").asText());
            for (JsonNode hit : hitsA) {
                assertEquals(storeCode, hit.get("storeCode").asText(), "Fremdtreffer in " + storeCode + ": " + hit);
            }
            report.append("| ").append(q).append(" | ").append(storeCode).append(" | ").append(describe(hitsA)).append(" |\n");

            if (secondLayoutByName.containsKey(name)) {
                JsonNode hitsB = search(q, secondCode);
                JsonNode matchB = find(hitsB, name);
                assertNotNull(matchB, "'" + q + "' in " + secondCode + " muss '" + name + "' finden: " + describe(hitsB));
                assertEquals(secondLayoutByName.get(name), matchB.get("layoutCode").asText());
                assertTrue(!matchB.get("layoutCode").asText().equals(matchA.get("layoutCode").asText()),
                        "Zweitmarkt muss ein anderes Regal zeigen");
                for (JsonNode hit : hitsB) {
                    assertEquals(secondCode, hit.get("storeCode").asText(), "Fremdtreffer in " + secondCode + ": " + hit);
                }
                report.append("| ").append(q).append(" | ").append(secondCode).append(" | ").append(describe(hitsB)).append(" |\n");
            }
            // Ohne Markt: keine marktgebundenen Dokumente
            JsonNode unscoped = json(given().queryParam("q", q).queryParam("size", 50).get("/api/products/search")
                    .then().statusCode(200).extract().asString());
            for (JsonNode hit : unscoped) {
                assertTrue(hit.path("storeCode").isMissingNode() || hit.get("storeCode").isNull(),
                        "Suche ohne storeCode liefert ein marktgebundenes Dokument: " + hit);
            }
            report.append("| ").append(q).append(" | (ohne Markt) | ").append(unscoped.size()).append(" Treffer, keine marktgebundenen |\n");
            probes++;
        }
        ok(probes + " Suchanfragen: je Markt eigenes Regal, ohne Markt keine marktgebundenen Dokumente", t);

        report.append("\n## Readiness vor dem Import\n\n```json\n").append(mapper.writerWithDefaultPrettyPrinter().writeValueAsString(before))
                .append("\n```\n\n## Readiness nach dem Import\n\n```json\n")
                .append(mapper.writerWithDefaultPrettyPrinter().writeValueAsString(after)).append("\n```\n");
    }

    // ---- Hilfen ----

    private long now() {
        return System.nanoTime();
    }

    private void ok(String text, long startNanos) {
        step++;
        long ms = (System.nanoTime() - startNanos) / 1_000_000;
        System.out.println("STEP " + step + " ok: " + text + " (" + ms + " ms)");
        report.append("| ").append(step).append(" | ").append(text.replace("|", "\\|")).append(" | ").append(ms).append(" |\n");
    }

    private String createStore(String regionId, JsonNode def) {
        Map<String, Object> body = new HashMap<>();
        body.put("regionId", regionId);
        for (String field : new String[]{"storeCode", "name", "street", "zipCode", "city", "country"}) {
            body.put(field, def.get(field).asText());
        }
        if (def.hasNonNull("latitude")) body.put("latitude", def.get("latitude").asDouble());
        if (def.hasNonNull("longitude")) body.put("longitude", def.get("longitude").asDouble());
        return post("/api/stores", body, 200).path("id");
    }

    private Response post(String path, Object body, int status) {
        return given().contentType("application/json").body(body).post(path).then().statusCode(status).extract().response();
    }

    private JsonNode json(String text) throws IOException {
        return mapper.readTree(text);
    }

    private JsonNode readiness(String storeId) throws IOException {
        return json(given().get("/api/stores/" + storeId + "/readiness").then().statusCode(200).extract().asString());
    }

    private Set<String> codes(JsonNode readiness) {
        Set<String> codes = new HashSet<>();
        readiness.get("findings").forEach(f -> codes.add(f.get("code").asText()));
        return codes;
    }

    private int productCount(String storeCode, String storeId) {
        return given().queryParam("page", 0).queryParam("size", 100).queryParam("storeCode", storeCode)
                .get("/api/admin/products").then().statusCode(200).extract().path("totalElements");
    }

    private Set<String> mobileStoreCodes() throws IOException {
        Set<String> codes = new HashSet<>();
        json(given().get("/api/mobile/stores").then().statusCode(200).extract().asString())
                .forEach(s -> codes.add(s.get("storeCode").asText()));
        return codes;
    }

    private JsonNode search(String q, String storeCode) throws IOException {
        return json(given().queryParam("q", q).queryParam("size", 30).queryParam("storeCode", storeCode)
                .get("/api/products/search").then().statusCode(200).extract().asString());
    }

    private JsonNode find(JsonNode hits, String name) {
        for (JsonNode hit : hits) {
            if (name.equals(hit.get("name").asText())) return hit;
        }
        return null;
    }

    private String describe(JsonNode hits) {
        StringBuilder text = new StringBuilder();
        hits.forEach(h -> text.append(h.get("name").asText()).append(" / ").append(h.get("layoutCode").asText()).append("; "));
        return text.toString();
    }
}
