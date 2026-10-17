package at.htl.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.json.stream.JsonParser;
import org.opensearch.client.json.JsonpMapper;
import org.opensearch.client.json.jackson.JacksonJsonpMapper;
import org.opensearch.client.opensearch._types.mapping.TypeMapping;
import org.opensearch.client.opensearch.indices.CreateIndexRequest;
import org.opensearch.client.opensearch.indices.IndexSettings;

import java.io.IOException;
import java.io.InputStream;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Index-Definition fuer den Produktindex: Mapping und Analyzer aus {@code opensearch/products-index.json},
 * Synonyme aus {@code opensearch/synonyms_de.txt} (zur Laufzeit in den Filter {@code de_synonyms} eingetragen).
 *
 * <p>Die Synonyme werden wie Suchtext normalisiert (kleingeschrieben, Umlaute und ß aufgeloest), weil der
 * Synonym-Filter nach {@code german_normalization} laeuft und seine Regeln nicht selbst analysiert.
 */
public final class ProductIndexDefinition {

    static final String INDEX_RESOURCE = "/opensearch/products-index.json";
    static final String SYNONYMS_RESOURCE = "/opensearch/synonyms_de.txt";
    static final String SYNONYM_FILTER = "de_synonyms";

    private static final ObjectMapper JSON = new ObjectMapper();

    private ProductIndexDefinition() {
    }

    /** Vollstaendiges Index-JSON (settings + mappings) mit eingetragenen Synonymen. */
    public static String json() {
        try {
            return injectSynonyms(readResource(INDEX_RESOURCE), parseSynonyms(readResource(SYNONYMS_RESOURCE)));
        } catch (IOException e) {
            throw new IllegalStateException("Produktindex-Definition konnte nicht geladen werden", e);
        }
    }

    /**
     * Typisierte Create-Index-Anfrage fuer den Indexnamen. Das JSON wird mit dem Mapper des opensearch-java
     * Clients gelesen; ein Schema-Fehler zeigt sich damit schon ohne laufenden OpenSearch.
     */
    public static CreateIndexRequest createIndexRequest(String indexName) throws IOException {
        JsonNode root = JSON.readTree(json());
        JsonpMapper mapper = new JacksonJsonpMapper();
        // settings und mappings einzeln typisieren: CreateIndexRequest selbst verlangt den Indexnamen als Feld
        // und laesst sich aus dem Body (ohne Pfad) nicht vollstaendig lesen.
        IndexSettings settings = parse(mapper, root.path("settings"), IndexSettings.class);
        TypeMapping mappings = parse(mapper, root.path("mappings"), TypeMapping.class);
        return CreateIndexRequest.of(b -> b
                .index(indexName)
                .settings(settings)
                .mappings(mappings));
    }

    private static <T> T parse(JsonpMapper mapper, JsonNode node, Class<T> type) throws IOException {
        try (JsonParser parser = mapper.jsonProvider().createParser(new StringReader(JSON.writeValueAsString(node)))) {
            return mapper.deserialize(parser, type);
        }
    }

    /**
     * Parst die Synonymdatei: eine Regel pro Zeile, Leerzeilen und Zeilen mit {@code #} werden ignoriert.
     * Begriffe werden normalisiert.
     */
    public static List<String> parseSynonyms(String text) {
        List<String> rules = new ArrayList<>();
        int lineNumber = 0;
        for (String rawLine : text.split("\\R")) {
            lineNumber++;
            String line = rawLine.strip();
            if (line.isEmpty() || line.startsWith("#")) {
                continue;
            }
            if (line.indexOf(',') < 0) {
                throw new IllegalStateException("synonyms_de.txt Zeile " + lineNumber
                        + " ist keine Synonymregel (erwartet: \"a, b\"): " + line);
            }
            rules.add(normalizeRule(line));
        }
        return rules;
    }

    /** Traegt die Regeln in {@code settings.analysis.filter.de_synonyms.synonyms} ein und liefert das JSON. */
    static String injectSynonyms(String indexJson, List<String> rules) {
        try {
            ObjectNode root = (ObjectNode) JSON.readTree(indexJson);
            JsonNode filter = root.path("settings").path("analysis").path("filter").path(SYNONYM_FILTER);
            if (!filter.isObject()) {
                throw new IllegalStateException("Filter " + SYNONYM_FILTER + " fehlt in products-index.json");
            }
            ArrayNode synonyms = ((ObjectNode) filter).putArray("synonyms");
            rules.forEach(synonyms::add);
            return JSON.writeValueAsString(root);
        } catch (IOException e) {
            throw new IllegalStateException("products-index.json ist kein gueltiges JSON", e);
        }
    }

    /**
     * Normalisierung passend zur Kette {@code lowercase, german_normalization}: ä/ae→a, ö/oe→o, ü/ue→u, ß→ss.
     * Die Annahme ist, dass Lucene dieselben Ersetzungen beim Analysieren von Text macht.
     */
    static String normalizeRule(String rule) {
        return rule.toLowerCase(Locale.GERMAN)
                .replace("ß", "ss")
                .replace("ä", "a")
                .replace("ö", "o")
                .replace("ü", "u")
                .replace("ae", "a")
                .replace("oe", "o")
                .replace("ue", "u");
    }

    private static String readResource(String resource) throws IOException {
        try (InputStream in = ProductIndexDefinition.class.getResourceAsStream(resource)) {
            if (in == null) {
                throw new IOException("Ressource fehlt: " + resource);
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
