package at.htl.resource;

import at.htl.admin.service.AdminAccessService;
import at.htl.model.Category;
import at.htl.service.CategoryService;
import at.htl.service.CatalogBulkResult;
import org.opensearch.client.opensearch._types.OpenSearchException;
import org.opensearch.client.ResponseException;
import io.smallrye.common.annotation.Blocking;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@Blocking
@Path("/api/categories")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class CategoryResource {

    @Inject
    CategoryService categoryService;

    @Inject
    AdminAccessService adminAccessService;

    @GET
    public Response getAllCategories(@QueryParam("size") @DefaultValue("100") Integer size) {
        try {
            return Response.ok(categoryService.getAllCategories(size)).build();
        } catch (IOException e) {
            return Response.serverError().entity(Map.of("error", e.getMessage())).build();
        }
    }

    @GET
    @Path("/{categoryCode}")
    public Response getCategoryByCode(@PathParam("categoryCode") Integer categoryCode) {
        try {
            Category category = categoryService.getCategoryByCode(categoryCode);
            if (category == null) {
                return Response.status(Response.Status.NOT_FOUND)
                        .entity(Map.of("error", "Category not found"))
                        .build();
            }
            return Response.ok(category).build();
        } catch (IOException e) {
            return Response.serverError().entity(Map.of("error", e.getMessage())).build();
        }
    }

    @POST
    @RolesAllowed("admin")
    public Response upsertCategory(@QueryParam("createOnly") @DefaultValue("false") boolean createOnly, Category category) {
        adminAccessService.requireAdmin();
        try {
            if (createOnly) {
                return Response.ok(categoryService.create(category)).build();
            }
            CatalogBulkResult result = categoryService.bulkInsert(List.of(category));
            if (result.failed() > 0 || result.unknown() > 0) {
                return Response.status(Response.Status.SERVICE_UNAVAILABLE).entity(result).build();
            }
            return Response.ok(category).build();
        } catch (IllegalArgumentException e) {
            return Response.status(Response.Status.BAD_REQUEST).entity(Map.of("error", e.getMessage())).build();
        } catch (OpenSearchException e) {
            if (e.status() == 409) {
                return Response.status(Response.Status.CONFLICT).entity(Map.of("error", "Kategorie-Code existiert bereits.")).build();
            }
            throw e;
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 409) {
                return Response.status(Response.Status.CONFLICT).entity(Map.of("error", "Kategorie-Code existiert bereits.")).build();
            }
            return Response.serverError().entity(Map.of("error", "Category create failed")).build();
        } catch (IOException e) {
            return Response.serverError().entity(Map.of("error", e.getMessage())).build();
        }
    }

    @PUT
    @Path("/{categoryCode}")
    @RolesAllowed("admin")
    public Response upsertCategoryByCode(@PathParam("categoryCode") Integer categoryCode, Category category) {
        adminAccessService.requireAdmin();
        if (category != null) {
            category.setCategoryCode(categoryCode);
        }
        return upsertCategory(false, category);
    }

    @POST
    @Path("/bulk")
    @RolesAllowed("admin")
    public Response bulkInsert(List<Category> categories) {
        adminAccessService.requireAdmin();
        try {
            CatalogBulkResult result = categoryService.bulkInsert(categories);
            return Response.ok(result).build();
        } catch (IllegalArgumentException e) {
            return Response.status(Response.Status.BAD_REQUEST).entity(Map.of("error", e.getMessage())).build();
        } catch (IOException e) {
            if (categories == null) {
                return Response.serverError().entity(Map.of("error", e.getMessage())).build();
            }
            return Response.status(Response.Status.SERVICE_UNAVAILABLE)
                    .entity(CatalogBulkResult.unknown(categories.stream().map(category -> String.valueOf(category.getCategoryCode())).toList(),
                            "Transport failed; some writes may have persisted. Verify before retrying."))
                    .build();
        }
    }
}
