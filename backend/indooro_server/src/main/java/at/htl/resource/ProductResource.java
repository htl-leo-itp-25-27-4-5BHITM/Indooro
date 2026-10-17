package at.htl.resource;


import at.htl.admin.service.AdminAccessService;
import at.htl.model.Product;
import at.htl.service.CatalogBulkResult;
import at.htl.service.CatalogStoreResolver;
import at.htl.service.CatalogStoreResolver.CatalogStoreException;
import at.htl.service.CatalogStoreResolver.ResolvedStore;
import at.htl.service.OpenSearchService;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Path("/api/products")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class ProductResource {

    private static final Logger LOG = Logger.getLogger(ProductResource.class);

    @Inject
    OpenSearchService openSearchService;

    @Inject
    AdminAccessService adminAccessService;

    @Inject
    CatalogStoreResolver storeResolver;

    /** Store used for read requests that name no store. Empty = no default, old behavior (no store filter). */
    @ConfigProperty(name = "indooro.catalog.default-store-code")
    Optional<String> defaultStoreCode;

    /**
     * Suche nach Produkten
     * GET /api/products/search?q=apfel&size=10&storeCode=SPAR-Leonding-001
     */
    @GET
    @Path("/search")
    public Response searchProducts(
            @QueryParam("q") String query,
            @QueryParam("size") @DefaultValue("10") Integer size,
            @QueryParam("storeId") String storeId,
            @QueryParam("storeCode") String storeCode) {

        if (query == null || query.trim().isEmpty()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity("{\"error\": \"Query parameter 'q' is required\"}")
                    .build();
        }

        try {
            List<Product> products = openSearchService.searchProducts(query, size, storeId,
                    effectiveStoreCode(storeId, storeCode));
            LOG.info("Search for '" + query + "' returned " + products.size() + " results");
            return Response.ok(products).build();
        } catch (IOException e) {
            LOG.error("Error searching products", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity("{\"error\": \"" + e.getMessage() + "\"}")
                    .build();
        }
    }

    /**
     * Holt alle Produkte (eines Marktes)
     * GET /api/products?storeCode=SPAR-Leonding-001
     */
    @GET
    public Response getAllProducts(@QueryParam("size") @DefaultValue("100") Integer size,
                                   @QueryParam("storeId") String storeId,
                                   @QueryParam("storeCode") String storeCode) {
        try {
            List<Product> products = openSearchService.getAllProducts(size, storeId,
                    effectiveStoreCode(storeId, storeCode));
            return Response.ok(products).build();
        } catch (IOException e) {
            LOG.error("Error getting all products", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity("{\"error\": \"" + e.getMessage() + "\"}")
                    .build();
        }
    }

    /**
     * Holt ein Produkt anhand der ID
     * GET /api/products/1?storeCode=SPAR-Leonding-001
     */
    @GET
    @Path("/{id}")
    public Response getProductById(@PathParam("id") Integer id,
                                   @QueryParam("storeId") String storeId,
                                   @QueryParam("storeCode") String storeCode) {
        try {
            Product product = openSearchService.getProductById(id, storeId, effectiveStoreCode(storeId, storeCode));
            if (product != null) {
                return Response.ok(product).build();
            } else {
                return Response.status(Response.Status.NOT_FOUND)
                        .entity("{\"error\": \"Product not found\"}")
                        .build();
            }
        } catch (IOException e) {
            LOG.error("Error getting product by id", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity("{\"error\": \"" + e.getMessage() + "\"}")
                    .build();
        }
    }

    /**
     * Indexiert ein einzelnes Produkt (Markt im Body: storeId oder storeCode)
     * POST /api/products
     */
    @POST
    @RolesAllowed("admin")
    public Response indexProduct(Product product) {
        adminAccessService.requireAdmin();
        validateProduct(product);

        ResolvedStore store;
        try {
            store = storeResolver.require(product.getStoreId(), product.getStoreCode());
        } catch (CatalogStoreException exception) {
            return errorResponse(Response.Status.BAD_REQUEST, exception.getMessage());
        }
        applyStore(product, store);

        try {
            String result = openSearchService.indexProduct(product);
            return Response.ok("{\"result\": \"" + result + "\"}").build();
        } catch (IOException e) {
            LOG.error("Error indexing product", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity("{\"error\": \"" + e.getMessage() + "\"}")
                    .build();
        }
    }

    /**
     * Indexiert mehrere Produkte. storeId/storeCode als Query-Parameter gelten als Vorgabe fuer Items ohne eigenen Markt;
     * ein Item, das dem Parameter widerspricht, wird als fehlerhafte Zeile gemeldet.
     * POST /api/products/bulk?storeCode=SPAR-Leonding-001
     */
    @POST
    @Path("/bulk")
    @RolesAllowed("admin")
    public Response indexProducts(@QueryParam("storeId") String storeId,
                                  @QueryParam("storeCode") String storeCode,
                                  List<Product> products) {
        adminAccessService.requireAdmin();
        if (products == null || products.isEmpty()) {
            throw new WebApplicationException("Produktliste ist erforderlich.", Response.Status.BAD_REQUEST);
        }
        products.forEach(this::validateProduct);
        for (Product product : products) {
            if (product.getId() < 1) {
                throw new WebApplicationException("Produkt-IDs müssen positiv sein.", Response.Status.BAD_REQUEST);
            }
        }

        ResolvedStore parameterStore;
        try {
            parameterStore = storeResolver.resolveOptional(storeId, storeCode);
        } catch (CatalogStoreException exception) {
            return errorResponse(Response.Status.BAD_REQUEST, exception.getMessage());
        }
        if (parameterStore == null && products.stream().anyMatch(this::hasNoStore)) {
            return errorResponse(Response.Status.BAD_REQUEST, CatalogStoreResolver.MISSING_STORE);
        }

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
                transportFailure = "Transport failed; some writes may have persisted. Verify before retrying.";
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
        CatalogBulkResult result = CatalogBulkResult.fromRows(rows);
        if (transportFailure != null) {
            return Response.status(Response.Status.SERVICE_UNAVAILABLE).entity(result).build();
        }
        return Response.ok(result).build();
    }

    /** Explicit store parameter wins; without any store parameter the configured default store applies (if set). */
    private String effectiveStoreCode(String storeId, String storeCode) {
        if (isBlank(storeId) && isBlank(storeCode)) {
            return defaultStoreCode
                    .map(String::trim)
                    .filter(value -> !value.isEmpty())
                    .orElse(null);
        }
        return isBlank(storeCode) ? null : storeCode.trim();
    }

    private boolean hasNoStore(Product product) {
        return isBlank(product.getStoreId()) && isBlank(product.getStoreCode());
    }

    private void applyStore(Product product, ResolvedStore store) {
        product.setStoreId(store.id().toString());
        product.setStoreCode(store.storeCode());
    }

    private Response errorResponse(Response.Status status, String message) {
        return Response.status(status)
                .type(MediaType.APPLICATION_JSON)
                .entity(Map.of("error", message))
                .build();
    }

    private void validateProduct(Product product) {
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
