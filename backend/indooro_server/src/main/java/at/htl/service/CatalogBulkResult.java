package at.htl.service;

import org.opensearch.client.opensearch.core.BulkResponse;
import org.opensearch.client.opensearch.core.bulk.BulkResponseItem;

import java.util.ArrayList;
import java.util.List;

/** One result per submitted operation, in request order. OpenSearch bulk writes are not atomic. */
public record CatalogBulkResult(String message, int count, int saved, int failed, int unknown, List<Row> rows) {
    public record Row(int row, String id, String status, String reason) {}

    public static CatalogBulkResult fromResponse(List<String> ids, BulkResponse response) {
        return fromResponse(ids, ids, response);
    }

    /** ids are the product ids reported to the client; docIds are the OpenSearch document ids matched against the response. */
    public static CatalogBulkResult fromResponse(List<String> ids, List<String> docIds, BulkResponse response) {
        List<Row> rows = new ArrayList<>(ids.size());
        List<BulkResponseItem> items = response.items();
        for (int i = 0; i < ids.size(); i++) {
            BulkResponseItem item = i < items.size() ? items.get(i) : null;
            if (item == null || !docIds.get(i).equals(item.id())) {
                rows.add(new Row(i + 1, ids.get(i), "unknown", "OpenSearch returned no matching row result."));
            } else if (item.error() != null || item.status() < 200 || item.status() >= 300) {
                String reason = item.error() == null ? "OpenSearch status " + item.status() : item.error().reason();
                rows.add(new Row(i + 1, ids.get(i), "failed", reason));
            } else {
                rows.add(new Row(i + 1, ids.get(i), "saved", null));
            }
        }
        return summarize(rows);
    }

    /** Builds the summary from rows that were assembled by the caller (pre-validated rows plus written rows). */
    public static CatalogBulkResult fromRows(List<Row> rows) {
        return summarize(rows);
    }

    public static CatalogBulkResult unknown(List<String> ids, String reason) {
        List<Row> rows = new ArrayList<>(ids.size());
        for (int i = 0; i < ids.size(); i++) {
            rows.add(new Row(i + 1, ids.get(i), "unknown", reason));
        }
        return summarize(rows);
    }

    private static CatalogBulkResult summarize(List<Row> rows) {
        int saved = (int) rows.stream().filter(row -> "saved".equals(row.status())).count();
        int failed = (int) rows.stream().filter(row -> "failed".equals(row.status())).count();
        int unknown = rows.size() - saved - failed;
        String message = failed == 0 && unknown == 0 ? "All rows indexed" : "Import requires review";
        return new CatalogBulkResult(message, rows.size(), saved, failed, unknown, List.copyOf(rows));
    }
}
