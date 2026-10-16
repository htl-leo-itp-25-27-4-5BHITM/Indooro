package at.htl.admin.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class RecipeDtos {

    private RecipeDtos() {
    }

    public record RecipeTagResponse(
            UUID id,
            String code,
            String name,
            String kind,
            String status
    ) {
    }

    public record RecipeStepResponse(
            UUID id,
            int position,
            String instruction,
            Integer durationMinutes
    ) {
    }

    public record RecipeIngredientResponse(
            UUID id,
            int position,
            String displayName,
            String canonicalName,
            BigDecimal quantity,
            String quantityText,
            String unitCode,
            String unitDisplayName,
            String preparationNote,
            boolean optional
    ) {
    }

    public record RecipeSummaryResponse(
            UUID id,
            String slug,
            String title,
            String summary,
            String imageUrl,
            int servings,
            Integer prepTimeMinutes,
            Integer cookTimeMinutes,
            Integer totalTimeMinutes,
            int stepCount,
            String status,
            Instant publishedAt,
            int mappedIngredientCount,
            int totalIngredientCount,
            List<RecipeTagResponse> tags
    ) {
        public RecipeSummaryResponse(UUID id,
                                     String slug,
                                     String title,
                                     String summary,
                                     String imageUrl,
                                     int servings,
                                     Integer prepTimeMinutes,
                                     Integer cookTimeMinutes,
                                     Integer totalTimeMinutes,
                                     String status,
                                     Instant publishedAt,
                                     int mappedIngredientCount,
                                     int totalIngredientCount,
                                     List<RecipeTagResponse> tags) {
            this(id, slug, title, summary, imageUrl, servings, prepTimeMinutes, cookTimeMinutes,
                    totalTimeMinutes, 0, status, publishedAt, mappedIngredientCount, totalIngredientCount, tags);
        }
    }

    public record RecipeDetailResponse(
            UUID id,
            String slug,
            String title,
            String summary,
            String description,
            String imageUrl,
            String imageAlt,
            int servings,
            Integer prepTimeMinutes,
            Integer cookTimeMinutes,
            Integer totalTimeMinutes,
            String status,
            Instant publishedAt,
            Instant archivedAt,
            Instant createdAt,
            Instant updatedAt,
            List<RecipeTagResponse> tags,
            List<RecipeIngredientResponse> ingredients,
            List<RecipeStepResponse> steps
    ) {
    }

    public record RecipeUpsertRequest(
            @NotBlank @Size(max = 140) String slug,
            @NotBlank @Size(max = 180) String title,
            @Size(max = 4_000) String summary,
            @Size(max = 12_000) String description,
            String imageUrl,
            @Size(max = 240) String imageAlt,
            @NotNull @Min(1) Integer servings,
            @Min(0) Integer prepTimeMinutes,
            @Min(0) Integer cookTimeMinutes,
            @Min(0) Integer totalTimeMinutes,
            String status,
            List<UUID> tagIds
    ) {
    }

    public record RecipeIngredientRequest(
            @NotNull @Min(1) Integer position,
            @NotBlank @Size(max = 180) String displayName,
            @Size(max = 180) String canonicalName,
            @DecimalMin("0.0") BigDecimal quantity,
            @Size(max = 80) String quantityText,
            @Size(max = 20) String unitCode,
            @Size(max = 2_000) String preparationNote,
            Boolean optional
    ) {
    }

    public record RecipeStepRequest(
            @NotNull @Min(1) Integer position,
            @NotBlank @Size(max = 12_000) String instruction,
            @Min(0) Integer durationMinutes
    ) {
    }

    public record RecipeTagRequest(
            @NotBlank @Size(max = 80) String code,
            @NotBlank @Size(max = 120) String name,
            @Size(max = 40) String kind,
            String status
    ) {
    }

    public record RecipeCreateRequest(
            @Valid @NotNull RecipeUpsertRequest recipe,
            @Valid List<RecipeIngredientRequest> ingredients,
            @Valid List<RecipeStepRequest> steps
    ) {
    }

    public record MappedRecipeProduct(
            Integer id,
            String name,
            Double price,
            String layoutCode,
            String storeId,
            String storeCode
    ) {
    }

    public record IngredientMappingStatusResponse(
            UUID ingredientId,
            String ingredientName,
            String status,
            MappedRecipeProduct product,
            List<MappedRecipeProduct> candidates,
            BigDecimal confidence,
            boolean manuallyConfirmed,
            String reason
    ) {
    }

    public record RecipeProductMappingResponse(
            UUID recipeId,
            UUID storeId,
            String storeCode,
            List<IngredientMappingStatusResponse> ingredients
    ) {
    }

    public record ProductMappingRequest(
            @NotNull Integer productId,
            String productName,
            String layoutCode,
            UUID storeId,
            @Size(max = 50) String storeCode,
            String mappingType,
            @DecimalMin("0.0") @DecimalMax("1.0") BigDecimal confidence,
            Boolean manuallyConfirmed
    ) {
    }
}
