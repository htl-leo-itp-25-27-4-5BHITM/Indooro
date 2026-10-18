package at.htl.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;

import java.io.IOException;

/**
 * Sperrt store-scoped Schreibzugriffe, solange Altdokumente ohne storeCode im Produktindex liegen.
 * Store-scoped Doc-IDs (`<storeCode>:<id>`) neben Altdokumenten (`<id>`) wuerden Produkte doppelt fuehren.
 * Erst nach Migration und Loeschen der Altdokumente ist wieder frei (docs/pilot-readiness/operations/CATALOG_MIGRATION.md).
 */
@ApplicationScoped
public class LegacyDocumentGuard {

    private static final Logger LOG = Logger.getLogger(LegacyDocumentGuard.class);

    @Inject
    OpenSearchService openSearchService;

    /**
     * Ohne storeCode (Altbestand-Schreibzugriff) passiert nichts und es wird nicht gezaehlt.
     * Mit storeCode: 409, solange Altdokumente existieren. Kann nicht gezaehlt werden, wird fail-closed abgelehnt.
     */
    public void requireNoLegacyDocuments(String storeCode) {
        if (storeCode == null || storeCode.isBlank()) {
            return;
        }
        long legacy;
        try {
            legacy = openSearchService.countLegacyProducts();
        } catch (IOException exception) {
            LOG.error("Could not count legacy products before store-scoped write", exception);
            throw new WebApplicationException(
                    "Altbestand konnte nicht geprüft werden. Schreibzugriff abgelehnt.",
                    Response.Status.INTERNAL_SERVER_ERROR);
        }
        if (legacy > 0) {
            throw new WebApplicationException(
                    "Legacy products without storeCode still exist (" + legacy + "). "
                            + "Run the catalog migration (docs/pilot-readiness/operations/CATALOG_MIGRATION.md) "
                            + "before writing store-scoped products.",
                    Response.Status.CONFLICT);
        }
    }
}
