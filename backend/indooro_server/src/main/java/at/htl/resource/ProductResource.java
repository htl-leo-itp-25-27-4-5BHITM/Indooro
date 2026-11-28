package at.htl.resource;


import java.net.URI;
import jakarta.ws.rs.core.UriInfo;
import jakarta.ws.rs.core.Context;
import at.htl.admin.service.AdminAccessService;
import at.htl.admin.service.AuditLogService;
import at.htl.admin.util.AuditEntityIds;
import at.htl.model.Product;
import at.htl.service.CatalogBulkResult;
import at.htl.service.CatalogStoreResolver;
import at.htl.service.CatalogStoreResolver.CatalogStoreException;
import at.htl.service.CatalogStoreResolver.ResolvedStore;
import at.htl.service.LegacyDocumentGuard;
import at.htl.service.OpenSearchService;
import at.htl.service.ProductBulkService;
import jakarta.annotation.security.PermitAll;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.parameters.Parameter;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

@Path("/api/products")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "catalog")
public class ProductResource {

    private static final Logger LOG = Logger.getLogger(ProductResource.class);

    @Inject
    OpenSearchService openSearchService;

    @Inject
    AdminAccessService adminAccessService;

    @Inject
    CatalogStoreResolver storeResolver;

    @Inject
    ProductBulkService bulkService;

    @Inject
    LegacyDocumentGuard legacyDocumentGuard;

    @Inject
    AuditLogService auditLogService;

    /** Store used for read requests that name no store. Empty = no default: such reads see only legacy documents without storeCode (fail-closed). */
    @ConfigProperty(name = "indooro.catalog.default-store-code")
    Optional<String> defaultStoreCode;

