package at.htl.resource;

import at.htl.admin.service.AdminAccessService;
import at.htl.service.OpenSearchService;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;

import java.io.IOException;

@Path("/api/admin")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class AdminResource {

    private static final Logger LOG = Logger.getLogger(AdminResource.class);

    @Inject
    OpenSearchService openSearchService;

    @Inject
    AdminAccessService adminAccessService;

    /**
     * Erstellt den Index
     * POST /api/admin/index/create
     */
    @POST
    @Path("/index/create")
    @RolesAllowed("admin")
    public Response createIndex() {
        adminAccessService.requireAdmin();
        try {
            openSearchService.createIndex();
            return Response.ok("{\"message\": \"Index created successfully\"}").build();
        } catch (IOException e) {
            LOG.error("Error creating index", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity("{\"error\": \"" + e.getMessage() + "\"}")
                    .build();
        }
    }

    /**
     * Löscht den Index
     * DELETE /api/admin/index
     */
    @DELETE
    @Path("/index")
    @RolesAllowed("admin")
    public Response deleteIndex() {
        adminAccessService.requireAdmin();
        try {
            openSearchService.deleteIndex();
            return Response.ok("{\"message\": \"Index deleted successfully\"}").build();
        } catch (IOException e) {
            LOG.error("Error deleting index", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity("{\"error\": \"" + e.getMessage() + "\"}")
                    .build();
        }
    }

    /**
     * Kopiert die Produkte in den naechsten Versionsindex (products_vN). Loescht nichts.
     * POST /api/admin/index/reindex
     */
    @POST
    @Path("/index/reindex")
    @RolesAllowed("admin")
    public Response reindexProducts() {
        adminAccessService.requireAdmin();
        try {
            return Response.ok(openSearchService.reindexProducts()).build();
        } catch (IOException e) {
            LOG.error("Error reindexing products", e);
            throw new WebApplicationException("Reindex fehlgeschlagen: OpenSearch nicht erreichbar oder Fehler beim Kopieren.",
                    Response.Status.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Schaltet den Produkt-Alias atomar auf einen Versionsindex um. Loescht keinen Index.
     * Weichen die Dokumentzahlen von Quelle und Ziel ab, antwortet der Endpunkt mit 409, ausser mit force=true.
     * POST /api/admin/index/activate?index=products_vN[&amp;force=true]
     */
    @POST
    @Path("/index/activate")
    @RolesAllowed("admin")
    public Response activateIndex(@QueryParam("index") String index,
                                  @QueryParam("force") @DefaultValue("false") boolean force) {
        adminAccessService.requireAdmin();
        try {
            return Response.ok(openSearchService.activateIndex(index, force)).build();
        } catch (IOException e) {
            LOG.error("Error activating index " + index, e);
            throw new WebApplicationException("Alias-Umschaltung fehlgeschlagen: OpenSearch nicht erreichbar oder Fehler beim Schreiben der Aliase.",
                    Response.Status.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Health Check
     * GET /api/admin/health
     */
    @GET
    @Path("/health")
    @RolesAllowed("admin")
    public Response health() {
        return Response.ok("{\"status\": \"UP\"}").build();
    }
}
