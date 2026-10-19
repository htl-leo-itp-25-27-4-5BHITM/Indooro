package at.htl.admin.readiness;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Beacon coverage rule shared by store readiness (Java) and the beacon planner (scripts/beacon-planner).
 *
 * <p>Single source of truth: the classpath file {@value #RESOURCE}. It is read once when the class is
 * initialised; a missing or invalid file fails fast with an {@link IllegalStateException}.
 *
 * <p>The top-level values are the profile {@value #PROFILE_MARKET}, which is the default of every store.
 * The optional {@code profiles} object adds named profiles (for example {@code testroom}); a profile
 * overrides only the fields it names and inherits the others, including the allowed radius range.
 */
record CoverageRule(
        double radiusMeters,
        double minRadiusMeters,
        double maxRadiusMeters,
        int minBeaconsPerCell,
        double maxLowCoverageShare
) {

    static final String RESOURCE = "/readiness/coverage-rule.json";

    /** Profile id of the top-level values. */
    static final String PROFILE_MARKET = "market";

    private static final ObjectMapper JSON = new ObjectMapper();

    /** Defaults from the classpath resource. Declared after {@link #JSON}, which {@link #load()} needs. */
    static final CoverageRule DEFAULT = load();

    /** All profiles by id, {@value #PROFILE_MARKET} first. Loaded from the same file as {@link #DEFAULT}. */
    private static final Map<String, CoverageRule> PROFILES = loadProfiles();

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

    private static Map<String, CoverageRule> loadProfiles() {
        try (InputStream input = CoverageRule.class.getResourceAsStream(RESOURCE)) {
            if (input == null) {
                throw new IllegalStateException("Abdeckungsregel fehlt im Classpath: " + RESOURCE);
            }
            return parseProfiles(input);
        } catch (IOException unreadable) {
            throw new IllegalStateException("Abdeckungsregel " + RESOURCE + " kann nicht gelesen werden.", unreadable);
        }
    }

    /** Rule of a profile id; null when the id is unknown. */
    static CoverageRule forProfile(String profileId) {
        return profileId == null ? null : PROFILES.get(profileId);
    }

    /** Known profile ids in file order, {@value #PROFILE_MARKET} first. */
    static java.util.Set<String> profileIds() {
        return PROFILES.keySet();
    }

    /** Parses all profiles of a coverage rule document: the top-level rule as "market" plus the named ones. */
    static Map<String, CoverageRule> parseProfiles(InputStream input) {
        JsonNode root = readRoot(input);
        CoverageRule market = fromNode(root, null);
        Map<String, CoverageRule> result = new LinkedHashMap<>();
        result.put(PROFILE_MARKET, market);
        JsonNode profiles = root.get("profiles");
        if (profiles != null && !profiles.isNull()) {
            if (!profiles.isObject()) {
                throw new IllegalStateException("Abdeckungsregel: 'profiles' muss ein Objekt sein.");
            }
            Iterator<Map.Entry<String, JsonNode>> entries = profiles.fields();
            while (entries.hasNext()) {
                Map.Entry<String, JsonNode> entry = entries.next();
                if (PROFILE_MARKET.equals(entry.getKey()) || !entry.getKey().matches("[a-z][a-z0-9-]{0,19}")) {
                    throw new IllegalStateException("Abdeckungsregel: ungueltige Profil-Id '" + entry.getKey() + "'.");
                }
                if (!entry.getValue().isObject()) {
                    throw new IllegalStateException("Abdeckungsregel: Profil '" + entry.getKey() + "' muss ein Objekt sein.");
                }
                result.put(entry.getKey(), fromNode(entry.getValue(), market));
            }
        }
        return Collections.unmodifiableMap(result);
    }

    /** Parses and validates a coverage rule document. Throws {@link IllegalStateException} on any problem. */
    static CoverageRule parse(InputStream input) {
        return fromNode(readRoot(input), null);
    }

    private static JsonNode readRoot(InputStream input) {
        JsonNode root;
        try {
            root = JSON.readTree(input);
        } catch (IOException invalidJson) {
            throw new IllegalStateException("Abdeckungsregel ist kein gueltiges JSON: " + invalidJson.getMessage(), invalidJson);
        }
        if (root == null || !root.isObject()) {
            throw new IllegalStateException("Abdeckungsregel muss ein JSON-Objekt sein.");
        }
        return root;
    }

    /** Builds a rule from a JSON object. Missing fields come from {@code base}; without a base they are required. */
    private static CoverageRule fromNode(JsonNode node, CoverageRule base) {
        return new CoverageRule(
                number(node, "radiusMeters", base == null ? null : base.radiusMeters()),
                number(node, "minRadiusMeters", base == null ? null : base.minRadiusMeters()),
                number(node, "maxRadiusMeters", base == null ? null : base.maxRadiusMeters()),
                integer(node, "minBeaconsPerCell", base == null ? null : base.minBeaconsPerCell()),
                number(node, "maxLowCoverageShare", base == null ? null : base.maxLowCoverageShare()));
    }

    private static double number(JsonNode root, String field, Double fallback) {
        JsonNode value = root.get(field);
        if (value == null && fallback != null) {
            return fallback;
        }
        if (value == null || !value.isNumber()) {
            throw new IllegalStateException("Abdeckungsregel: Feld '" + field + "' fehlt oder ist keine Zahl.");
        }
        return value.doubleValue();
    }

    private static int integer(JsonNode root, String field, Integer fallback) {
        JsonNode value = root.get(field);
        if (value == null && fallback != null) {
            return fallback;
        }
        if (value == null || !value.isIntegralNumber() || !value.canConvertToInt()) {
            throw new IllegalStateException("Abdeckungsregel: Feld '" + field + "' fehlt oder ist keine ganze Zahl.");
        }
        return value.intValue();
    }
}