    /**
     * Suche nach Produkten
     * GET /api/products/search?q=apfel&size=10&storeCode=SPAR-Leonding-001
     */
    @Operation(operationId = "searchProducts")
    @GET
    @Path("/search")
    @PermitAll
    public Response searchProducts(
            @Parameter(required = true) @QueryParam("q") String query,
            @QueryParam("size") @DefaultValue("10") Integer size,
            @QueryParam("storeId") String storeId,
            @QueryParam("storeCode") String storeCode) {

        if (query == null || query.trim().isEmpty()) {
            throw new WebApplicationException("Query parameter 'q' is required", Response.Status.BAD_REQUEST);
        }

        try {
            List<Product> products = openSearchService.searchProducts(query, clamp(size, 1, 100), storeId,
                    effectiveStoreCode(storeId, storeCode));
            LOG.info("Search for '" + query + "' returned " + products.size() + " results");
            return Response.ok(products).build();
        } catch (IOException e) {
            throw new WebApplicationException("Error searching products", e, Response.Status.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Holt alle Produkte (eines Marktes)
     * GET /api/products?storeCode=SPAR-Leonding-001
     */
    @Operation(operationId = "listProducts")
    @GET
    @PermitAll
    public Response getAllProducts(@QueryParam("size") @DefaultValue("100") Integer size,
                                   @QueryParam("storeId") String storeId,
                                   @QueryParam("storeCode") String storeCode) {
        try {
            List<Product> products = openSearchService.getAllProducts(clamp(size, 1, 500), storeId,
                    effectiveStoreCode(storeId, storeCode));
            return Response.ok(products).build();
        } catch (IOException e) {
            throw new WebApplicationException("Error getting all products", e, Response.Status.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Holt ein Produkt anhand der ID
     * GET /api/products/1?storeCode=SPAR-Leonding-001
     */
    @Operation(operationId = "getProduct")
    @GET
    @Path("/{id}")
    @PermitAll
    public Response getProductById(@PathParam("id") Integer id,
                                   @QueryParam("storeId") String storeId,
                                   @QueryParam("storeCode") String storeCode) {
        try {
            Product product = openSearchService.getProductById(id, storeId, effectiveStoreCode(storeId, storeCode));
            if (product != null) {
                return Response.ok(product).build();
            } else {
                throw new WebApplicationException("Product not found", Response.Status.NOT_FOUND);
            }
        } catch (IOException e) {
            throw new WebApplicationException("Error getting product by id", e, Response.Status.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Indexiert ein einzelnes Produkt (Markt im Body: storeId oder storeCode)
     * POST /api/products
     */
    @Operation(operationId = "indexProduct", deprecated = true)
    @POST
    @RolesAllowed("admin")
    public Response indexProduct(Product product, @Context UriInfo uriInfo) {
        adminAccessService.requireAdmin();
        ProductBulkService.validateProduct(product);

        ResolvedStore store;
        try {
            store = storeResolver.require(product.getStoreId(), product.getStoreCode());
        } catch (CatalogStoreException exception) {
            throw new WebApplicationException(exception.getMessage(), Response.Status.BAD_REQUEST);
        }
        ProductBulkService.applyStore(product, store);
        legacyDocumentGuard.requireNoLegacyDocuments(store.storeCode());

        try {
            String result = openSearchService.indexProduct(product);
            auditProductWrite(product.getId(), store.storeCode(), "UPSERT", product);
            URI location = uriInfo.getAbsolutePathBuilder()
                    .path(String.valueOf(product.getId()))
                    .queryParam("storeCode", store.storeCode())
                    .build();
            return "created".equalsIgnoreCase(result)
                    ? Response.created(location).build()
                    : Response.noContent().location(location).build();
        } catch (IOException e) {
            throw new WebApplicationException("Error indexing product", e, Response.Status.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Indexiert mehrere Produkte. storeId/storeCode als Query-Parameter gelten als Vorgabe fuer Items ohne eigenen Markt;
     * ein Item, das dem Parameter widerspricht, wird als fehlerhafte Zeile gemeldet.
     * POST /api/products/bulk?storeCode=SPAR-Leonding-001
     */
    @Operation(operationId = "indexProductsBulk", deprecated = true)
    @POST
    @Path("/bulk")
    @RolesAllowed("admin")
    public Response indexProducts(@QueryParam("storeId") String storeId,
                                  @QueryParam("storeCode") String storeCode,
                                  List<Product> products) {
        adminAccessService.requireAdmin();
        try {
            bulkService.validateRequest(products);
        } catch (ProductBulkService.CatalogBulkRequestException exception) {
            throw new WebApplicationException(exception.getMessage(), Response.Status.BAD_REQUEST);
        }

        ResolvedStore parameterStore;
        try {
            parameterStore = storeResolver.resolveOptional(storeId, storeCode);
        } catch (CatalogStoreException exception) {
            throw new WebApplicationException(exception.getMessage(), Response.Status.BAD_REQUEST);
        }
        if (parameterStore == null && products.stream().anyMatch(ProductBulkService::hasNoStore)) {
            throw new WebApplicationException(CatalogStoreResolver.MISSING_STORE, Response.Status.BAD_REQUEST);
        }

        ProductBulkService.Outcome outcome = bulkService.write(products, parameterStore);
        if (outcome.transportFailed()) {
            throw new CatalogBulkWriteException(outcome.result(), null);
        }
        auditProductBulk(parameterStore == null ? null : parameterStore.storeCode(), outcome.result());
        return Response.ok(outcome.result()).build();
    }

    /** Ein Eintrag pro Einzelschreibvorgang; ein Auditfehler veraendert die Antwort nicht. */
    private void auditProductWrite(Integer productId, String storeCode, String action, Object after) {
        try {
            auditLogService.logByAdmin(adminAccessService.currentUser(), "PRODUCT", AuditEntityIds.product(productId),
                    action, "Produkt " + productId + " gespeichert (Markt " + storeCode + ")", null, after);
        } catch (RuntimeException exception) {
            LOG.warn("Audit-Eintrag fuer Produkt konnte nicht geschrieben werden", exception);
        }
    }

    /** Ein Eintrag pro beantwortetem Bulk-Aufruf mit Zaehlern; ohne Markt-Parameter als "*". */
    private void auditProductBulk(String storeCode, CatalogBulkResult result) {
        try {
            String marketKey = storeCode == null ? "*" : storeCode;
            Map<String, Object> after = new LinkedHashMap<>();
            after.put("storeCode", storeCode);
            after.put("count", result.count());
            after.put("saved", result.saved());
            after.put("failed", result.failed());
            after.put("unknown", result.unknown());
            auditLogService.logByAdmin(adminAccessService.currentUser(), "PRODUCT", AuditEntityIds.productBulk(marketKey),
                    "BULK_UPSERT", "Bulk: " + result.saved() + " gespeichert, " + result.failed() + " fehlgeschlagen (Markt "
                            + marketKey + ")", null, after);
        } catch (RuntimeException exception) {
            LOG.warn("Audit-Eintrag fuer Produkt-Bulk konnte nicht geschrieben werden", exception);
        }
    }

    /** Out-of-range sizes are clamped to the bounds instead of rejected; a missing size keeps the default. */
    static int clamp(Integer value, int min, int max) {
        return Math.min(Math.max(value == null ? min : value, min), max);
    }

    /**
     * Explicit store parameter wins; without any store parameter the configured default store applies (if set).
     * Without both, null is returned and OpenSearchService restricts the read to documents without storeCode.
     */
    private String effectiveStoreCode(String storeId, String storeCode) {
        if (isBlank(storeId) && isBlank(storeCode)) {
            return defaultStoreCode
                    .map(String::trim)
                    .filter(value -> !value.isEmpty())
                    .orElse(null);
        }
        return isBlank(storeCode) ? null : storeCode.trim();
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
