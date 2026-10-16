package at.htl.resource.admin;

import at.htl.admin.dto.CommonDtos;
import at.htl.admin.dto.RecipeDtos;
import at.htl.admin.entity.RecordStatus;
import at.htl.admin.entity.recipe.RecipeStatus;
import at.htl.admin.service.RecipeService;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Path("/api/admin/recipes")
@RolesAllowed("admin")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class AdminRecipeResource extends AdminApiSupport {

    @Inject
    RecipeService recipeService;

    @GET
    public CommonDtos.PageResponse<RecipeDtos.RecipeSummaryResponse> listRecipes(@QueryParam("q") String query,
                                                                                 @QueryParam("tag") String tag,
                                                                                 @QueryParam("status") String status,
                                                                                 @QueryParam("sort") String sort,
                                                                                 @QueryParam("page") @DefaultValue("0") int page,
                                                                                 @QueryParam("size") @DefaultValue("20") int size) {
        String normalizedSort = sort == null || sort.isBlank() ? null : sort;
        if (normalizedSort != null && !List.of("title", "status", "publishedAt").contains(normalizedSort)) {
            throw new BadRequestException("sort muss title, status oder publishedAt sein.");
        }
        return recipeService.listAdminRecipes(query, tag, parseRecipeStatus(status), normalizePage(page), normalizeSize(size), normalizedSort);
    }

    @POST
    public RecipeDtos.RecipeDetailResponse createRecipe(@Valid RecipeDtos.RecipeCreateRequest request) {
        return recipeService.createRecipe(request);
    }

    @GET
    @Path("/{recipeId}")
    public RecipeDtos.RecipeDetailResponse getRecipe(@PathParam("recipeId") UUID recipeId) {
        return recipeService.getAdminRecipe(recipeId);
    }

    @PUT
    @Path("/{recipeId}")
    public RecipeDtos.RecipeDetailResponse updateRecipe(@PathParam("recipeId") UUID recipeId,
                                                        @Valid RecipeDtos.RecipeUpsertRequest request) {
        return recipeService.updateRecipe(recipeId, request);
    }

    @PATCH
    @Path("/{recipeId}/publish")
    public RecipeDtos.RecipeDetailResponse publishRecipe(@PathParam("recipeId") UUID recipeId) {
        return recipeService.publishRecipe(recipeId);
    }

    @PATCH
    @Path("/{recipeId}/deactivate")
    public RecipeDtos.RecipeDetailResponse deactivateRecipe(@PathParam("recipeId") UUID recipeId) {
        return recipeService.deactivateRecipe(recipeId);
    }

    @PATCH
    @Path("/{recipeId}/archive")
    public RecipeDtos.RecipeDetailResponse archiveRecipe(@PathParam("recipeId") UUID recipeId) {
        return recipeService.archiveRecipe(recipeId);
    }

    @POST
    @Path("/{recipeId}/ingredients")
    public RecipeDtos.RecipeIngredientResponse addIngredient(@PathParam("recipeId") UUID recipeId,
                                                             @Valid RecipeDtos.RecipeIngredientRequest request) {
        return recipeService.addIngredient(recipeId, request);
    }

    @PUT
    @Path("/{recipeId}/ingredients/{ingredientId}")
    public RecipeDtos.RecipeIngredientResponse updateIngredient(@PathParam("recipeId") UUID recipeId,
                                                                @PathParam("ingredientId") UUID ingredientId,
                                                                @Valid RecipeDtos.RecipeIngredientRequest request) {
        return recipeService.updateIngredient(recipeId, ingredientId, request);
    }

    @DELETE
    @Path("/{recipeId}/ingredients/{ingredientId}")
    public Response deleteIngredient(@PathParam("recipeId") UUID recipeId,
                                     @PathParam("ingredientId") UUID ingredientId) {
        recipeService.deleteIngredient(recipeId, ingredientId);
        return Response.noContent().build();
    }

    @POST
    @Path("/{recipeId}/steps")
    public RecipeDtos.RecipeStepResponse addStep(@PathParam("recipeId") UUID recipeId,
                                                 @Valid RecipeDtos.RecipeStepRequest request) {
        return recipeService.addStep(recipeId, request);
    }

    @PUT
    @Path("/{recipeId}/steps/{stepId}")
    public RecipeDtos.RecipeStepResponse updateStep(@PathParam("recipeId") UUID recipeId,
                                                    @PathParam("stepId") UUID stepId,
                                                    @Valid RecipeDtos.RecipeStepRequest request) {
        return recipeService.updateStep(recipeId, stepId, request);
    }

    @DELETE
    @Path("/{recipeId}/steps/{stepId}")
    public Response deleteStep(@PathParam("recipeId") UUID recipeId,
                               @PathParam("stepId") UUID stepId) {
        recipeService.deleteStep(recipeId, stepId);
        return Response.noContent().build();
    }

    @GET
    @Path("/{recipeId}/mapping-status")
    public RecipeDtos.RecipeProductMappingResponse mappingStatus(@PathParam("recipeId") UUID recipeId,
                                                                 @QueryParam("storeId") UUID storeId,
                                                                 @QueryParam("storeCode") String storeCode) {
        return recipeService.mappingStatus(recipeId, storeId, storeCode, false);
    }

    @GET
    @Path("/{recipeId}/ingredients/{ingredientId}/mapping-suggestions")
    public List<RecipeDtos.MappedRecipeProduct> mappingSuggestions(@PathParam("recipeId") UUID recipeId,
                                                                   @PathParam("ingredientId") UUID ingredientId,
                                                                   @QueryParam("storeId") UUID storeId,
                                                                   @QueryParam("q") String query,
                                                                   @QueryParam("size") @DefaultValue("10") int size) {
        return recipeService.mappingSuggestions(recipeId, ingredientId, storeId, query, Math.min(Math.max(size, 1), 25));
    }

    @PUT
    @Path("/{recipeId}/ingredients/{ingredientId}/product-mapping")
    public RecipeDtos.IngredientMappingStatusResponse confirmMapping(@PathParam("recipeId") UUID recipeId,
                                                                     @PathParam("ingredientId") UUID ingredientId,
                                                                     @Valid RecipeDtos.ProductMappingRequest request) {
        return recipeService.confirmMapping(recipeId, ingredientId, request);
    }

    @DELETE
    @Path("/{recipeId}/ingredients/{ingredientId}/product-mapping/{mappingId}")
    public Response archiveMapping(@PathParam("recipeId") UUID recipeId,
                                   @PathParam("ingredientId") UUID ingredientId,
                                   @PathParam("mappingId") UUID mappingId) {
        recipeService.archiveMapping(recipeId, ingredientId, mappingId);
        return Response.noContent().build();
    }

    private RecipeStatus parseRecipeStatus(String rawStatus) {
        if (rawStatus == null || rawStatus.isBlank()) {
            return null;
        }
        try {
            return RecipeStatus.valueOf(rawStatus.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new WebApplicationException("Ungueltiger Rezeptstatus.", Response.Status.BAD_REQUEST);
        }
    }

    @Override
    protected int normalizeSize(int size) {
        return Math.min(Math.max(size, 1), 100);
    }
}
