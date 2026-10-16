package at.htl.resource;


import at.htl.admin.service.AdminAccessService;
import at.htl.model.Product;
import at.htl.service.OpenSearchService;
import at.htl.service.CatalogBulkResult;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;

import java.io.IOException;
import java.util.List;
import java.util.HashSet;
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

    /**
     * Suche nach Produkten
     * GET /api/products/search?q=apfel&size=10
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
            List<Product> products = openSearchService.searchProducts(query, size, storeId, storeCode);
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
     * Holt alle Produkte
     * GET /api/products
     */
    @GET
    public Response getAllProducts(@QueryParam("size") @DefaultValue("100") Integer size) {
        try {
            List<Product> products = openSearchService.getAllProducts(size);
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
     * GET /api/products/1
     */
    @GET
    @Path("/{id}")
    public Response getProductById(@PathParam("id") Integer id) {
        try {
            Product product = openSearchService.getProductById(id);
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
     * Indexiert ein einzelnes Produkt
     * POST /api/products
     */
    @POST
    @RolesAllowed("admin")
    public Response indexProduct(Product product) {
        adminAccessService.requireAdmin();
        validateProduct(product);
        normalizeProductScope(product);

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
     * Indexiert mehrere Produkte
     * POST /api/products/bulk
     */
    @POST
    @Path("/bulk")
    @RolesAllowed("admin")
    public Response indexProducts(List<Product> products) {
        adminAccessService.requireAdmin();
        if (products == null || products.isEmpty()) {
            throw new WebApplicationException("Produktliste ist erforderlich.", Response.Status.BAD_REQUEST);
        }
        products.forEach(this::validateProduct);
        Set<Integer> ids = new HashSet<>();
        for (Product product : products) {
            if (product.getId() < 1 || !ids.add(product.getId())) {
                throw new WebApplicationException("Produkt-IDs müssen positiv und eindeutig sein.", Response.Status.BAD_REQUEST);
            }
        }
        products.forEach(this::normalizeProductScope);

        try {
            CatalogBulkResult result = openSearchService.indexProducts(products);
            return Response.ok(result).build();
        } catch (IOException e) {
            LOG.error("Error bulk indexing products", e);
            return Response.status(Response.Status.SERVICE_UNAVAILABLE)
                    .entity(CatalogBulkResult.unknown(products.stream().map(product -> String.valueOf(product.getId())).toList(),
                            "Transport failed; some writes may have persisted. Verify before retrying."))
                    .build();
        }
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

    private void normalizeProductScope(Product product) {
        product.setStoreId(normalizeOptional(product.getStoreId()));
        product.setStoreCode(normalizeOptional(product.getStoreCode()));
    }

    private String normalizeOptional(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
