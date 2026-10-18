package at.htl.resource.admin;

import at.htl.admin.dto.RecipeDtos;
import at.htl.admin.entity.RecordStatus;
import at.htl.admin.service.RecipeService;
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

import java.util.List;
import java.util.UUID;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

@Path("/api/admin/recipe-tags")
@RolesAllowed("admin")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "admin-recipe-tags")
public class AdminRecipeTagResource extends AdminApiSupport {

    @Inject
    RecipeService recipeService;

    @Operation(operationId = "listRecipeTags")
    @GET
    public List<RecipeDtos.RecipeTagResponse> listTags(@QueryParam("status") String status,
                                                       @QueryParam("q") String query) {
        RecordStatus parsedStatus = parseStatus(status);
        return recipeService.listTags(parsedStatus, query);
    }

    @Operation(operationId = "createRecipeTag")
    @POST
    public RecipeDtos.RecipeTagResponse createTag(@Valid RecipeDtos.RecipeTagRequest request) {
        return recipeService.createTag(request);
    }

    @Operation(operationId = "updateRecipeTag")
    @PUT
    @Path("/{tagId}")
    public RecipeDtos.RecipeTagResponse updateTag(@PathParam("tagId") UUID tagId,
                                                  @Valid RecipeDtos.RecipeTagRequest request) {
        return recipeService.updateTag(tagId, request);
    }

    @Operation(operationId = "archiveRecipeTag")
    @PATCH
    @Path("/{tagId}/archive")
    public RecipeDtos.RecipeTagResponse archiveTag(@PathParam("tagId") UUID tagId) {
        return recipeService.archiveTag(tagId);
    }
}
