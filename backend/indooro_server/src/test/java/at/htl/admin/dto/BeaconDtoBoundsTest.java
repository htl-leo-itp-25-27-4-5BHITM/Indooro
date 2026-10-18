package at.htl.admin.dto;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** major and minor are 0..65535 or null (UUID-only registration). */
class BeaconDtoBoundsTest {

    private static jakarta.validation.ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void setUp() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void tearDown() {
        factory.close();
    }

    @Test
    void createRequestAcceptsBoundsAndNull() {
        assertTrue(create(0, 0).isEmpty());
        assertTrue(create(65535, 65535).isEmpty());
        assertTrue(create(null, null).isEmpty());
    }

    @Test
    void createRequestRejectsOutOfRangeMajorAndMinor() {
        assertEquals(1, create(-1, 0).size());
        assertEquals(1, create(65536, 0).size());
        assertEquals(1, create(0, -1).size());
        assertEquals(1, create(0, 70000).size());
    }

    @Test
    void bulkRequestValidatesMajorAndNestedMinor() {
        BeaconDtos.BeaconBulkCreateRequest badMajor = new BeaconDtos.BeaconBulkCreateRequest(
                "0123456789abcdef0123456789abcdef", 65536, null,
                List.of(new BeaconDtos.BeaconBulkItemRequest("B-1", 1)));
        BeaconDtos.BeaconBulkCreateRequest badMinor = new BeaconDtos.BeaconBulkCreateRequest(
                "0123456789abcdef0123456789abcdef", 1, null,
                List.of(new BeaconDtos.BeaconBulkItemRequest("B-1", -5)));

        assertEquals(1, validator.validate(badMajor).size());
        assertEquals(1, validator.validate(badMinor).size());
    }

    private Set<ConstraintViolation<BeaconDtos.BeaconCreateRequest>> create(Integer major, Integer minor) {
        return validator.validate(new BeaconDtos.BeaconCreateRequest(
                "B-1", "0123456789abcdef0123456789abcdef", major, minor, null));
    }
}
