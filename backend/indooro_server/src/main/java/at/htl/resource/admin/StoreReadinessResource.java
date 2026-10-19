package at.htl.resource.admin;

import at.htl.admin.readiness.ReadinessDtos.ReadinessReport;
import at.htl.admin.readiness.StoreReadinessEvaluator;
import at.htl.admin.readiness.StoreReadinessService;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;

import java.util.UUID;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

@Path("/api/stores/{storeId}/readiness")
@RolesAllowed({"admin", "region-manager", "store-manager"})
@Produces(MediaType.APPLICATION_JSON)
@Tag(name = "store-readiness")
public class StoreReadinessResource {

    @Inject
    StoreReadinessService storeReadinessService;

    @Operation(operationId = "getStoreReadiness")
    @GET
    public ReadinessReport getReadiness(@PathParam("storeId") UUID storeId,
                                        @QueryParam("radius") Double radius) {
        // Without a radius the store's coverage profile decides (market: 8 m).
        if (radius != null && !(radius >= StoreReadinessEvaluator.MIN_RADIUS
                && radius <= StoreReadinessEvaluator.MAX_RADIUS)) {
            throw new BadRequestException("radius muss zwischen " + meters(StoreReadinessEvaluator.MIN_RADIUS)
                    + " und " + meters(StoreReadinessEvaluator.MAX_RADIUS) + " liegen.");
        }
        return storeReadinessService.evaluate(storeId, radius);
    }

    /** Renders whole numbers without a decimal point, so 30.0 reads as "30" (unchanged message text). */
    private static String meters(double value) {
        return value == Math.rint(value) ? String.valueOf((long) value) : String.valueOf(value);
    }
}
