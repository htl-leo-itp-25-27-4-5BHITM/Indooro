package at.htl.admin.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class BeaconDtos {

    private BeaconDtos() {
    }

    public record BeaconCreateRequest(
            @NotBlank @Size(max = 60) String beaconCode,
            @NotBlank @Size(max = 40) String uuid,
            @Min(0) @Max(65535) Integer major,
            @Min(0) @Max(65535) Integer minor,
            @Size(max = 2_000) String notes
    ) {
    }

    public record BeaconBulkItemRequest(
            @NotBlank @Size(max = 60) String beaconCode,
            @Min(0) @Max(65535) Integer minor
    ) {
    }

    public record BeaconBulkCreateRequest(
            @NotBlank @Size(max = 40) String uuid,
            @Min(0) @Max(65535) Integer major,
            @Size(max = 2_000) String notes,
            @NotEmpty List<@Valid BeaconBulkItemRequest> items
    ) {
    }

    public record BeaconStoreSummary(
            UUID id,
            String storeCode,
            String name,
            UUID regionId
    ) {
    }

    public record BeaconResponse(
            UUID id,
            String beaconCode,
            String uuid,
            Integer major,
            Integer minor,
            String identityKey,
            String status,
            String notes,
            BeaconStoreSummary currentStore,
            Instant createdAt,
            Instant updatedAt
    ) {
    }

    public record BeaconBulkCreateResponse(
            int created,
            List<BeaconResponse> items
    ) {
    }

    public record BeaconAssignmentRequest(@NotNull UUID storeId) {
    }

    public record BeaconAssignmentResponse(
            UUID assignmentId,
            UUID beaconId,
            String beaconCode,
            String identityKey,
            UUID storeId,
            String storeCode,
            String storeName,
            Instant assignedAt,
            Boolean isActive
    ) {
    }
}
