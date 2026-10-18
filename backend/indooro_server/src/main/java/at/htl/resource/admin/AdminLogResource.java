package at.htl.resource.admin;

import at.htl.admin.dto.AdminLogDtos;
import at.htl.admin.service.AuditLogService;
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

@Path("/api/admin/logs")
@RolesAllowed("admin")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "admin-logs")
public class AdminLogResource extends AdminApiSupport {

    @Inject
    AuditLogService auditLogService;

    @Operation(operationId = "listAuditLogs")
    @GET
    public AdminLogDtos.SystemLogResponse getRecentLogs(@QueryParam("limit") @DefaultValue("20") int limit) {
        return auditLogService.getRecentLogs(normalizeSize(limit));
    }
}
