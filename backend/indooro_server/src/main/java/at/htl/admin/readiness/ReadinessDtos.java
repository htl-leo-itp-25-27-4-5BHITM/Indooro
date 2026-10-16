package at.htl.admin.readiness;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;
import java.util.UUID;

/** Request-independent value types for the store pilot readiness report. */
public final class ReadinessDtos {

    private ReadinessDtos() {
    }

    public enum Severity { BLOCKING, WARNING }

    /** RED: at least one blocking finding. YELLOW: only warnings. GREEN: nothing to report. */
    public enum Status { RED, YELLOW, GREEN }

    /**
     * One finding. Only the fields relevant to the check are set; the others stay null.
     * elementId is the layout element id as text (ids may be numeric or text in drafts).
     */
    public record ReadinessFinding(
            Severity severity,
            String code,
            String message,
            String elementId,
            Integer productId,
            String layoutCode,
            String beaconCode
    ) {
    }

    public record ReadinessCounts(
            int shelves,
            int entrances,
            int products,
            int placedBeacons,
            int assignedBeacons,
            int walkableCells,
            int lowCoverageCells
    ) {
    }

    public record ReadinessReport(
            UUID storeId,
            UUID layoutId,
            Integer layoutVersionNo,
            double radius,
            Status status,
            int blockingCount,
            int warningCount,
            ReadinessCounts counts,
            List<ReadinessFinding> findings
    ) {
    }

    /** A store product as the readiness check needs it. */
    public record ProductRef(Integer id, String name, String layoutCode) {
    }

    /** One page of store products; truncated is true when the safety limit stopped the scan. */
    public record ProductPage(List<ProductRef> products, boolean truncated) {
    }

    /** A beacon assigned to the store (active assignment). */
    public record AssignedBeacon(UUID beaconId, String beaconCode, String identityKey) {
    }

    /** Pure evaluator input. layout is the stored layout document; null means no active layout. */
    public record ReadinessInput(
            UUID storeId,
            UUID layoutId,
            Integer layoutVersionNo,
            JsonNode layout,
            List<ProductRef> products,
            boolean productListTruncated,
            List<AssignedBeacon> assignedBeacons,
            double radius
    ) {
    }
}
