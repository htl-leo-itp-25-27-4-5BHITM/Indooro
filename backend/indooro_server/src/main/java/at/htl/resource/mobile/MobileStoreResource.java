package at.htl.resource.mobile;

import at.htl.admin.dto.MobileDtos;
import at.htl.admin.service.MobileStoreService;
import at.htl.service.LayoutEtag;
import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.CacheControl;
import jakarta.ws.rs.core.EntityTag;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.List;
import java.util.UUID;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.enums.ParameterIn;
import org.eclipse.microprofile.openapi.annotations.enums.SchemaType;
import org.eclipse.microprofile.openapi.annotations.headers.Header;
import org.eclipse.microprofile.openapi.annotations.media.Content;
import org.eclipse.microprofile.openapi.annotations.media.Schema;
import org.eclipse.microprofile.openapi.annotations.parameters.Parameter;
import org.eclipse.microprofile.openapi.annotations.responses.APIResponse;
import org.eclipse.microprofile.openapi.annotations.responses.APIResponses;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

@PermitAll
@Path("/api/mobile/stores")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "mobile-stores")
public class MobileStoreResource {

    @Inject
    MobileStoreService mobileStoreService;

    @Operation(operationId = "listMobileStores")
    @GET
    public List<MobileDtos.MobileStoreSummary> listStores() {
        return mobileStoreService.listStores();
    }

    @Operation(operationId = "listMobileBeaconIdentities")
    @GET
    @Path("/beacon-identities")
    public MobileDtos.BeaconIdentitiesResponse listBeaconIdentities() {
        return mobileStoreService.listBeaconIdentities();
    }

    @Operation(operationId = "findMobileStoreByBeacon")
    @GET
    @Path("/by-beacon")
    public MobileDtos.StoreByBeaconResponse findStoreByBeacon(@Parameter(required = true) @QueryParam("uuid") String uuid,
                                                              @QueryParam("major") Integer major,
                                                              @QueryParam("minor") Integer minor) {
        return mobileStoreService.findStoreByBeacon(uuid, major, minor);
    }

    /** Liefert 304 ohne Body, wenn {@code If-None-Match} den aktuellen ETag enthaelt. Die Filiale wird vorher geprueft. */
    @Operation(operationId = "getMobileStoreLayout")
    @APIResponses({
            @APIResponse(
                    responseCode = "200",
                    description = "Layout with source information.",
                    headers = {
                            @Header(name = "ETag", description = "Strong entity tag: SHA-256 of layoutId and activatedAt, or of the bundled default layout for a store without an active version.",
                                    schema = @Schema(type = SchemaType.STRING)),
                            @Header(name = "Cache-Control", description = "Always no-cache; clients revalidate with If-None-Match.",
                                    schema = @Schema(type = SchemaType.STRING))
                    },
                    content = @Content(schema = @Schema(implementation = MobileDtos.MobileLayoutResponse.class))),
            @APIResponse(
                    responseCode = "304",
                    description = "Not modified: the layout in If-None-Match is still current. No body.",
                    headers = {
                            @Header(name = "ETag", schema = @Schema(type = SchemaType.STRING)),
                            @Header(name = "Cache-Control", schema = @Schema(type = SchemaType.STRING))
                    }),
            @APIResponse(responseCode = "404", description = "Store not found or not active.")
    })
    @GET
    @Path("/{storeId}/layout/current")
    public Response getCurrentLayout(
            @PathParam("storeId") UUID storeId,
            @Parameter(name = HttpHeaders.IF_NONE_MATCH, in = ParameterIn.HEADER, required = false,
                    description = "ETag from an earlier response; quoted, weak (W/) or a comma-separated list. * matches any current layout.",
                    schema = @Schema(type = SchemaType.STRING))
            @HeaderParam(HttpHeaders.IF_NONE_MATCH) String ifNoneMatch) {
        MobileStoreService.LayoutWithEtag current = mobileStoreService.getCurrentLayoutWithEtag(storeId);
        EntityTag tag = new EntityTag(current.etag());
        CacheControl revalidate = new CacheControl();
        revalidate.setNoCache(true);

        if (LayoutEtag.matches(ifNoneMatch, current.etag())) {
            return Response.notModified(tag).cacheControl(revalidate).build();
        }
        return Response.ok(current.layout()).tag(tag).cacheControl(revalidate).build();
    }
}
