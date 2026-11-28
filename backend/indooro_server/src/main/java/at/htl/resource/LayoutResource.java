package at.htl.resource;

import at.htl.admin.service.AdminAccessService;
import at.htl.service.LayoutService;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.annotation.security.PermitAll;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.io.IOException;
import java.util.Map;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

@Path("/api/layout")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "legacy-layout")
public class LayoutResource {

    @Inject
    LayoutService layoutService;

    @Inject
    AdminAccessService adminAccessService;

    @Operation(operationId = "getLegacyCurrentLayout")
    @GET
    @Path("/current")
    @PermitAll
    public Response getCurrentLayout() {
        try {
            return Response.ok(layoutService.getCurrentLayout()).build();
        } catch (IOException e) {
            throw new WebApplicationException("Current layout could not be loaded", e, Response.Status.INTERNAL_SERVER_ERROR);
        }
    }

    @Operation(operationId = "saveLegacyCurrentLayout", deprecated = true)
    @POST
    @Path("/current")
    @RolesAllowed("admin")
    public Response saveCurrentLayout(JsonNode layout) {
        adminAccessService.requireAdmin();
        if (layout == null || layout.isNull() || layout.isEmpty()) {
            throw new WebApplicationException("Layout payload is required", Response.Status.BAD_REQUEST);
        }

        try {
            LayoutService.LayoutHistoryEntry savedLayout = layoutService.saveCurrentLayout(layout);
            return Response.ok(Map.of(
                    "message", "Layout saved successfully",
                    "layoutId", savedLayout.layoutId(),
                    "savedAt", savedLayout.savedAt()
            )).build();
        } catch (IOException e) {
            throw new WebApplicationException("Layout could not be saved", e, Response.Status.INTERNAL_SERVER_ERROR);
        }
    }

    @Operation(operationId = "listLegacyLayoutHistory")
    @GET
    @Path("/history")
    @PermitAll
    public Response getLayoutHistory(@QueryParam("limit") Integer limit) {
        try {
            return Response.ok(layoutService.getRecentLayouts(limit)).build();
        } catch (IOException e) {
            throw new WebApplicationException("Layout history could not be loaded", e, Response.Status.INTERNAL_SERVER_ERROR);
        }
    }

    @Operation(operationId = "getLegacyLayoutVersion")
    @GET
    @Path("/versions/{layoutId}")
    @PermitAll
    public Response getLayoutVersion(@PathParam("layoutId") String layoutId) {
        try {
            JsonNode layout = layoutService.getLayoutVersion(layoutId);
            if (layout == null) {
                throw new WebApplicationException("Layout version not found", Response.Status.NOT_FOUND);
            }
            return Response.ok(layout).build();
        } catch (IOException e) {
            throw new WebApplicationException("Layout version could not be loaded", e, Response.Status.INTERNAL_SERVER_ERROR);
        }
    }
}
