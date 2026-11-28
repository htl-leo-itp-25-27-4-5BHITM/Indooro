package at.htl.resource;

import java.net.URI;
import jakarta.ws.rs.core.UriInfo;
import jakarta.ws.rs.core.Context;
import at.htl.admin.service.AdminAccessService;
import at.htl.admin.service.AuditLogService;
import at.htl.admin.util.AuditEntityIds;
import at.htl.model.Category;
import at.htl.service.CategoryService;
import at.htl.service.CatalogBulkResult;
import org.opensearch.client.opensearch._types.OpenSearchException;
import org.opensearch.client.ResponseException;
import io.smallrye.common.annotation.Blocking;
import jakarta.annotation.security.PermitAll;
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
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import org.jboss.logging.Logger;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

@Blocking
@Path("/api/categories")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "catalog")
public class CategoryResource {

    private static final Logger LOG = Logger.getLogger(CategoryResource.class);

    @Inject
    CategoryService categoryService;

    @Inject
    AdminAccessService adminAccessService;

    @Inject
    AuditLogService auditLogService;

    @Operation(operationId = "listCategories")
    @GET
    @PermitAll
    public Response getAllCategories(@QueryParam("size") @DefaultValue("100") Integer size) {
        try {
            return Response.ok(categoryService.getAllCategories(size)).build();
        } catch (IOException e) {
            throw new WebApplicationException(e, Response.Status.INTERNAL_SERVER_ERROR);
        }
    }

    @Operation(operationId = "getCategory")
    @GET
    @Path("/{categoryCode}")
    @PermitAll
    public Response getCategoryByCode(@PathParam("categoryCode") Integer categoryCode) {
        try {
            Category category = categoryService.getCategoryByCode(categoryCode);
            if (category == null) {
                throw new WebApplicationException("Category not found", Response.Status.NOT_FOUND);
            }
            return Response.ok(category).build();
        } catch (IOException e) {
            throw new WebApplicationException(e, Response.Status.INTERNAL_SERVER_ERROR);
        }
    }

    @Operation(operationId = "upsertCategory")
    @POST
    @RolesAllowed("admin")
    public Response upsertCategory(@QueryParam("createOnly") @DefaultValue("false") boolean createOnly,
                                   Category category,
                                   @Context UriInfo uriInfo) {
        adminAccessService.requireAdmin();
        boolean existed;
        try {
            existed = !createOnly && category != null && category.getCategoryCode() != null
                    && categoryService.getCategoryByCode(category.getCategoryCode()) != null;
        } catch (IOException e) {
            throw new WebApplicationException(e, Response.Status.INTERNAL_SERVER_ERROR);
        }
        write(createOnly, category);
        URI location = uriInfo.getAbsolutePathBuilder().path(String.valueOf(category.getCategoryCode())).build();
        return existed
                ? Response.noContent().location(location).build()
                : Response.created(location).build();
    }

    private Category write(boolean createOnly, Category category) {
        try {
            if (createOnly) {
                Category created = categoryService.create(category);
                auditCategoryWrite(created.getCategoryCode(), "CREATE", created);
                return created;
            }
            CatalogBulkResult result = categoryService.bulkInsert(List.of(category));
            if (result.failed() > 0 || result.unknown() > 0) {
                throw new CatalogBulkWriteException(result, null);
            }
            auditCategoryWrite(category.getCategoryCode(), "UPSERT", category);
            return category;
        } catch (IllegalArgumentException e) {
            throw new WebApplicationException(e.getMessage(), Response.Status.BAD_REQUEST);
        } catch (OpenSearchException e) {
            if (e.status() == 409) {
                throw new WebApplicationException("Kategorie-Code existiert bereits.", Response.Status.CONFLICT);
            }
            throw e;
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 409) {
                throw new WebApplicationException("Kategorie-Code existiert bereits.", Response.Status.CONFLICT);
            }
            throw new WebApplicationException("Category create failed", e, Response.Status.INTERNAL_SERVER_ERROR);
        } catch (IOException e) {
            throw new WebApplicationException(e, Response.Status.INTERNAL_SERVER_ERROR);
        }
    }

    @Operation(operationId = "replaceCategory")
    @PUT
    @Path("/{categoryCode}")
    @RolesAllowed("admin")
    public Response upsertCategoryByCode(@PathParam("categoryCode") Integer categoryCode, Category category) {
        adminAccessService.requireAdmin();
        if (category != null) {
            category.setCategoryCode(categoryCode);
        }
        return Response.ok(write(false, category)).build();
    }

    @Operation(operationId = "indexCategoriesBulk")
    @POST
    @Path("/bulk")
    @RolesAllowed("admin")
    public Response bulkInsert(List<Category> categories) {
        adminAccessService.requireAdmin();
        try {
            CatalogBulkResult result = categoryService.bulkInsert(categories);
            auditCategoryBulk(result);
            return Response.ok(result).build();
        } catch (IllegalArgumentException e) {
            throw new WebApplicationException(e.getMessage(), Response.Status.BAD_REQUEST);
        } catch (IOException e) {
            if (categories == null) {
                throw new WebApplicationException(e, Response.Status.INTERNAL_SERVER_ERROR);
            }
            CatalogBulkResult result = CatalogBulkResult.unknown(
                    categories.stream().map(category -> String.valueOf(category.getCategoryCode())).toList(),
                    "Transport failed; some writes may have persisted. Verify before retrying.");
            throw new CatalogBulkWriteException(result, e);
        }
    }

    /** Ein Eintrag pro Einzelschreibvorgang; ein Auditfehler veraendert die bereits erfolgte Schreibung nicht. */
    private void auditCategoryWrite(int categoryCode, String action, Category after) {
        try {
            auditLogService.logByAdmin(adminAccessService.currentUser(), "CATEGORY", AuditEntityIds.category(categoryCode),
                    action, "Kategorie " + categoryCode + " gespeichert", null, after);
        } catch (RuntimeException exception) {
            LOG.warn("Audit-Eintrag fuer Kategorie konnte nicht geschrieben werden", exception);
        }
    }

    /** Ein Eintrag pro beantwortetem Bulk-Aufruf mit Zaehlern. */
    private void auditCategoryBulk(CatalogBulkResult result) {
        try {
            Map<String, Object> after = new LinkedHashMap<>();
            after.put("count", result.count());
            after.put("saved", result.saved());
            after.put("failed", result.failed());
            after.put("unknown", result.unknown());
            auditLogService.logByAdmin(adminAccessService.currentUser(), "CATEGORY", AuditEntityIds.categoryBulk(),
                    "BULK_UPSERT", "Bulk: " + result.saved() + " gespeichert, " + result.failed() + " fehlgeschlagen",
                    null, after);
        } catch (RuntimeException exception) {
            LOG.warn("Audit-Eintrag fuer Kategorie-Bulk konnte nicht geschrieben werden", exception);
        }
    }
}
