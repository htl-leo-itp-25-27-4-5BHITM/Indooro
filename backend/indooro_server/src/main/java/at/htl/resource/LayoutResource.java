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
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;

import java.io.IOException;
import java.util.Map;

@Path("/api/layout")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class LayoutResource {

    private static final Logger LOG = Logger.getLogger(LayoutResource.class);

    @Inject
    LayoutService layoutService;

    @Inject
    AdminAccessService adminAccessService;

    @GET
    @Path("/current")
    @PermitAll
    public Response getCurrentLayout() {
        try {
            return Response.ok(layoutService.getCurrentLayout()).build();
        } catch (IOException e) {
            LOG.error("Error loading current layout", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Current layout could not be loaded"))
                    .build();
        }
    }

    @POST
    @Path("/current")
    @RolesAllowed("admin")
    public Response saveCurrentLayout(JsonNode layout) {
        adminAccessService.requireAdmin();
        if (layout == null || layout.isNull() || layout.isEmpty()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Layout payload is required"))
                    .build();
        }

        try {
            LayoutService.LayoutHistoryEntry savedLayout = layoutService.saveCurrentLayout(layout);
            return Response.ok(Map.of(
                    "message", "Layout saved successfully",
                    "layoutId", savedLayout.layoutId(),
                    "savedAt", savedLayout.savedAt()
            )).build();
        } catch (IOException e) {
            LOG.error("Error saving current layout", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Layout could not be saved"))
                    .build();
        }
    }

    @GET
    @Path("/history")
    @PermitAll
    public Response getLayoutHistory(@QueryParam("limit") Integer limit) {
        try {
            return Response.ok(layoutService.getRecentLayouts(limit)).build();
        } catch (IOException e) {
            LOG.error("Error loading layout history", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Layout history could not be loaded"))
                    .build();
        }
    }

    @GET
    @Path("/versions/{layoutId}")
    @PermitAll
    public Response getLayoutVersion(@PathParam("layoutId") String layoutId) {
        try {
            JsonNode layout = layoutService.getLayoutVersion(layoutId);
            if (layout == null) {
                return Response.status(Response.Status.NOT_FOUND)
                        .entity(Map.of("error", "Layout version not found"))
                        .build();
            }
            return Response.ok(layout).build();
        } catch (IOException e) {
            LOG.error("Error loading layout version", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Layout version could not be loaded"))
                    .build();
        }
    }
}
