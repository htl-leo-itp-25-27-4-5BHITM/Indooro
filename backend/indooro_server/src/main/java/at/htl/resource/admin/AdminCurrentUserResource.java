package at.htl.resource.admin;

import at.htl.admin.dto.AdminUserDtos;
import at.htl.admin.service.AdminAccessService;
import io.quarkus.security.Authenticated;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

@Path("/api/admin/me")
@RolesAllowed({"admin", "region-manager", "store-manager"})
@Produces(MediaType.APPLICATION_JSON)
@Tag(name = "admin-session")
public class AdminCurrentUserResource {

    @Inject
    AdminAccessService adminAccessService;

    @Operation(operationId = "getCurrentAdminUser")
    @GET
    public AdminUserDtos.CurrentUserResponse me() {
        return adminAccessService.currentUserResponse();
    }

    /** Any signed-in user, also without a role or access assignment: the own Keycloak subject to hand to an admin. */
    @Operation(operationId = "getCurrentAdminIdentity")
    @GET
    @Path("/identity")
    @Authenticated
    public AdminUserDtos.CurrentIdentityResponse identity() {
        return adminAccessService.currentIdentity();
    }
}
