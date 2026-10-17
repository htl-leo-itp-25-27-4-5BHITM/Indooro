package at.htl.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.opensearch.client.opensearch.indices.CreateIndexRequest;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProductIndexDefinitionTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    /** Eingebaute Filter/Tokenizer, die ohne eigene Definition in Analyzern verwendet werden. */
    private static final Set<String> BUILTIN_FILTERS = Set.of("lowercase", "german_normalization");

    @Test
    void indexJsonIsValidAndHasSettingsAndMappings() throws IOException {
        JsonNode root = JSON.readTree(ProductIndexDefinition.json());

        assertTrue(root.path("settings").isObject());
        assertTrue(root.path("mappings").path("properties").isObject());
        assertEquals(1, root.path("settings").path("number_of_shards").asInt());
        assertEquals(0, root.path("settings").path("number_of_replicas").asInt());
    }

    @Test
    void allGermanAnalyzersExist() throws IOException {
        JsonNode analyzers = analysis().path("analyzer");

        for (String name : List.of("de_name", "de_name_search", "de_prefix_index", "de_prefix_search",
                "de_parts_index", "de_parts_search")) {
            assertTrue(analyzers.has(name), "Analyzer fehlt: " + name);
            assertEquals("custom", analyzers.path(name).path("type").asText(), name);
        }
    }

    @Test
    void allCustomFilterTypesAreDefinedAndReferencedFiltersResolve() throws IOException {
        JsonNode filters = analysis().path("filter");

        assertEquals("word_delimiter_graph", filters.path("de_wdg").path("type").asText());
        assertEquals("asciifolding", filters.path("de_fold").path("type").asText());
        assertEquals("synonym_graph", filters.path("de_synonyms").path("type").asText());
        assertEquals("stemmer", filters.path("de_stem").path("type").asText());
        assertEquals("light_german", filters.path("de_stem").path("language").asText());
        assertEquals("edge_ngram", filters.path("de_edge").path("type").asText());
        assertEquals("ngram", filters.path("de_ngram").path("type").asText());

        for (JsonNode analyzer : analysis().path("analyzer")) {
            for (JsonNode filter : analyzer.path("filter")) {
                String name = filter.asText();
                assertTrue(filters.has(name) || BUILTIN_FILTERS.contains(name),
                        "Filter nicht definiert: " + name);
            }
        }
    }

    @Test
    void wordDelimiterSplitsAndCatenatesWithoutPreservingOriginal() throws IOException {
        JsonNode wdg = analysis().path("filter").path("de_wdg");

        assertEquals("word_delimiter_graph", wdg.path("type").asText());
        assertTrue(wdg.path("generate_word_parts").asBoolean());
        assertTrue(wdg.path("generate_number_parts").asBoolean());
        assertFalse(wdg.path("split_on_case_change").asBoolean());
        assertFalse(wdg.path("split_on_numerics").asBoolean());
        assertFalse(wdg.path("preserve_original").asBoolean());
        assertTrue(wdg.path("catenate_words").asBoolean());
        assertFalse(analysis().path("filter").has("de_wdg_search"), "de_wdg_search existiert nicht mehr");
    }

    @Test
    void indexAnalyzersUseWhitespaceTokenizerAndSearchAnalyzersUseStandard() throws IOException {
        JsonNode analyzers = analysis().path("analyzer");

        for (String name : List.of("de_name", "de_prefix_index", "de_parts_index")) {
            assertEquals("whitespace", analyzers.path(name).path("tokenizer").asText(), name);
            assertTrue(filterNames(analyzers.path(name)).contains("de_wdg"), name + " braucht de_wdg");
        }
        for (String name : List.of("de_name_search", "de_prefix_search", "de_parts_search")) {
            assertEquals("standard", analyzers.path(name).path("tokenizer").asText(), name);
            assertFalse(filterNames(analyzers.path(name)).contains("de_wdg"),
                    name + " darf kein de_wdg enthalten");
        }
    }

    @Test
    void analyzerFilterChainsAreInDocumentedOrder() throws IOException {
        JsonNode analyzers = analysis().path("analyzer");

        assertEquals(List.of("lowercase", "de_wdg", "german_normalization", "de_fold", "de_stem"),
                filterNames(analyzers.path("de_name")));
        assertEquals(List.of("lowercase", "german_normalization", "de_synonyms", "de_fold", "de_stem"),
                filterNames(analyzers.path("de_name_search")));
        assertEquals(List.of("lowercase", "de_wdg", "german_normalization", "de_fold", "de_edge"),
                filterNames(analyzers.path("de_prefix_index")));
        assertEquals(List.of("lowercase", "german_normalization", "de_fold"),
                filterNames(analyzers.path("de_prefix_search")));
        assertEquals(List.of("lowercase", "de_wdg", "german_normalization", "de_fold", "de_ngram"),
                filterNames(analyzers.path("de_parts_index")));
        assertEquals(List.of("lowercase", "german_normalization", "de_fold"),
                filterNames(analyzers.path("de_parts_search")));
    }

    @Test
    void synonymFilterRunsAfterNormalizationAndTokenizesWithStandard() throws IOException {
        JsonNode analysis = analysis();

        assertEquals("standard", analysis.path("filter").path("de_synonyms").path("tokenizer").asText());
        int normalization = filterNames(analysis.path("analyzer").path("de_name_search"))
                .indexOf("german_normalization");
        int synonyms = filterNames(analysis.path("analyzer").path("de_name_search")).indexOf("de_synonyms");
        assertEquals(normalization + 1, synonyms, "de_synonyms direkt nach german_normalization");
    }

    @Test
    void ngramFilterSizesAreFixed() throws IOException {
        JsonNode filters = analysis().path("filter");

        assertEquals(3, filters.path("de_ngram").path("min_gram").asInt());
        assertEquals(12, filters.path("de_ngram").path("max_gram").asInt());
        assertEquals(2, filters.path("de_edge").path("min_gram").asInt());
        assertEquals(15, filters.path("de_edge").path("max_gram").asInt());
    }

    private static List<String> filterNames(JsonNode analyzer) {
        List<String> names = new ArrayList<>();
        analyzer.path("filter").forEach(filter -> names.add(filter.asText()));
        return names;
    }

    @Test
    void nameMappingUsesGermanAnalyzersAndSubfields() throws IOException {
        JsonNode name = JSON.readTree(ProductIndexDefinition.json()).path("mappings").path("properties").path("name");

        assertEquals("text", name.path("type").asText());
        assertEquals("de_name", name.path("analyzer").asText());
        assertEquals("de_name_search", name.path("search_analyzer").asText());
        assertEquals("keyword", name.path("fields").path("keyword").path("type").asText());
        assertEquals(256, name.path("fields").path("keyword").path("ignore_above").asInt());
        assertEquals("de_prefix_index", name.path("fields").path("prefix").path("analyzer").asText());
        assertEquals("de_prefix_search", name.path("fields").path("prefix").path("search_analyzer").asText());
        assertEquals("de_parts_index", name.path("fields").path("parts").path("analyzer").asText());
        assertEquals("de_parts_search", name.path("fields").path("parts").path("search_analyzer").asText());
    }

    @Test
    void storeAndLayoutFieldsStayKeywordAndIdentifiersKeepTypes() throws IOException {
        JsonNode properties = JSON.readTree(ProductIndexDefinition.json()).path("mappings").path("properties");

        assertEquals("integer", properties.path("id").path("type").asText());
        assertEquals("double", properties.path("price").path("type").asText());
        assertEquals("keyword", properties.path("layoutCode").path("type").asText());
        assertEquals("keyword", properties.path("storeId").path("type").asText());
        assertEquals("keyword", properties.path("storeCode").path("type").asText());
    }

    @Test
    void maxNgramDiffCoversEveryNgramFilterRange() throws IOException {
        JsonNode root = JSON.readTree(ProductIndexDefinition.json());
        int maxDiff = root.path("settings").path("max_ngram_diff").asInt();
        JsonNode filters = analysis().path("filter");

        for (String name : List.of("de_edge", "de_ngram")) {
            int diff = filters.path(name).path("max_gram").asInt() - filters.path(name).path("min_gram").asInt();
            assertTrue(diff <= maxDiff, name + " Spanne " + diff + " > max_ngram_diff " + maxDiff);
        }
    }

    @Test
    void synonymFileParsesToRulesWithoutCommentsOrBlankLines() throws IOException {
        List<String> rules = ProductIndexDefinition.parseSynonyms(readSynonymFile());

        long expected = readSynonymFileLines().stream()
                .map(String::strip)
                .filter(line -> !line.isEmpty() && !line.startsWith("#"))
                .count();
        assertEquals(expected, rules.size());
        assertTrue(rules.size() >= 40, "mindestens 40 Synonymregeln erwartet, gefunden " + rules.size());
        assertTrue(rules.stream().noneMatch(rule -> rule.contains("#")));
        assertTrue(rules.stream().noneMatch(String::isBlank));
        assertTrue(rules.stream().allMatch(rule -> rule.contains(",")), "jede Zeile ist eine Regel mit Komma");
    }

    @Test
    void mandatorySynonymGroupsArePresentInNormalizedForm() {
        List<String> rules = ProductIndexDefinition.parseSynonyms(readSynonymFile());

        assertTrue(rules.contains("paradeiser, tomaten, tomate"));
        assertTrue(rules.contains("topfen, quark"));
        assertTrue(rules.contains("kase, kase"));
        assertTrue(rules.contains("erdapfel, erdapfel, kartoffel, kartoffeln"));
        assertTrue(rules.contains("obers, sahne, rahm"));
        assertTrue(rules.contains("schlagobers, schlagsahne"));
        assertTrue(rules.contains("klopapier, toilettenpapier, wc-papier"));
        assertTrue(rules.contains("zahncreme, zahnpasta"));
        assertTrue(rules.contains("nudeln, pasta, spaghetti, penne, fusilli, tagliatelle"));
        assertTrue(rules.contains("jogurt, joghurt, yoghurt"));
        assertTrue(rules.contains("ketschup, ketchup"));
        assertTrue(rules.contains("marillen, aprikosen"));
        assertTrue(rules.contains("karfiol, blumenkohl"));
        assertTrue(rules.contains("melanzani, aubergine"));
        assertTrue(rules.contains("faschiertes, hackfleisch"));
        assertTrue(rules.contains("semmel, brotchen, weckerl"));
        assertTrue(rules.contains("sackerl, tute"));
        assertTrue(rules.contains("kren, meerrettich"));
        assertTrue(rules.contains("palatschinken, pfannkuchen"));
        assertTrue(rules.contains("powidl, pflaumenmus"));
        assertTrue(rules.contains("fisolen, grune bohnen"));
        assertTrue(rules.contains("kuchenrolle, kuchenpapier, haushaltspapier"));
        assertTrue(rules.contains("taschentucher, papiertaschentucher"));
        assertTrue(rules.contains("mullbeutel, mullsack, mistsackerl"));
        assertTrue(rules.contains("wurstel, wurstchen, wiener"));
        assertTrue(rules.contains("cola, coca-cola"));
        assertTrue(rules.contains("h-milch, haltbare milch, haltbarmilch"));
        assertTrue(rules.contains("mineralwasser, sprudel"));
        assertTrue(rules.contains("spulmittel, geschirrspulmittel"));
        assertTrue(rules.contains("hendl, huhn, hahnchen"));
        assertTrue(rules.contains("schlogel, schlegel, keule"));
    }

    @Test
    void synonymFileIsUtf8WithUmlauts() throws IOException {
        String text = readSynonymFile();

        assertTrue(text.contains("käse"), "Käse muss als UTF-8 gelesen werden");
        assertTrue(text.contains("brötchen"));
        assertTrue(text.contains("würstel"));
        assertFalse(text.contains("Ã"), "keine Mojibake-Zeichen");
    }

    @Test
    void normalizationMatchesGermanSearchChain() {
        assertEquals("kase", ProductIndexDefinition.normalizeRule("Käse"));
        assertEquals("brotchen", ProductIndexDefinition.normalizeRule("Brötchen"));
        assertEquals("strasse", ProductIndexDefinition.normalizeRule("Straße"));
        assertEquals("grune bohnen", ProductIndexDefinition.normalizeRule("Grüne Bohnen"));
        assertEquals("erdapfel", ProductIndexDefinition.normalizeRule("Erdäpfel"));
        assertEquals("kase", ProductIndexDefinition.normalizeRule("kaese"));
    }

    @Test
    void injectedSynonymsReplaceEmptyArrayInDeSynonymsFilter() throws IOException {
        List<String> rules = List.of("a, b", "c, d");

        String json = ProductIndexDefinition.injectSynonyms(readIndexResource(), rules);

        JsonNode synonyms = JSON.readTree(json).path("settings").path("analysis").path("filter")
                .path("de_synonyms").path("synonyms");
        assertEquals(2, synonyms.size());
        assertEquals("a, b", synonyms.get(0).asText());
        assertEquals("c, d", synonyms.get(1).asText());
        assertEquals("synonym_graph", JSON.readTree(json).path("settings").path("analysis").path("filter")
                .path("de_synonyms").path("type").asText());
    }

    @Test
    void definitionContainsAllSynonymsAndIsAcceptedByClientModel() throws IOException {
        CreateIndexRequest request = ProductIndexDefinition.createIndexRequest("products");

        List<String> synonyms = request.settings().analysis().filter().get("de_synonyms")
                .definition().synonymGraph().synonyms();
        assertTrue(synonyms.size() >= 40, "alle Synonyme eingetragen, gefunden " + synonyms.size());
        assertTrue(synonyms.contains("kase, kase"));
        assertEquals("products", request.index());
        assertEquals(Integer.valueOf(13), request.settings().maxNgramDiff());
        assertTrue(request.mappings().properties().get("name").isText());
    }

    @Test
    void invalidSynonymLineFailsFast() {
        IllegalStateException error = assertThrows(IllegalStateException.class,
                () -> ProductIndexDefinition.parseSynonyms("paradeiser, tomaten\nkeinkomma\n"));
        assertTrue(error.getMessage().contains("Zeile 2"));
    }

    private static JsonNode analysis() throws IOException {
        return JSON.readTree(ProductIndexDefinition.json()).path("settings").path("analysis");
    }

    private static String readIndexResource() throws IOException {
        return readResource("/opensearch/products-index.json");
    }

    private static String readSynonymFile() {
        try {
            return readResource("/opensearch/synonyms_de.txt");
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static List<String> readSynonymFileLines() {
        return readSynonymFile().lines().toList();
    }

    private static String readResource(String resource) throws IOException {
        try (InputStream in = ProductIndexDefinitionTest.class.getResourceAsStream(resource)) {
            if (in == null) throw new IOException("fehlt: " + resource);
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
