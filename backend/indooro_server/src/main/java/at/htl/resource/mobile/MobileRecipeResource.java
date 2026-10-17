package at.htl.resource.mobile;

import at.htl.admin.dto.CommonDtos;
import at.htl.admin.dto.RecipeDtos;
import at.htl.admin.service.RecipeService;
import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.UUID;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

@PermitAll
@Path("/api/mobile/recipes")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "mobile-recipes")
public class MobileRecipeResource {

    @Inject
    RecipeService recipeService;

    @Operation(operationId = "listMobileRecipes")
    @GET
    public CommonDtos.PageResponse<RecipeDtos.RecipeSummaryResponse> listRecipes(@QueryParam("tag") String tag,
                                                                                 @QueryParam("storeId") UUID storeId,
                                                                                 @QueryParam("page") @DefaultValue("0") int page,
                                                                                 @QueryParam("size") @DefaultValue("20") int size) {
        return recipeService.listMobileRecipes(null, tag, normalizePage(page), normalizeSize(size), storeId);
    }

    @Operation(operationId = "searchMobileRecipes")
    @GET
    @Path("/search")
    public CommonDtos.PageResponse<RecipeDtos.RecipeSummaryResponse> searchRecipes(@QueryParam("q") String query,
                                                                                   @QueryParam("tag") String tag,
                                                                                   @QueryParam("storeId") UUID storeId,
                                                                                   @QueryParam("page") @DefaultValue("0") int page,
                                                                                   @QueryParam("size") @DefaultValue("20") int size) {
        if (query == null || query.trim().length() < 2) {
            throw new WebApplicationException("Query parameter 'q' ist erforderlich.", Response.Status.BAD_REQUEST);
        }
        return recipeService.listMobileRecipes(query, tag, normalizePage(page), normalizeSize(size), storeId);
    }

    @Operation(operationId = "getMobileRecipe")
    @GET
    @Path("/{recipeId}")
    public RecipeDtos.RecipeDetailResponse getRecipe(@PathParam("recipeId") UUID recipeId) {
        return recipeService.getMobileRecipe(recipeId);
    }

    @Operation(operationId = "getMobileRecipeProductMapping")
    @GET
    @Path("/{recipeId}/product-mapping")
    public RecipeDtos.RecipeProductMappingResponse getProductMapping(@PathParam("recipeId") UUID recipeId,
                                                                     @QueryParam("storeId") UUID storeId,
                                                                     @QueryParam("storeCode") String storeCode) {
        return recipeService.mappingStatus(recipeId, storeId, storeCode, true);
    }

    private int normalizePage(int page) {
        return Math.max(page, 0);
    }

    private int normalizeSize(int size) {
        return Math.min(Math.max(size, 1), 50);
    }
}
