package at.htl.service;

import org.junit.jupiter.api.Test;
import org.opensearch.client.opensearch._types.ErrorCause;
import org.opensearch.client.opensearch.core.BulkResponse;
import org.opensearch.client.opensearch.core.bulk.BulkResponseItem;
import org.opensearch.client.opensearch.core.bulk.OperationType;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class CatalogBulkResultTest {
    @Test
    void partialBulkResponseKeepsRequestOrderAndDoesNotClaimWholeImportSucceeded() {
        BulkResponse response = BulkResponse.of(builder -> builder.errors(true).took(1)
                .items(item("101", 201, null), item("102", 400,
                        ErrorCause.of(error -> error.type("mapper_parsing_exception").reason("bad price")))));

        CatalogBulkResult result = CatalogBulkResult.fromResponse(List.of("101", "102"), response);

        assertEquals(2, result.count());
        assertEquals(1, result.saved());
        assertEquals(1, result.failed());
        assertEquals(0, result.unknown());
        assertEquals("saved", result.rows().get(0).status());
        assertEquals("102", result.rows().get(1).id());
        assertEquals("bad price", result.rows().get(1).reason());
        assertEquals("Import requires review", result.message());
    }

    @Test
    void missingOrMismatchedItemsRemainUnknown() {
        BulkResponse response = BulkResponse.of(builder -> builder.errors(false).took(1)
                .items(item("wrong", 201, null)));
        CatalogBulkResult result = CatalogBulkResult.fromResponse(List.of("101", "102"), response);
        assertEquals(0, result.saved());
        assertEquals(2, result.unknown());
        assertEquals(List.of("unknown", "unknown"), result.rows().stream().map(CatalogBulkResult.Row::status).toList());
    }

    @Test
    void transportFailureNeverClaimsAnItemWasSavedOrFailed() {
        CatalogBulkResult result = CatalogBulkResult.unknown(List.of("101", "102"), "transport failed");
        assertEquals(0, result.saved());
        assertEquals(0, result.failed());
        assertEquals(2, result.unknown());
    }

    private BulkResponseItem item(String id, int status, ErrorCause error) {
        return BulkResponseItem.of(builder -> {
            builder.operationType(OperationType.Index).index("products").id(id).status(status);
            if (error != null) builder.error(error);
            return builder;
        });
    }
}
