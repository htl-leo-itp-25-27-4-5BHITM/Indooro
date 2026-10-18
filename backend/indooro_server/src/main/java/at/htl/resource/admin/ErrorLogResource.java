package at.htl.resource.admin;

import at.htl.admin.dto.ErrorLogDtos;
import at.htl.admin.service.ErrorLogService;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

@Path("/api/admin/error-logs")
@RolesAllowed("admin")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "admin-logs")
public class ErrorLogResource extends AdminApiSupport {

    @Inject
    ErrorLogService errorLogService;

    @Operation(operationId = "listErrorLogs")
    @GET
    public ErrorLogDtos.ErrorLogResponse getRecentErrorLogs(@QueryParam("limit") @DefaultValue("50") int limit) {
        return errorLogService.getRecentLogs(limit);
    }
}
