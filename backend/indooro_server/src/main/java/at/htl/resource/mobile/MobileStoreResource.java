package at.htl.resource.mobile;

import at.htl.admin.dto.MobileDtos;
import at.htl.admin.service.MobileStoreService;
import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;

import java.util.List;
import java.util.UUID;
import org.eclipse.microprofile.openapi.annotations.Operation;
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
    public MobileDtos.StoreByBeaconResponse findStoreByBeacon(@QueryParam("uuid") String uuid,
                                                              @QueryParam("major") Integer major,
                                                              @QueryParam("minor") Integer minor) {
        return mobileStoreService.findStoreByBeacon(uuid, major, minor);
    }

    @Operation(operationId = "getMobileStoreLayout")
    @GET
    @Path("/{storeId}/layout/current")
    public MobileDtos.MobileLayoutResponse getCurrentLayout(@PathParam("storeId") UUID storeId) {
        return mobileStoreService.getCurrentLayout(storeId);
    }
}
