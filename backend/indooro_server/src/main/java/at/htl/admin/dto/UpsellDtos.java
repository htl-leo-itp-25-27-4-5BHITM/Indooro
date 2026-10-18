package at.htl.admin.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class UpsellDtos {

    private UpsellDtos() {
    }

    public record UpsellSuggestionRequest(
            UUID storeId,
            @Size(max = 50) String storeCode,
            @NotNull Integer checkedProductId,
            @Size(max = 80) String shoppingListId,
            @Size(max = 200) List<Integer> currentListProductIds,
            @Size(max = 200) List<Integer> completedProductIds,
            @Size(max = 50) String source,
            UUID recipeId,
            @Size(max = 120) String sessionId
    ) {
    }

    public record UpsellProductSummary(
            Integer id,
            String name,
            Double price,
            String layoutCode,
            String storeId,
            String storeCode,
            String brand,
            String category,
            String imageUrl,
            boolean hasLayoutPosition
    ) {
    }

    public record UpsellSuggestion(
            UpsellProductSummary product,
            String reason,
            @DecimalMin("0.0") @DecimalMax("1.0") double confidence
    ) {
    }

    public record UpsellSuggestionResponse(
            Integer checkedProductId,
            List<UpsellSuggestion> suggestions,
            String source,
            Instant expiresAt
    ) {
    }

    public record UpsellPlanRequest(
            UUID storeId,
            @Size(max = 50) String storeCode,
            @Size(max = 80) String shoppingListId,
            @Size(max = 200) List<Integer> currentListProductIds,
            @Size(max = 200) List<Integer> completedProductIds,
            @Size(max = 50) String source,
            @Valid @Size(max = 30) List<UpsellOpportunityRequest> opportunities,
            @Size(max = 120) String sessionId
    ) {
    }

    public record UpsellOpportunityRequest(
            @NotBlank @Size(max = 100) String opportunityId,
            @Size(max = 20) List<Integer> triggerProductIds,
            @Size(max = 20) List<@Size(max = 120) String> triggerProductNames
    ) {
    }

    public record UpsellPlanResponse(
            List<UpsellOpportunityResponse> opportunities,
            String source,
            Instant expiresAt,
            UpsellPlanDebug debug
    ) {
    }

    public record UpsellOpportunityResponse(
            String opportunityId,
            List<Integer> triggerProductIds,
            List<UpsellSuggestion> suggestions
    ) {
    }

    public record UpsellPlanDebug(
            String requestId,
            String model,
            String responseSource,
            Long elapsedMs,
            Long openAiElapsedMs,
            Integer inputTokens,
            Integer outputTokens,
            Integer totalTokens,
            Integer cachedInputTokens,
            Integer reasoningTokens,
            String fallbackReason,
            Integer opportunityCount,
            Integer candidateCount,
            /** True when the caller may retry the same request later (for example a transient candidate lookup failure). */
            Boolean retryable
    ) {

        /** Constructor for callers that predate the retryable flag. */
        public UpsellPlanDebug(
                String requestId,
                String model,
                String responseSource,
                Long elapsedMs,
                Long openAiElapsedMs,
                Integer inputTokens,
                Integer outputTokens,
                Integer totalTokens,
                Integer cachedInputTokens,
                Integer reasoningTokens,
                String fallbackReason,
                Integer opportunityCount,
                Integer candidateCount
        ) {
            this(requestId, model, responseSource, elapsedMs, openAiElapsedMs, inputTokens, outputTokens,
                    totalTokens, cachedInputTokens, reasoningTokens, fallbackReason, opportunityCount,
                    candidateCount, null);
        }
    }

    public record UpsellEventRequest(
            @NotBlank @Size(max = 40) String eventType,
            Integer checkedProductId,
            Integer suggestedProductId,
            UUID storeId,
            @Size(max = 50) String storeCode,
            @Size(max = 120) String sessionId,
            @Size(max = 40) String source,
            @Size(max = 4_000) String metadataJson
    ) {
    }

    public record UpsellDismissRequest(
            @NotNull Integer checkedProductId,
            Integer suggestedProductId,
            UUID storeId,
            @Size(max = 50) String storeCode,
            @Size(max = 120) String sessionId,
            @Min(1) @Max(43200) Integer suppressMinutes
    ) {
    }

    public record AiSuggestion(
            @NotNull Integer productId,
            @Size(max = 180) String reason,
            @DecimalMin("0.0") @DecimalMax("1.0") Double confidence
    ) {
    }

    public record AiSuggestionResponse(
            List<AiSuggestion> suggestions
    ) {
    }

    public record AiOpportunitySuggestion(
            @NotBlank @Size(max = 100) String opportunityId,
            List<AiSuggestion> suggestions
    ) {
    }

    public record AiPlanResponse(
            List<AiOpportunitySuggestion> opportunities
    ) {
    }
}
