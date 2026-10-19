package at.htl.admin.readiness;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class CoverageRuleTest {

    private static final String VALID = """
            {
              "_comment": "test",
              "radiusMeters": 8.0,
              "minRadiusMeters": 0.5,
              "maxRadiusMeters": 30.0,
              "minBeaconsPerCell": 3,
              "maxLowCoverageShare": 0.05
            }
            """;

    @Test
    void defaultsMatchAgreedValues() {
        CoverageRule rule = CoverageRule.DEFAULT;

        assertEquals(8.0, rule.radiusMeters());
        assertEquals(0.5, rule.minRadiusMeters());
        assertEquals(30.0, rule.maxRadiusMeters());
        assertEquals(3, rule.minBeaconsPerCell());
        assertEquals(0.05, rule.maxLowCoverageShare());
    }

    @Test
    void evaluatorConstantsComeFromDefault() {
        CoverageRule rule = CoverageRule.DEFAULT;

        assertEquals(rule.radiusMeters(), StoreReadinessEvaluator.DEFAULT_RADIUS);
        assertEquals(rule.minRadiusMeters(), StoreReadinessEvaluator.MIN_RADIUS);
        assertEquals(rule.maxRadiusMeters(), StoreReadinessEvaluator.MAX_RADIUS);
        assertEquals(rule.minBeaconsPerCell(), StoreReadinessEvaluator.MIN_BEACONS_PER_CELL);
        assertEquals(rule.maxLowCoverageShare(), StoreReadinessEvaluator.MAX_LOW_COVERAGE_SHARE);
    }

    @Test
    void validDocumentIsAccepted() {
        CoverageRule rule = parse(VALID);

        assertEquals(CoverageRule.DEFAULT, rule);
    }

    @Test
    void radiusOutsideMinAndMaxIsRejected() {
        assertThrows(IllegalStateException.class,
                () -> parse(VALID.replace("\"radiusMeters\": 8.0", "\"radiusMeters\": 50.0")));
        assertThrows(IllegalStateException.class,
                () -> parse(VALID.replace("\"radiusMeters\": 8.0", "\"radiusMeters\": 0.1")));
    }

    @Test
    void shareOutsideZeroToOneIsRejected() {
        assertThrows(IllegalStateException.class,
                () -> parse(VALID.replace("\"maxLowCoverageShare\": 0.05", "\"maxLowCoverageShare\": 1.5")));
    }

    @Test
    void minBeaconsPerCellBelowOneIsRejected() {
        assertThrows(IllegalStateException.class,
                () -> parse(VALID.replace("\"minBeaconsPerCell\": 3", "\"minBeaconsPerCell\": 0")));
    }

    @Test
    void missingFieldIsRejected() {
        assertThrows(IllegalStateException.class,
                () -> parse(VALID.replace("\"radiusMeters\": 8.0,", "")));
    }

    @Test
    void invalidJsonIsRejected() {
        assertThrows(IllegalStateException.class, () -> parse("{ kaputt"));
    }

    // ----------------------------------------------------------------- profiles

    @Test
    void marketProfileIsTheUnchangedDefault() {
        assertEquals(CoverageRule.DEFAULT, CoverageRule.forProfile("market"));
        assertEquals(8.0, CoverageRule.forProfile("market").radiusMeters());
        assertEquals(3, CoverageRule.forProfile("market").minBeaconsPerCell());
        assertEquals(0.05, CoverageRule.forProfile("market").maxLowCoverageShare());
    }

    @Test
    void shippedFileDefinesTestroomThatOverridesOnlyTheRadius() {
        CoverageRule testroom = CoverageRule.forProfile("testroom");

        assertEquals(10.0, testroom.radiusMeters());
        assertEquals(CoverageRule.DEFAULT.minBeaconsPerCell(), testroom.minBeaconsPerCell());
        assertEquals(CoverageRule.DEFAULT.maxLowCoverageShare(), testroom.maxLowCoverageShare());
        assertEquals(CoverageRule.DEFAULT.minRadiusMeters(), testroom.minRadiusMeters());
        assertEquals(CoverageRule.DEFAULT.maxRadiusMeters(), testroom.maxRadiusMeters());
        assertEquals(java.util.List.of("market", "testroom"), java.util.List.copyOf(CoverageRule.profileIds()));
    }

    @Test
    void unknownProfileHasNoRule() {
        assertEquals(null, CoverageRule.forProfile("gaming"));
        assertEquals(null, CoverageRule.forProfile(null));
    }

    @Test
    void profileInheritsMissingFieldsAndMayOverrideAny() {
        var profiles = parseProfiles(VALID.replace("\"maxLowCoverageShare\": 0.05",
                "\"maxLowCoverageShare\": 0.05, \"profiles\": {\"small\": {\"minBeaconsPerCell\": 2, \"maxLowCoverageShare\": 0.2}}"));

        assertEquals(8.0, profiles.get("small").radiusMeters());
        assertEquals(2, profiles.get("small").minBeaconsPerCell());
        assertEquals(0.2, profiles.get("small").maxLowCoverageShare());
        assertEquals(CoverageRule.DEFAULT, profiles.get("market"));
    }

    @Test
    void fileWithoutProfilesHasOnlyMarket() {
        assertEquals(java.util.List.of("market"), java.util.List.copyOf(parseProfiles(VALID).keySet()));
    }

    @Test
    void invalidProfilesAreRejected() {
        String head = VALID.replace("\"maxLowCoverageShare\": 0.05", "\"maxLowCoverageShare\": 0.05, \"profiles\": ");
        assertThrows(IllegalStateException.class, () -> parseProfiles(head + "{\"x\": {\"radiusMeters\": 99.0}}}"));
        assertThrows(IllegalStateException.class, () -> parseProfiles(head + "{\"x\": {\"minBeaconsPerCell\": 0}}}"));
        assertThrows(IllegalStateException.class, () -> parseProfiles(head + "{\"market\": {}}}"));
        assertThrows(IllegalStateException.class, () -> parseProfiles(head + "{\"Bad Id\": {}}}"));
        assertThrows(IllegalStateException.class, () -> parseProfiles(head + "{\"x\": 3}}"));
        assertThrows(IllegalStateException.class, () -> parseProfiles(head + "[]}"));
    }

    private static java.util.Map<String, CoverageRule> parseProfiles(String json) {
        return CoverageRule.parseProfiles(new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
    }

    private static CoverageRule parse(String json) {
        return CoverageRule.parse(new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
    }
}
