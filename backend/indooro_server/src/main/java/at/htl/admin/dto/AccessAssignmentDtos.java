package at.htl.admin.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

/**
 * Admin-UI access assignments (table {@code user_access_assignments}). One active row per Keycloak subject.
 */
public final class AccessAssignmentDtos {

    private AccessAssignmentDtos() {
    }

    public record AccessAssignmentCreateRequest(
            @NotBlank @Size(max = 120) String keycloakSubject,
            @NotBlank @Size(max = 120) String username,
            @Email @Size(max = 254) String email,
            @NotBlank @Size(max = 40) String role,
            UUID regionId,
            UUID storeId
    ) {
    }

    public record AccessAssignmentResponse(
            UUID id,
            String keycloakSubject,
            String username,
            String email,
            String role,
            UUID regionId,
            String regionName,
            UUID storeId,
            String storeCode,
            String storeName,
            String status,
            Instant createdAt,
            Instant updatedAt
    ) {
    }
}
