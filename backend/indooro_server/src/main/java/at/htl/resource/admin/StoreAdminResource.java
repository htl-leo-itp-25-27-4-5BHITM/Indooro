package at.htl.resource.admin;

import at.htl.admin.dto.CommonDtos;
import at.htl.admin.dto.StoreDtos;
import at.htl.admin.service.StoreAdminService;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;

import java.util.UUID;

@Path("/api/stores")
@RolesAllowed({"admin", "region-manager", "store-manager"})
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class StoreAdminResource extends AdminApiSupport {

    @Inject
    StoreAdminService storeAdminService;

    @GET
    public CommonDtos.PageResponse<StoreDtos.StoreSummaryResponse> listStores(@QueryParam("query") String query,
                                                                              @QueryParam("regionId") UUID regionId,
                                                                              @QueryParam("status") String status,
                                                                              @QueryParam("hasActiveLayout") Boolean hasActiveLayout,
                                                                              @QueryParam("sort") String sort,
                                                                              @QueryParam("page") @DefaultValue("0") int page,
                                                                              @QueryParam("size") @DefaultValue("20") int size) {
        return storeAdminService.listStores(
                query,
                regionId,
                parseStatus(status),
                hasActiveLayout,
                sort,
                normalizePage(page),
                normalizeSize(size)
        );
    }

    @POST
    public StoreDtos.StoreDetailResponse createStore(@Valid StoreDtos.StoreUpsertRequest request) {
        return storeAdminService.createStore(request);
    }

    @GET
    @Path("/{storeId}")
    public StoreDtos.StoreDetailResponse getStore(@PathParam("storeId") UUID storeId) {
        return storeAdminService.getStore(storeId);
    }

    @PUT
    @Path("/{storeId}")
    public StoreDtos.StoreDetailResponse updateStore(@PathParam("storeId") UUID storeId,
                                                     @Valid StoreDtos.StoreUpsertRequest request) {
        return storeAdminService.updateStore(storeId, request);
    }

    @PATCH
    @Path("/{storeId}/archive")
    public StoreDtos.StoreDetailResponse archiveStore(@PathParam("storeId") UUID storeId) {
        return storeAdminService.archiveStore(storeId);
    }

    @GET
    @Path("/{storeId}/audit")
    public StoreDtos.StoreAuditResponse getStoreAudit(@PathParam("storeId") UUID storeId) {
        return new StoreDtos.StoreAuditResponse(storeId, storeAdminService.getStoreAudit(storeId));
    }

    @GET
    @Path("/{storeId}/beacons")
    public Object getStoreBeacons(@PathParam("storeId") UUID storeId) {
        return storeAdminService.getStoreBeacons(storeId);
    }
}
