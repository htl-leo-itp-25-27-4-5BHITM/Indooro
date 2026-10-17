package at.htl.admin.readiness;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;

/**
 * Beacon coverage rule shared by store readiness (Java) and the beacon planner (scripts/beacon-planner).
 *
 * <p>Single source of truth: the classpath file {@value #RESOURCE}. It is read once when the class is
 * initialised; a missing or invalid file fails fast with an {@link IllegalStateException}.
 */
record CoverageRule(
        double radiusMeters,
        double minRadiusMeters,
        double maxRadiusMeters,
        int minBeaconsPerCell,
        double maxLowCoverageShare
) {

    static final String RESOURCE = "/readiness/coverage-rule.json";

    private static final ObjectMapper JSON = new ObjectMapper();

    /** Defaults from the classpath resource. Declared after {@link #JSON}, which {@link #load()} needs. */
    static final CoverageRule DEFAULT = load();

    CoverageRule {
        if (!(minRadiusMeters > 0) || minRadiusMeters > maxRadiusMeters) {
            throw new IllegalStateException("Abdeckungsregel: minRadiusMeters muss groesser als 0 und kleiner oder gleich maxRadiusMeters sein (min "
                    + minRadiusMeters + ", max " + maxRadiusMeters + ").");
        }
        if (!(radiusMeters >= minRadiusMeters && radiusMeters <= maxRadiusMeters)) {
            throw new IllegalStateException("Abdeckungsregel: radiusMeters muss zwischen " + minRadiusMeters
                    + " und " + maxRadiusMeters + " liegen (ist " + radiusMeters + ").");
        }
        if (minBeaconsPerCell < 1) {
            throw new IllegalStateException("Abdeckungsregel: minBeaconsPerCell muss mindestens 1 sein (ist "
                    + minBeaconsPerCell + ").");
        }
        if (!(maxLowCoverageShare >= 0 && maxLowCoverageShare <= 1)) {
            throw new IllegalStateException("Abdeckungsregel: maxLowCoverageShare muss zwischen 0 und 1 liegen (ist "
                    + maxLowCoverageShare + ").");
        }
    }

    private static CoverageRule load() {
        try (InputStream input = CoverageRule.class.getResourceAsStream(RESOURCE)) {
            if (input == null) {
                throw new IllegalStateException("Abdeckungsregel fehlt im Classpath: " + RESOURCE);
            }
            return parse(input);
        } catch (IOException unreadable) {
            throw new IllegalStateException("Abdeckungsregel " + RESOURCE + " kann nicht gelesen werden.", unreadable);
        }
    }

    /** Parses and validates a coverage rule document. Throws {@link IllegalStateException} on any problem. */
    static CoverageRule parse(InputStream input) {
        JsonNode root;
        try {
            root = JSON.readTree(input);
        } catch (IOException invalidJson) {
            throw new IllegalStateException("Abdeckungsregel ist kein gueltiges JSON: " + invalidJson.getMessage(), invalidJson);
        }
        if (root == null || !root.isObject()) {
            throw new IllegalStateException("Abdeckungsregel muss ein JSON-Objekt sein.");
        }
        return new CoverageRule(
                requiredNumber(root, "radiusMeters"),
                requiredNumber(root, "minRadiusMeters"),
                requiredNumber(root, "maxRadiusMeters"),
                requiredInteger(root, "minBeaconsPerCell"),
                requiredNumber(root, "maxLowCoverageShare"));
    }

    private static double requiredNumber(JsonNode root, String field) {
        JsonNode value = root.get(field);
        if (value == null || !value.isNumber()) {
            throw new IllegalStateException("Abdeckungsregel: Feld '" + field + "' fehlt oder ist keine Zahl.");
        }
        return value.doubleValue();
    }

    private static int requiredInteger(JsonNode root, String field) {
        JsonNode value = root.get(field);
        if (value == null || !value.isIntegralNumber() || !value.canConvertToInt()) {
            throw new IllegalStateException("Abdeckungsregel: Feld '" + field + "' fehlt oder ist keine ganze Zahl.");
        }
        return value.intValue();
    }
}
