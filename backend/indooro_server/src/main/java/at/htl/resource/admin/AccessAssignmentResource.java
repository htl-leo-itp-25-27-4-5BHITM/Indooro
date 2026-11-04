package at.htl.resource.admin;

import at.htl.admin.dto.AccessAssignmentDtos;
import at.htl.admin.entity.UserAccessStatus;
import at.htl.admin.service.AccessAssignmentService;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

import java.util.List;
import java.util.UUID;

/** Admin-UI access assignments ("Zugänge"). Only the role admin. */
@Path("/api/admin/access-assignments")
@RolesAllowed("admin")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "admin-access")
public class AccessAssignmentResource {

    @Inject
    AccessAssignmentService accessAssignmentService;

    @Operation(operationId = "listAccessAssignments")
    @GET
    public List<AccessAssignmentDtos.AccessAssignmentResponse> listAssignments(@QueryParam("status") String status) {
        return accessAssignmentService.listAssignments(parseStatus(status));
    }

    @Operation(operationId = "createAccessAssignment")
    @POST
    public AccessAssignmentDtos.AccessAssignmentResponse createAssignment(
            @Valid @NotNull AccessAssignmentDtos.AccessAssignmentCreateRequest request) {
        return accessAssignmentService.createAssignment(request);
    }

    @Operation(operationId = "deactivateAccessAssignment")
    @PATCH
    @Path("/{assignmentId}/deactivate")
    public AccessAssignmentDtos.AccessAssignmentResponse deactivateAssignment(@PathParam("assignmentId") UUID assignmentId) {
        return accessAssignmentService.deactivateAssignment(assignmentId);
    }

    static UserAccessStatus parseStatus(String rawStatus) {
        if (rawStatus == null || rawStatus.isBlank()) {
            return null;
        }
        try {
            return UserAccessStatus.valueOf(rawStatus.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new WebApplicationException(
                    "Ungueltiger Status. Erlaubt sind ACTIVE oder DISABLED.",
                    Response.Status.BAD_REQUEST
            );
        }
    }
}
