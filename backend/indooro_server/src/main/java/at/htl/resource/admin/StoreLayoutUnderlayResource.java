package at.htl.resource.admin;

import at.htl.admin.dto.LayoutUnderlayDtos;
import at.htl.admin.service.LayoutUnderlayService;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.CacheControl;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.UUID;

@Path("/api/stores/{storeId}/layout/underlay")
@RolesAllowed({"admin", "region-manager", "store-manager"})
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class StoreLayoutUnderlayResource {
    @Inject LayoutUnderlayService underlays;

    @GET
    public Response get(@PathParam("storeId") UUID storeId) {
        return privateResponse(underlays.get(storeId));
    }

    @PUT
    public Response put(@PathParam("storeId") UUID storeId, LayoutUnderlayDtos.SaveRequest request) {
        return privateResponse(underlays.save(storeId, request));
    }

    @DELETE
    public Response delete(@PathParam("storeId") UUID storeId) {
        underlays.delete(storeId);
        return Response.noContent().build();
    }

    private static Response privateResponse(LayoutUnderlayDtos.Response value) {
        CacheControl cache = new CacheControl();
        cache.setNoStore(true);
        return Response.ok(value).cacheControl(cache).build();
    }
}
