package at.htl.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class StoreDtos {

    private StoreDtos() {
    }

    public record StoreUpsertRequest(
            @NotNull UUID regionId,
            @NotBlank @Size(max = 50) String storeCode,
            @NotBlank @Size(max = 150) String name,
            @NotBlank @Size(max = 150) String street,
            @NotBlank @Size(max = 20) String zipCode,
            @NotBlank @Size(max = 100) String city,
            @NotBlank @Size(max = 100) String country,
            @DecimalMin("-90.0") @DecimalMax("90.0") Double latitude,
            @DecimalMin("-180.0") @DecimalMax("180.0") Double longitude,
            @Size(max = 2_000) String notes,
            @Pattern(regexp = "[a-z][a-z0-9-]{0,19}") String readinessProfile
    ) {
    }

    public record StoreRegionSummary(
            UUID id,
            String code,
            String name
    ) {
    }

    public record ActiveLayoutSummary(
            UUID id,
            Integer versionNo,
            Instant createdAt
    ) {
    }

    public record StoreSummaryResponse(
            UUID id,
            String storeCode,
            String name,
            String city,
            Double latitude,
            Double longitude,
            String status,
            StoreRegionSummary region,
            long activeBeaconCount,
            boolean hasActiveLayout
    ) {
    }

    public record StoreDetailResponse(
            UUID id,
            String storeCode,
            String name,
            String street,
            String zipCode,
            String city,
            String country,
            Double latitude,
            Double longitude,
            String notes,
            String status,
            Instant archivedAt,
            StoreRegionSummary region,
            ActiveLayoutSummary activeLayout,
            Instant createdAt,
            Instant updatedAt,
            String readinessProfile
    ) {
    }

    public record AuditLogResponse(
            UUID id,
            String entityType,
            String action,
            String summary,
            String actorRole,
            String actorLabel,
            Instant createdAt
    ) {
    }

    public record StoreAuditResponse(
            UUID storeId,
            List<AuditLogResponse> entries
    ) {
    }
}
