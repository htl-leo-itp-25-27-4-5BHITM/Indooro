package at.htl.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.Refresh;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch.core.GetResponse;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;

import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class LayoutService {

    private static final Logger LOG = Logger.getLogger(LayoutService.class);
    private static final String CURRENT_LAYOUT_ID = "current";
    private static final int DEFAULT_HISTORY_LIMIT = 10;

    @Inject
    OpenSearchClient client;

    @Inject
    ObjectMapper objectMapper;

    @Inject
    LayoutDocumentValidator layoutDocumentValidator;

    @ConfigProperty(name = "opensearch.layout-index")
    String layoutIndexName;

    public JsonNode getCurrentLayout() throws IOException {
        ensureLayoutIndex();

        GetResponse<JsonNode> response = client.get(
                g -> g.index(layoutIndexName).id(CURRENT_LAYOUT_ID),
                JsonNode.class
        );

        if (response.found() && response.source() != null) {
            return response.source();
        }

        LOG.info("No saved layout found in OpenSearch, falling back to bundled default layout");
        return loadDefaultLayout();
    }

    public JsonNode getLayoutVersion(String layoutId) throws IOException {
        ensureLayoutIndex();

        GetResponse<JsonNode> response = client.get(
                g -> g.index(layoutIndexName).id(layoutId),
                JsonNode.class
        );

        if (response.found() && response.source() != null) {
            return response.source();
        }

        return null;
    }

    public List<LayoutHistoryEntry> getRecentLayouts(Integer limit) throws IOException {
        ensureLayoutIndex();

        int finalLimit = limit == null || limit <= 0 ? DEFAULT_HISTORY_LIMIT : limit;

        SearchResponse<JsonNode> response = client.search(s -> s
                .index(layoutIndexName)
                .size(finalLimit)
                .query(q -> q.term(t -> t.field("recordType.keyword").value(v -> v.stringValue("version"))))
                .sort(sort -> sort.field(field -> field.field("savedAt").order(SortOrder.Desc))),
                JsonNode.class
        );

        List<LayoutHistoryEntry> layouts = new ArrayList<>();
        for (Hit<JsonNode> hit : response.hits().hits()) {
            JsonNode source = hit.source();
            if (source == null || !"version".equals(source.path("recordType").asText())) {
                continue;
            }
            layouts.add(toHistoryEntry(source));
        }

        return layouts;
    }

    public LayoutHistoryEntry saveCurrentLayout(JsonNode layout) throws IOException {
        layoutDocumentValidator.validate(layout);
        layoutDocumentValidator.validateMobileElementIds(layout);
        layoutDocumentValidator.validatePublishedShelfRouting(layout);
        layoutDocumentValidator.validateAnchors(layout);
        ensureLayoutIndex();

        String layoutId = UUID.randomUUID().toString();
        String savedAt = Instant.now().toString();

        ObjectNode versionDocument = enrichLayout(layout, layoutId, savedAt, "version");
        ObjectNode currentDocument = versionDocument.deepCopy();
        currentDocument.put("recordType", "current");

        client.index(i -> i
                .index(layoutIndexName)
                .id(layoutId)
                .document(versionDocument)
                .refresh(Refresh.True));

        client.index(i -> i
                .index(layoutIndexName)
                .id(CURRENT_LAYOUT_ID)
                .document(currentDocument)
                .refresh(Refresh.True));

        LOG.info("Saved current layout to OpenSearch index " + layoutIndexName);
        return toHistoryEntry(versionDocument);
    }

    private void ensureLayoutIndex() throws IOException {
        try {
            client.indices().create(c -> c.index(layoutIndexName));
            LOG.info("Created layout index " + layoutIndexName);
        } catch (Exception e) {
            LOG.debug("Layout index already exists or could not be created again: " + e.getMessage());
        }
    }

    private JsonNode loadDefaultLayout() throws IOException {
        try (InputStream input = Thread.currentThread()
                .getContextClassLoader()
                .getResourceAsStream("default-layout.json")) {
            if (input == null) {
                return objectMapper.createObjectNode();
            }
            ObjectNode layout = (ObjectNode) objectMapper.readTree(input);
            layout.put("layoutId", "bundled-default");
            layout.put("recordType", "bundled");
            return layout;
        }
    }

    private ObjectNode enrichLayout(JsonNode layout, String layoutId, String savedAt, String recordType) {
        ObjectNode document = layout != null && layout.isObject()
                ? ((ObjectNode) layout).deepCopy()
                : objectMapper.createObjectNode();

        document.put("layoutId", layoutId);
        document.put("savedAt", savedAt);
        document.put("recordType", recordType);

        if (!document.hasNonNull("shopName")) {
            document.put("shopName", "Indooro");
        }

        if (!document.hasNonNull("exportDate")) {
            document.put("exportDate", savedAt);
        }

        return document;
    }

    private LayoutHistoryEntry toHistoryEntry(JsonNode source) {
        JsonNode elementsNode = source.path("elements");
        int elementCount = elementsNode.isArray() ? ((ArrayNode) elementsNode).size() : 0;

        return new LayoutHistoryEntry(
                source.path("layoutId").asText(""),
                source.path("shopName").asText("Indooro"),
                source.path("savedAt").asText(""),
                source.path("exportDate").asText(""),
                elementCount
        );
    }

    public record LayoutHistoryEntry(
            String layoutId,
            String shopName,
            String savedAt,
            String exportDate,
            int elementCount
    ) {}
}
