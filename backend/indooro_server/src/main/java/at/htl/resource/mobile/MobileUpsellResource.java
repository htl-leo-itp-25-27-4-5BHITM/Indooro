package at.htl.resource.mobile;

import at.htl.admin.dto.UpsellDtos;
import at.htl.admin.service.UpsellSuggestionService;
import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

@PermitAll
@Path("/api/mobile/upsell")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "mobile-upsell")
public class MobileUpsellResource {

    @Inject
    UpsellSuggestionService upsellSuggestionService;

    @Operation(operationId = "postUpsellSuggestions", deprecated = true)
    @POST
    @Path("/suggestions")
    public UpsellDtos.UpsellSuggestionResponse suggestions(@Valid UpsellDtos.UpsellSuggestionRequest request) {
        return upsellSuggestionService.suggestions(request);
    }

    @Operation(operationId = "postUpsellPlan")
    @POST
    @Path("/plan")
    public UpsellDtos.UpsellPlanResponse plan(@Valid UpsellDtos.UpsellPlanRequest request) {
        return upsellSuggestionService.plan(request);
    }

    @Operation(operationId = "postUpsellEvent")
    @POST
    @Path("/events")
    public Response recordEvent(@Valid UpsellDtos.UpsellEventRequest request) {
        upsellSuggestionService.recordEvent(request);
        return Response.accepted().build();
    }

    @Operation(operationId = "postUpsellDismiss")
    @POST
    @Path("/dismiss")
    public Response dismiss(@Valid UpsellDtos.UpsellDismissRequest request) {
        upsellSuggestionService.dismiss(request);
        return Response.accepted().build();
    }
}
