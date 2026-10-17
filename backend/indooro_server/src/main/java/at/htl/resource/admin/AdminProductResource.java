package at.htl.resource.admin;

import at.htl.admin.service.AdminAccessService;
import at.htl.admin.service.AuditLogService;
import at.htl.admin.service.CurrentAdminUser;
import at.htl.admin.util.AuditEntityIds;
import at.htl.model.Product;
import at.htl.service.BulkIdempotencyCache;
import at.htl.service.CatalogBulkResult;
import at.htl.service.CatalogStoreResolver;
import at.htl.service.CatalogStoreResolver.CatalogStoreException;
import at.htl.service.CatalogStoreResolver.ResolvedStore;
import at.htl.service.LegacyDocumentGuard;
import at.htl.service.OpenSearchService;
import at.htl.service.ProductBulkService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.BadRequestException;
import org.jboss.logging.Logger;

import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.HexFormat;
import java.util.regex.Pattern;

@Path("/api/admin/products")
@RolesAllowed({"admin", "region-manager", "store-manager"})
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class AdminProductResource extends AdminApiSupport {

    private static final Logger LOG = Logger.getLogger(AdminProductResource.class);

    @Inject
    AdminAccessService adminAccessService;

    @Inject
    OpenSearchService openSearchService;

    @Inject
    CatalogStoreResolver storeResolver;

    @Inject
    ProductBulkService bulkService;

    @Inject
    BulkIdempotencyCache idempotencyCache;

    @Inject
    AuditLogService auditLogService;

    @Inject
    ObjectMapper objectMapper;

    static final String IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";
    static final String IDEMPOTENT_REPLAY_HEADER = "Idempotent-Replay";
    private static final Pattern IDEMPOTENCY_KEY = Pattern.compile("[A-Za-z0-9._-]{1,100}");

    @Inject
    LegacyDocumentGuard legacyDocumentGuard;

    @GET
    public Object listProducts(@QueryParam("page") Integer page,
                               @QueryParam("size") Integer size,
                               @QueryParam("q") String query,
                               @QueryParam("sort") String sort,
                               @QueryParam("routable") Boolean routable,
                               @QueryParam("storeId") String storeId,
                               @QueryParam("storeCode") String storeCode) {
        ResolvedStore store = requireStoreAccess(storeId, storeCode);

        try {
            if (page != null) {
                int normalizedPage = normalizePage(page);
                int normalizedSize = normalizePageSize(size);
                String normalizedSort = normalizeProductSort(sort);
                return openSearchService.searchAdminProductsPage(query, normalizedPage, normalizedSize, normalizedSort,
                        routable, store.id().toString(), store.storeCode());
            }
            if (sort != null || routable != null) {
                throw new BadRequestException("Sortierung und Routbar-Filter erfordern paginierte Produktlisten.");
            }
            // Preserve the array response for existing clients that have not adopted paging yet.
            int legacySize = normalizeProductListSize(size);
            if (query != null && !query.isBlank()) {
                return openSearchService.searchProducts(query, legacySize, store.id().toString(), store.storeCode());
            }
            return openSearchService.getAllProducts(legacySize, store.id().toString(), store.storeCode());
        } catch (IOException exception) {
            LOG.error("Error loading admin products", exception);
            throw new WebApplicationException(
                    "Produktliste konnte nicht geladen werden.",
                    Response.Status.INTERNAL_SERVER_ERROR
            );
        }
    }

    private String normalizeProductSort(String sort) {
        if (sort == null || sort.isBlank()) return "id";
        return switch (sort) {
            case "name", "id", "layoutCode" -> sort;
            default -> throw new BadRequestException("sort muss name, id oder layoutCode sein.");
        };
    }

    @POST
    public Product upsertProduct(Product product) {
        validateProduct(product);

        product.setName(product.getName().trim());
        product.setLayoutCode(product.getLayoutCode().trim());
        ResolvedStore store = requireStoreAccess(product.getStoreId(), product.getStoreCode());
        product.setStoreId(store.id().toString());
        product.setStoreCode(store.storeCode());
        legacyDocumentGuard.requireNoLegacyDocuments(store.storeCode());

        try {
            openSearchService.indexProduct(product);
        } catch (IOException exception) {
            LOG.error("Error indexing admin product", exception);
            throw new WebApplicationException(
                    "Produkt konnte nicht gespeichert werden.",
                    Response.Status.INTERNAL_SERVER_ERROR
            );
        }
        auditProductWrite(product.getId(), store.storeCode(), "UPSERT", "Produkt " + product.getId() + " gespeichert", null, product);
        return product;
    }

    @DELETE
    @Path("/{id}")
    public Response deleteProduct(@PathParam("id") Integer id,
                                  @QueryParam("storeId") String storeId,
                                  @QueryParam("storeCode") String storeCode) {
        if (id == null || id < 1) {
            throw badRequest("Produkt-ID muss eine positive ganze Zahl sein.");
        }
        ResolvedStore store = requireStoreAccess(storeId, storeCode);
        legacyDocumentGuard.requireNoLegacyDocuments(store.storeCode());

        try {
            boolean deleted = openSearchService.deleteProduct(id, store.storeCode());
            if (!deleted) {
                throw new WebApplicationException("Produkt wurde nicht gefunden.", Response.Status.NOT_FOUND);
            }
            auditProductWrite(id, store.storeCode(), "DELETE", "Produkt " + id + " geloescht", Map.of("id", id), null);
            return Response.noContent().build();
        } catch (IOException exception) {
            LOG.error("Error deleting admin product", exception);
            throw new WebApplicationException(
                    "Produkt konnte nicht geloescht werden.",
                    Response.Status.INTERNAL_SERVER_ERROR
            );
        }
    }

    /**
     * Bulk-Import eines Marktes (Zeilenergebnisse wie POST /api/products/bulk). storeId oder storeCode ist Pflicht,
     * der Markt muss im Scope des Benutzers liegen. Items mit eigenem, abweichendem Markt werden als failed-Zeile gemeldet.
     * Optionaler Header Idempotency-Key: gleicher Schluessel + gleicher Body + gleicher Markt liefert die gespeicherte
     * Antwort (Header Idempotent-Replay: true) ohne erneut zu schreiben; gleicher Schluessel mit anderem Body oder Markt
     * ergibt 409. 503 (Transportfehler) wird nicht gespeichert, damit ein Retry wirklich schreibt.
     * Ein Replikat im Cluster (replicas=1); siehe BulkIdempotencyCache.
     * POST /api/admin/products/bulk?storeCode=SPAR-Leonding-001
     */
    @POST
    @Path("/bulk")
    public Response bulkImport(@QueryParam("storeId") String storeId,
                               @QueryParam("storeCode") String storeCode,
                               @HeaderParam(IDEMPOTENCY_KEY_HEADER) String idempotencyKey,
                               List<Product> products) {
        if (isBlank(storeId) && isBlank(storeCode)) {
            return errorResponse(Response.Status.BAD_REQUEST, CatalogStoreResolver.MISSING_STORE);
        }
        if (idempotencyKey != null && !IDEMPOTENCY_KEY.matcher(idempotencyKey).matches()) {
            return errorResponse(Response.Status.BAD_REQUEST,
                    "Idempotency-Key muss 1 bis 100 Zeichen aus A-Z, a-z, 0-9, Punkt, Unterstrich oder Bindestrich haben.");
        }

        ResolvedStore store;
        try {
            store = storeResolver.require(storeId, storeCode);
        } catch (CatalogStoreException exception) {
            return errorResponse(Response.Status.BAD_REQUEST, exception.getMessage());
        }
        adminAccessService.requireStoreAccess(store.id());

        try {
            bulkService.validateRequest(products);
        } catch (ProductBulkService.CatalogBulkRequestException exception) {
            return errorResponse(Response.Status.BAD_REQUEST, exception.getMessage());
        }

        // Fingerprint before the write, because the write stamps storeId/storeCode onto the products.
        String bodyHash = fingerprint(products);
        if (idempotencyKey != null) {
            Optional<BulkIdempotencyCache.Entry> cached = idempotencyCache.get(idempotencyKey);
            if (cached.isPresent()) {
                BulkIdempotencyCache.Entry entry = cached.get();
                if (entry.storeCode().equals(store.storeCode()) && entry.bodyHash().equals(bodyHash)) {
                    return Response.status(entry.httpStatus())
                            .header(IDEMPOTENT_REPLAY_HEADER, "true")
                            .entity(entry.result())
                            .build();
                }
                return errorResponse(Response.Status.CONFLICT,
                        "Idempotency-Key wurde bereits fuer eine andere Anfrage (anderer Body oder Markt) verwendet.");
            }
        }

        ProductBulkService.Outcome outcome = bulkService.write(products, store);
        if (outcome.transportFailed()) {
            return Response.status(Response.Status.SERVICE_UNAVAILABLE).entity(outcome.result()).build();
        }

        CatalogBulkResult result = outcome.result();
        auditBulkImport(store, result, idempotencyKey);
        if (idempotencyKey != null) {
            idempotencyCache.put(idempotencyKey, new BulkIdempotencyCache.Entry(
                    store.storeCode(), bodyHash, Response.Status.OK.getStatusCode(), result, Instant.now()));
        }
        return Response.ok(result).build();
    }

    /** Every admin product call names one store; the caller must have scope on it (admin: all stores). */
    private ResolvedStore requireStoreAccess(String storeId, String storeCode) {
        ResolvedStore store;
        try {
            store = storeResolver.require(storeId, storeCode);
        } catch (CatalogStoreException exception) {
            throw badRequest(exception.getMessage());
        }
        adminAccessService.requireStoreAccess(store.id());
        return store;
    }

    /**
     * Writes one audit entry per answered batch (200). Replays and 503 results are not audited.
     * An audit failure is logged and never changes the response.
     */
    private void auditBulkImport(ResolvedStore store, CatalogBulkResult result, String idempotencyKey) {
        try {
            CurrentAdminUser actor = adminAccessService.currentUser();
            Map<String, Object> after = new LinkedHashMap<>();
            after.put("storeCode", store.storeCode());
            after.put("count", result.count());
            after.put("saved", result.saved());
            after.put("failed", result.failed());
            after.put("unknown", result.unknown());
            if (idempotencyKey != null) {
                after.put("idempotencyKey", idempotencyKey);
            }
            auditLogService.logByAdmin(actor, "PRODUCT_CATALOG", store.id(), "BULK_IMPORT",
                    result.saved() + " gespeichert, " + result.failed() + " fehlgeschlagen", null, after);
        } catch (RuntimeException exception) {
            LOG.error("Audit-Eintrag fuer Produkt-Bulk-Import konnte nicht geschrieben werden", exception);
        }
    }

    /**
     * Audit fuer Einzelschreibvorgaenge (Akteur = angemeldeter Admin-Benutzer). Ein Auditfehler wird
     * geloggt und veraendert die bereits erfolgte Schreibung nicht.
     */
    private void auditProductWrite(int productId, String storeCode, String action, String summary, Object before, Object after) {
        try {
            auditLogService.logByAdmin(adminAccessService.currentUser(), "PRODUCT", AuditEntityIds.product(productId),
                    action, summary + " (Markt " + storeCode + ")", before, after);
        } catch (RuntimeException exception) {
            LOG.error("Audit-Eintrag fuer Produkt konnte nicht geschrieben werden", exception);
        }
    }

    /** SHA-256 over the canonical JSON of the request products (whitespace-insensitive). */
    private String fingerprint(List<Product> products) {
        try {
            byte[] json = objectMapper.writeValueAsBytes(products);
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json));
        } catch (JsonProcessingException | NoSuchAlgorithmException exception) {
            throw new IllegalStateException("Request-Fingerprint konnte nicht berechnet werden.", exception);
        }
    }

    private Response errorResponse(Response.Status status, String message) {
        return Response.status(status)
                .type(MediaType.APPLICATION_JSON)
                .entity(Map.of("error", message))
                .build();
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private void validateProduct(Product product) {
        if (product == null) {
            throw badRequest("Produktdaten fehlen.");
        }
        if (product.getId() == null) {
            throw badRequest("Produkt-ID ist erforderlich.");
        }
        if (product.getName() == null || product.getName().isBlank()) {
            throw badRequest("Produktname ist erforderlich.");
        }
        if (product.getPrice() == null || product.getPrice() < 0) {
            throw badRequest("Preis ist erforderlich und darf nicht negativ sein.");
        }
        if (product.getLayoutCode() == null || product.getLayoutCode().isBlank()) {
            throw badRequest("Layout-Code ist erforderlich.");
        }
    }

    private WebApplicationException badRequest(String message) {
        return new WebApplicationException(message, Response.Status.BAD_REQUEST);
    }

    private int normalizeProductListSize(Integer size) {
        if (size == null) {
            return 500;
        }
        if (size < 1) {
            return 1;
        }
        return Math.min(size, 1000);
    }

    private int normalizePage(Integer page) {
        return page == null ? 0 : Math.max(0, page);
    }

    private int normalizePageSize(Integer size) {
        if (size == null) return 20;
        return Math.min(Math.max(size, 1), 100);
    }
}
