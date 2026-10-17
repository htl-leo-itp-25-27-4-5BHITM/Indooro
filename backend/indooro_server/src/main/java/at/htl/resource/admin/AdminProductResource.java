package at.htl.resource.admin;

import at.htl.admin.service.AdminAccessService;
import at.htl.model.Product;
import at.htl.service.CatalogStoreResolver;
import at.htl.service.CatalogStoreResolver.CatalogStoreException;
import at.htl.service.CatalogStoreResolver.ResolvedStore;
import at.htl.service.OpenSearchService;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
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

        try {
            openSearchService.indexProduct(product);
            return product;
        } catch (IOException exception) {
            LOG.error("Error indexing admin product", exception);
            throw new WebApplicationException(
                    "Produkt konnte nicht gespeichert werden.",
                    Response.Status.INTERNAL_SERVER_ERROR
            );
        }
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

        try {
            boolean deleted = openSearchService.deleteProduct(id, store.storeCode());
            if (!deleted) {
                throw new WebApplicationException("Produkt wurde nicht gefunden.", Response.Status.NOT_FOUND);
            }
            return Response.noContent().build();
        } catch (IOException exception) {
            LOG.error("Error deleting admin product", exception);
            throw new WebApplicationException(
                    "Produkt konnte nicht geloescht werden.",
                    Response.Status.INTERNAL_SERVER_ERROR
            );
        }
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
