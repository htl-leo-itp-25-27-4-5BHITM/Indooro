package at.htl.service;

import jakarta.ws.rs.WebApplicationException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class LegacyDocumentGuardTest {

    private static final String PILOT_CODE = "SPAR-Leonding-001";

    private OpenSearchService openSearch;
    private LegacyDocumentGuard guard;

    @BeforeEach
    void setUp() {
        openSearch = mock(OpenSearchService.class);
        guard = new LegacyDocumentGuard();
        guard.openSearchService = openSearch;
    }

    @Test
    void refusesStoreScopedWriteWith409WhileLegacyDocumentsExist() throws IOException {
        when(openSearch.countLegacyProducts()).thenReturn(153L);

        WebApplicationException exception = assertThrows(WebApplicationException.class,
                () -> guard.requireNoLegacyDocuments(PILOT_CODE));

        assertEquals(409, exception.getResponse().getStatus());
        assertTrue(exception.getMessage().contains("Legacy products without storeCode still exist (153)"));
        assertTrue(exception.getMessage().contains("CATALOG_MIGRATION.md"));
    }

    @Test
    void allowsStoreScopedWriteWhenNoLegacyDocumentsExist() throws IOException {
        when(openSearch.countLegacyProducts()).thenReturn(0L);

        assertDoesNotThrow(() -> guard.requireNoLegacyDocuments(PILOT_CODE));
    }

    @Test
    void blankStoreCodeIsLegacyStyleWriteWithoutCounting() throws IOException {
        assertDoesNotThrow(() -> guard.requireNoLegacyDocuments(null));
        assertDoesNotThrow(() -> guard.requireNoLegacyDocuments("   "));

        verify(openSearch, never()).countLegacyProducts();
    }

    @Test
    void failsClosedWhenLegacyCountCannotBeRead() throws IOException {
        when(openSearch.countLegacyProducts()).thenThrow(new IOException("opensearch down"));

        WebApplicationException exception = assertThrows(WebApplicationException.class,
                () -> guard.requireNoLegacyDocuments(PILOT_CODE));

        assertEquals(500, exception.getResponse().getStatus());
    }
}
