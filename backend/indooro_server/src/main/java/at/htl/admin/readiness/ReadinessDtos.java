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

    /**
     * products is the number of products that were checked. skippedGlobalProducts is the number of global
     * catalog products (neither storeId nor storeCode) that were left out because the store has its own
     * products; it is 0 when the global catalog was checked.
     */
    public record ReadinessCounts(
            int shelves,
            int entrances,
            int products,
            int placedBeacons,
            int assignedBeacons,
            int walkableCells,
            int lowCoverageCells,
            int skippedGlobalProducts
    ) {

        public ReadinessCounts(int shelves, int entrances, int products, int placedBeacons, int assignedBeacons,
                               int walkableCells, int lowCoverageCells) {
            this(shelves, entrances, products, placedBeacons, assignedBeacons, walkableCells, lowCoverageCells, 0);
        }
    }

    /**
     * profile is the coverage profile the store was checked with; radius, minBeaconsPerCell and
     * maxLowCoverageShare are the rule values used. coverageComputed is false when no coverage was
     * calculated (no active layout, or a grid that is missing or too large); the cell counts are then
     * not a result and must not be shown as one.
     */
    public record ReadinessReport(
            UUID storeId,
            UUID layoutId,
            Integer layoutVersionNo,
            double radius,
            Status status,
            int blockingCount,
            int warningCount,
            ReadinessCounts counts,
            List<ReadinessFinding> findings,
            String profile,
            boolean coverageComputed,
            int minBeaconsPerCell,
            double maxLowCoverageShare
    ) {
    }

    /** A store product as the readiness check needs it. */
    public record ProductRef(Integer id, String name, String layoutCode) {
    }

    /**
     * The products to check for one store; truncated is true when the safety limit stopped the scan.
     * skippedGlobalProducts counts the global catalog products that were left out because the store has
     * its own products.
     */
    public record ProductPage(List<ProductRef> products, boolean truncated, int skippedGlobalProducts) {

        public ProductPage(List<ProductRef> products, boolean truncated) {
            this(products, truncated, 0);
        }
    }

    /**
     * A beacon registered for the store (active assignment). uuid, major and minor come from the beacons
     * table; major and minor are null when the registry entry is incomplete.
     */
    public record AssignedBeacon(UUID beaconId, String beaconCode, String identityKey,
                                 String uuid, Integer major, Integer minor) {

        /** Derives uuid, major and minor from an identity key {@code uuid[:major:minor]}. */
        public AssignedBeacon(UUID beaconId, String beaconCode, String identityKey) {
            this(beaconId, beaconCode, identityKey, part(identityKey, 0), intPart(identityKey, 1), intPart(identityKey, 2));
        }

        private static String part(String identityKey, int index) {
            if (identityKey == null) {
                return null;
            }
            String[] parts = identityKey.split(":", -1);
            return index < parts.length && !parts[index].isBlank() ? parts[index] : null;
        }

        private static Integer intPart(String identityKey, int index) {
            String value = part(identityKey, index);
            try {
                return value == null ? null : Integer.valueOf(value);
            } catch (NumberFormatException notANumber) {
                return null;
            }
        }
    }

    /**
     * Pure evaluator input. layout is the stored layout document; null means no active layout.
     * profile is the coverage profile id; null or an unknown id is evaluated with the default "market".
     * skippedGlobalProducts is only passed through to the report counts.
     */
    public record ReadinessInput(
            UUID storeId,
            UUID layoutId,
            Integer layoutVersionNo,
            JsonNode layout,
            List<ProductRef> products,
            boolean productListTruncated,
            List<AssignedBeacon> assignedBeacons,
            double radius,
            String profile,
            int skippedGlobalProducts
    ) {

        /** Input without skipped global products. */
        public ReadinessInput(UUID storeId, UUID layoutId, Integer layoutVersionNo, JsonNode layout,
                              List<ProductRef> products, boolean productListTruncated,
                              List<AssignedBeacon> assignedBeacons, double radius, String profile) {
            this(storeId, layoutId, layoutVersionNo, layout, products, productListTruncated, assignedBeacons,
                    radius, profile, 0);
        }

        /** Input for the default profile "market". */
        public ReadinessInput(UUID storeId, UUID layoutId, Integer layoutVersionNo, JsonNode layout,
                              List<ProductRef> products, boolean productListTruncated,
                              List<AssignedBeacon> assignedBeacons, double radius) {
            this(storeId, layoutId, layoutVersionNo, layout, products, productListTruncated, assignedBeacons,
                    radius, null, 0);
        }
    }
}
