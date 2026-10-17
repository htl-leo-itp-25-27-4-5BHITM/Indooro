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

    private static CoverageRule parse(String json) {
        return CoverageRule.parse(new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
    }
}
