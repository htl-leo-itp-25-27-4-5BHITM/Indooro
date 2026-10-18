package at.htl.resource.admin;

import at.htl.admin.dto.LayoutDtos;
import at.htl.admin.service.StoreLayoutAdminService;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

import java.util.List;
import java.util.UUID;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

@Path("/api/stores/{storeId}/layout")
@RolesAllowed({"admin", "region-manager", "store-manager"})
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "store-layouts")
public class StoreLayoutAdminResource {

    @Inject
    StoreLayoutAdminService storeLayoutAdminService;

    @Operation(operationId = "getStoreCurrentLayout")
    @GET
    @Path("/current")
    public LayoutDtos.StoreLayoutResponse getCurrentLayout(@PathParam("storeId") UUID storeId) {
        return storeLayoutAdminService.getCurrentLayout(storeId);
    }

    @Operation(operationId = "listStoreLayoutVersions")
    @GET
    @Path("/versions")
    public List<LayoutDtos.LayoutVersionSummary> listLayoutVersions(@PathParam("storeId") UUID storeId) {
        return storeLayoutAdminService.listLayoutVersions(storeId);
    }

    @Operation(operationId = "getStoreLayoutVersion")
    @GET
    @Path("/versions/{layoutId}")
    public LayoutDtos.StoreLayoutResponse getLayoutVersion(@PathParam("storeId") UUID storeId,
                                                           @PathParam("layoutId") UUID layoutId) {
        return storeLayoutAdminService.getLayoutVersion(storeId, layoutId);
    }

    @Operation(operationId = "saveStoreLayoutVersion")
    @POST
    @Path("/versions")
    public LayoutDtos.StoreLayoutResponse saveLayoutVersion(@PathParam("storeId") UUID storeId,
                                                            @Valid LayoutDtos.LayoutSaveRequest request) {
        return storeLayoutAdminService.saveLayoutVersion(storeId, request);
    }

    @Operation(operationId = "activateStoreLayoutVersion")
    @POST
    @Path("/versions/{layoutId}/activate")
    public LayoutDtos.StoreLayoutResponse activateLayoutVersion(@PathParam("storeId") UUID storeId,
                                                                @PathParam("layoutId") UUID layoutId) {
        return storeLayoutAdminService.activateLayoutVersion(storeId, layoutId);
    }

    @Operation(operationId = "getStoreEditorContext")
    @GET
    @Path("/editor-context")
    public LayoutDtos.EditorContextResponse getEditorContext(@PathParam("storeId") UUID storeId) {
        return storeLayoutAdminService.getEditorContext(storeId);
    }
}
