package at.htl.service;

import at.htl.model.Product;
import at.htl.service.CatalogStoreResolver.CatalogStoreException;
import at.htl.service.CatalogStoreResolver.ResolvedStore;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Bulk write of products, shared by the legacy {@code POST /api/products/bulk} and the store-scoped
 * {@code POST /api/admin/products/bulk}. OpenSearch bulk writes are not atomic: items that conflict with the
 * target store are reported as {@code failed} rows, a transport failure marks the written rows as {@code unknown}.
 */
@ApplicationScoped
public class ProductBulkService {

    private static final Logger LOG = Logger.getLogger(ProductBulkService.class);

    public static final int MAX_PRODUCTS_PER_REQUEST = 500;
    public static final String TOO_MANY_PRODUCTS = "Maximal 500 Produkte pro Anfrage.";
    static final String TRANSPORT_FAILURE = "Transport failed; some writes may have persisted. Verify before retrying.";

    /** Request-level problem with a German message for the client (answered as HTTP 400 JSON error). */
    public static class CatalogBulkRequestException extends RuntimeException {
        public CatalogBulkRequestException(String message) {
            super(message);
        }
    }

    /** transportFailed = true means the caller must answer 503; such a result must not be cached for replay. */
    public record Outcome(CatalogBulkResult result, boolean transportFailed) {
    }

    @Inject
    OpenSearchService openSearchService;

    @Inject
    CatalogStoreResolver storeResolver;

    /**
     * Request-level checks that run before any store lookup: presence, batch size, per-item validation and
     * positive ids. Throws WebApplicationException (400) or CatalogBulkRequestException (400).
     */
    public void validateRequest(List<Product> products) {
        if (products == null || products.isEmpty()) {
            throw new WebApplicationException("Produktliste ist erforderlich.", Response.Status.BAD_REQUEST);
        }
        if (products.size() > MAX_PRODUCTS_PER_REQUEST) {
            throw new CatalogBulkRequestException(TOO_MANY_PRODUCTS);
        }
        products.forEach(ProductBulkService::validateProduct);
        for (Product product : products) {
            if (product.getId() < 1) {
                throw new WebApplicationException("Produkt-IDs müssen positiv sein.", Response.Status.BAD_REQUEST);
            }
        }
    }

    /**
     * Writes the products that belong to the target store and reports one row per submitted product, in request order.
     * parameterStore is the store named by the request (null for the legacy endpoint without storeId/storeCode).
     * Expects the request to have passed {@link #validateRequest(List)}.
     */
    public Outcome write(List<Product> products, ResolvedStore parameterStore) {
        Map<Integer, String> rejectedRows = new HashMap<>();
        List<Product> writable = new ArrayList<>();
        for (int index = 0; index < products.size(); index++) {
            Product product = products.get(index);
            try {
                ResolvedStore itemStore = storeResolver.resolveOptional(product.getStoreId(), product.getStoreCode());
                if (itemStore != null && parameterStore != null && !itemStore.id().equals(parameterStore.id())) {
                    throw new CatalogStoreException("Markt des Produkts widerspricht dem Parameter storeId/storeCode.");
                }
                applyStore(product, itemStore != null ? itemStore : parameterStore);
                writable.add(product);
            } catch (CatalogStoreException exception) {
                rejectedRows.put(index, exception.getMessage());
            }
        }

        Set<String> documentIds = new HashSet<>();
        for (Product product : writable) {
            if (!documentIds.add(OpenSearchService.documentId(product))) {
                throw new WebApplicationException("Produkt-IDs müssen innerhalb eines Marktes eindeutig sein.",
                        Response.Status.BAD_REQUEST);
            }
        }

        CatalogBulkResult written = null;
        String transportFailure = null;
        if (!writable.isEmpty()) {
            try {
                written = openSearchService.indexProducts(writable);
            } catch (IOException e) {
                LOG.error("Error bulk indexing products", e);
                transportFailure = TRANSPORT_FAILURE;
            }
        }

        List<CatalogBulkResult.Row> rows = new ArrayList<>(products.size());
        int writtenPosition = 0;
        for (int index = 0; index < products.size(); index++) {
            String productId = String.valueOf(products.get(index).getId());
            if (rejectedRows.containsKey(index)) {
                rows.add(new CatalogBulkResult.Row(index + 1, productId, "failed", rejectedRows.get(index)));
                continue;
            }
            if (written != null) {
                CatalogBulkResult.Row source = written.rows().get(writtenPosition);
                rows.add(new CatalogBulkResult.Row(index + 1, productId, source.status(), source.reason()));
            } else {
                rows.add(new CatalogBulkResult.Row(index + 1, productId, "unknown", transportFailure));
            }
            writtenPosition++;
        }
        return new Outcome(CatalogBulkResult.fromRows(rows), transportFailure != null);
    }

    /** Store of a product that names no store itself (storeId and storeCode both blank). */
    public static boolean hasNoStore(Product product) {
        return isBlank(product.getStoreId()) && isBlank(product.getStoreCode());
    }

    public static void applyStore(Product product, ResolvedStore store) {
        product.setStoreId(store.id().toString());
        product.setStoreCode(store.storeCode());
    }

    public static void validateProduct(Product product) {
        if (product == null) {
            throw new WebApplicationException("Produktdaten fehlen.", Response.Status.BAD_REQUEST);
        }
        if (product.getId() == null) {
            throw new WebApplicationException("Produkt-ID ist erforderlich.", Response.Status.BAD_REQUEST);
        }
        if (product.getName() == null || product.getName().isBlank()) {
            throw new WebApplicationException("Produktname ist erforderlich.", Response.Status.BAD_REQUEST);
        }
        if (product.getPrice() == null || product.getPrice() < 0) {
            throw new WebApplicationException("Preis ist erforderlich und darf nicht negativ sein.", Response.Status.BAD_REQUEST);
        }
        if (product.getLayoutCode() == null || product.getLayoutCode().isBlank()) {
            throw new WebApplicationException("Layout-Code ist erforderlich.", Response.Status.BAD_REQUEST);
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
