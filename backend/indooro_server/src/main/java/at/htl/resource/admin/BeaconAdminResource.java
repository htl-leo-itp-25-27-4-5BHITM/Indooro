package at.htl.resource.admin;

import at.htl.admin.dto.BeaconDtos;
import at.htl.admin.service.BeaconAdminService;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;

import java.util.Map;
import java.util.UUID;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

@Path("/api/beacons")
@RolesAllowed({"admin", "region-manager", "store-manager"})
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "beacons")
public class BeaconAdminResource extends AdminApiSupport {

    @Inject
    BeaconAdminService beaconAdminService;

    @Operation(operationId = "listBeacons")
    @GET
    public Object listBeacons(@QueryParam("status") String status,
                              @QueryParam("assigned") Boolean assigned,
                              @QueryParam("storeId") UUID storeId,
                              @QueryParam("query") String query) {
        return beaconAdminService.listBeacons(parseStatus(status), assigned, storeId, query);
    }

    @Operation(operationId = "listFreeBeacons")
    @GET
    @Path("/free")
    public Object listFreeBeacons() {
        return beaconAdminService.listFreeBeacons();
    }

    @Operation(operationId = "createBeacon")
    @POST
    public BeaconDtos.BeaconResponse createBeacon(@Valid BeaconDtos.BeaconCreateRequest request) {
        return beaconAdminService.createBeacon(request);
    }

    @Operation(operationId = "bulkCreateBeacons")
    @POST
    @Path("/bulk")
    public BeaconDtos.BeaconBulkCreateResponse bulkCreate(@Valid BeaconDtos.BeaconBulkCreateRequest request) {
        return beaconAdminService.bulkCreate(request);
    }

    @Operation(operationId = "getBeacon")
    @GET
    @Path("/{beaconId}")
    public BeaconDtos.BeaconResponse getBeacon(@PathParam("beaconId") UUID beaconId) {
        return beaconAdminService.getBeacon(beaconId);
    }

    @Operation(operationId = "updateBeacon")
    @PUT
    @Path("/{beaconId}")
    public BeaconDtos.BeaconResponse updateBeacon(@PathParam("beaconId") UUID beaconId,
                                                  @Valid BeaconDtos.BeaconCreateRequest request) {
        return beaconAdminService.updateBeacon(beaconId, request);
    }

    @Operation(operationId = "archiveBeacon")
    @PATCH
    @Path("/{beaconId}/archive")
    public BeaconDtos.BeaconResponse archiveBeacon(@PathParam("beaconId") UUID beaconId) {
        return beaconAdminService.archiveBeacon(beaconId);
    }

    @Operation(operationId = "assignBeacon")
    @POST
    @Path("/{beaconId}/assign")
    public BeaconDtos.BeaconAssignmentResponse assignBeacon(@PathParam("beaconId") UUID beaconId,
                                                            @Valid BeaconDtos.BeaconAssignmentRequest request) {
        return beaconAdminService.assignBeacon(beaconId, request.storeId());
    }

    @Operation(operationId = "releaseBeacon")
    @POST
    @Path("/{beaconId}/release")
    public Map<String, Object> releaseBeacon(@PathParam("beaconId") UUID beaconId) {
        return beaconAdminService.releaseBeacon(beaconId);
    }
}
