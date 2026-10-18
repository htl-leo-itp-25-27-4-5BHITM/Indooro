package at.htl.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import at.htl.admin.service.AdminAccessService;
import at.htl.admin.service.AuditLogService;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.Refresh;
import org.opensearch.client.opensearch._types.mapping.FieldType;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch.core.BulkRequest;
import org.opensearch.client.opensearch.core.BulkResponse;
import org.opensearch.client.opensearch.core.GetResponse;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.bulk.BulkOperation;
import org.opensearch.client.opensearch.core.search.Hit;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class LayoutService {

    private static final Logger LOG = Logger.getLogger(LayoutService.class);
    private static final String CURRENT_LAYOUT_ID = "current";
    private static final int DEFAULT_HISTORY_LIMIT = 10;
    static final int MIN_HISTORY_LIMIT = 1;
    static final int MAX_HISTORY_LIMIT = 50;
    static final int LEGACY_PRUNE_PAGE_SIZE = 200;
    static final int LEGACY_PRUNE_MAX_PAGES = 50;

    @Inject
    OpenSearchClient client;

    @Inject
    ObjectMapper objectMapper;

    @Inject
    LayoutDocumentValidator layoutDocumentValidator;

    @Inject
    DefaultLayoutProvider defaultLayoutProvider;

    @Inject
    AdminAccessService adminAccessService;

    @Inject
    AuditLogService auditLogService;

    @ConfigProperty(name = "opensearch.layout-index")
    String layoutIndexName;

    public JsonNode getCurrentLayout() throws IOException {
        GetResponse<JsonNode> response = client.get(
                g -> g.index(layoutIndexName).id(CURRENT_LAYOUT_ID),
                JsonNode.class
        );

        if (response.found() && response.source() != null) {
            return response.source();
        }

        LOG.info("No saved layout found in OpenSearch, falling back to bundled default layout");
        return defaultLayoutProvider.bundled();
    }

    public JsonNode getLayoutVersion(String layoutId) throws IOException {
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
        int finalLimit = historyLimit(limit);

        // Legacy versions only (recordType = version), newest first. unmappedType keeps the sort from failing
        // on an index where savedAt has no date mapping yet.
        SearchRequest request = SearchRequest.of(s -> s
                .index(layoutIndexName)
                .size(finalLimit)
                .query(q -> q.term(t -> t.field("recordType.keyword").value(v -> v.stringValue("version"))))
                .sort(sort -> sort.field(field -> field.field("savedAt")
                        .order(SortOrder.Desc)
                        .unmappedType(FieldType.Date))));
        SearchResponse<JsonNode> response = client.search(request, JsonNode.class);

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

    /**
     * Loescht Legacy-Versionen (recordType = version) jenseits der {@code keep} neuesten nach savedAt. Seitenweise:
     * jede Runde liest ab Position {@code keep}, loescht die Treffer per Bulk-Request und wiederholt, bis nichts mehr
     * uebrig ist (begrenzt auf {@link #LEGACY_PRUNE_MAX_PAGES} Runden). Das Dokument {@code current} wird nie
     * geloescht. Fehler (fehlender Index, IOException) werden geloggt und ergeben 0, damit der Job nicht abbricht.
     *
     * @return Anzahl erfolgreich geloeschter Versionen
     */
    public long pruneLegacyVersions(int keep) {
        if (keep < 1) {
            LOG.warnf("Legacy layout retention skipped: keep=%d must be at least 1", keep);
            return 0;
        }

        long deleted = 0;
        try {
            for (int page = 0; page < LEGACY_PRUNE_MAX_PAGES; page++) {
                List<String> staleIds = listLegacyVersionIdsBeyond(keep);
                if (staleIds.isEmpty()) {
                    break;
                }
                int failed = deleteLegacyVersions(staleIds);
                deleted += staleIds.size() - failed;
                if (failed > 0) {
                    LOG.warnf("Legacy layout retention: %d of %d deletes failed; stopping this run", failed, staleIds.size());
                    break;
                }
            }
        } catch (IOException | RuntimeException failure) {
            LOG.warnf(failure, "Legacy layout retention failed for index %s", layoutIndexName);
        }
        if (deleted > 0) {
            LOG.infof("Legacy layout retention removed %d versions, keeping the newest %d", deleted, keep);
        }
        return deleted;
    }

    private List<String> listLegacyVersionIdsBeyond(int keep) throws IOException {
        SearchRequest request = SearchRequest.of(s -> s
                .index(layoutIndexName)
                .from(keep)
                .size(LEGACY_PRUNE_PAGE_SIZE)
                .query(q -> q.term(t -> t.field("recordType.keyword").value(v -> v.stringValue("version"))))
                .sort(sort -> sort.field(field -> field.field("savedAt")
                        .order(SortOrder.Desc)
                        .unmappedType(FieldType.Date))));
        SearchResponse<JsonNode> response = client.search(request, JsonNode.class);

        List<String> ids = new ArrayList<>();
        for (Hit<JsonNode> hit : response.hits().hits()) {
            String id = hit.id();
            JsonNode source = hit.source();
            // Defensive: only legacy version documents may be removed, never the current pointer.
            if (id == null || CURRENT_LAYOUT_ID.equals(id)) {
                continue;
            }
            if (source != null && !"version".equals(source.path("recordType").asText())) {
                continue;
            }
            ids.add(id);
        }
        return ids;
    }

    /** Loescht die Ids in einem Bulk-Request und liefert die Anzahl fehlgeschlagener Eintraege. */
    private int deleteLegacyVersions(List<String> ids) throws IOException {
        List<BulkOperation> operations = ids.stream()
                .map(id -> BulkOperation.of(op -> op.delete(d -> d.index(layoutIndexName).id(id))))
                .toList();
        BulkRequest request = BulkRequest.of(b -> b
                .index(layoutIndexName)
                .operations(operations)
                .refresh(Refresh.True));
        BulkResponse response = client.bulk(request);
        return (int) response.items().stream().filter(item -> item.error() != null).count();
    }

    /** Missing limit gives the default; any other value is clamped to 1..50 instead of rejected. */
    static int historyLimit(Integer limit) {
        if (limit == null) {
            return DEFAULT_HISTORY_LIMIT;
        }
        return Math.min(Math.max(limit, MIN_HISTORY_LIMIT), MAX_HISTORY_LIMIT);
    }

    public LayoutHistoryEntry saveCurrentLayout(JsonNode layout) throws IOException {
        layoutDocumentValidator.validate(layout);
        layoutDocumentValidator.validateMobileElementIds(layout);
        layoutDocumentValidator.validatePublishedShelfRouting(layout);
        layoutDocumentValidator.validateAnchors(layout);

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
        LayoutHistoryEntry savedEntry = toHistoryEntry(versionDocument);
        try {
            auditLogService.logByAdmin(adminAccessService.currentUser(), "LEGACY_LAYOUT", UUID.fromString(layoutId),
                    "SAVE", "Legacy-Layout gespeichert", null, savedEntry);
        } catch (RuntimeException e) {
            // Das Layout ist bereits gespeichert; ein fehlgeschlagener Audit-Eintrag darf das nicht verdecken.
            LOG.warn("Audit entry for legacy layout save failed", e);
        }
        return savedEntry;
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
