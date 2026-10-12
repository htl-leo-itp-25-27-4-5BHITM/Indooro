package at.htl.resource.admin;

import at.htl.admin.service.AdminAccessService;
import at.htl.model.Product;
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
import org.jboss.logging.Logger;

import java.io.IOException;
import java.util.List;

@Path("/api/admin/products")
@RolesAllowed("admin")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class AdminProductResource extends AdminApiSupport {

    private static final Logger LOG = Logger.getLogger(AdminProductResource.class);

    @Inject
    AdminAccessService adminAccessService;

    @Inject
    OpenSearchService openSearchService;

    @GET
    public Object listProducts(@QueryParam("page") Integer page,
                               @QueryParam("size") Integer size,
                               @QueryParam("q") String query) {
        adminAccessService.requireAdmin();

        try {
            if (page != null) {
                int normalizedPage = normalizePage(page);
                int normalizedSize = normalizePageSize(size);
                return openSearchService.searchAdminProductsPage(query, normalizedPage, normalizedSize);
            }
            // Preserve the array response for existing clients that have not adopted paging yet.
            int legacySize = normalizeProductListSize(size);
            if (query != null && !query.isBlank()) {
                return openSearchService.searchProducts(query, legacySize);
            }
            return openSearchService.getAllProducts(legacySize);
        } catch (IOException exception) {
            LOG.error("Error loading admin products", exception);
            throw new WebApplicationException(
                    "Produktliste konnte nicht geladen werden.",
                    Response.Status.INTERNAL_SERVER_ERROR
            );
        }
    }

    @POST
    public Product upsertProduct(Product product) {
        adminAccessService.requireAdmin();
        validateProduct(product);

        product.setName(product.getName().trim());
        product.setLayoutCode(product.getLayoutCode().trim());
        product.setStoreId(normalizeOptional(product.getStoreId()));
        product.setStoreCode(normalizeOptional(product.getStoreCode()));

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
    public Response deleteProduct(@PathParam("id") Integer id) {
        adminAccessService.requireAdmin();

        if (id == null || id < 1) {
            throw badRequest("Produkt-ID muss eine positive ganze Zahl sein.");
        }

        try {
            boolean deleted = openSearchService.deleteProduct(id);
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

    private String normalizeOptional(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
