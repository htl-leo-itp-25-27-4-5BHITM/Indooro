package at.htl.admin.readiness;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Test vectors copied from swift/indooro-EinkaeuferFinal/Tests/IndooroNavigationCoreTests/ShelfMatchingTests.swift. */
class ShelfMatchingTest {

    @Test
    void productWithMeterResolvesToMatchingMeterShelf() {
        // Swift: testProductWithMeterResolvesToMatchingMeterElement
        assertFalse(ShelfMatching.matches("520/1", null, "520/2/3/1"));
        assertTrue(ShelfMatching.matches("520/2", null, "520/2/3/1"));
    }

    @Test
    void categoryPrefixDoesNotMatch() {
        // Swift: testCategoryPrefixDoesNotMatch (31 vs 310 must never match)
        assertFalse(ShelfMatching.matches("310", null, "31/1/1/1"));
        assertFalse(ShelfMatching.matches("310/1", null, "31/1/1/1"));
    }

    @Test
    void shelfWithoutMeterMatchesAnyMeter() {
        // Swift: testElementWithoutMeterMatchesAnyMeter
        assertTrue(ShelfMatching.matches("310", null, "310/1/1/1"));
        assertTrue(ShelfMatching.matches("310", null, "310/7/1/1"));
    }

    @Test
    void layoutCodeWithOneSegmentDoesNotResolve() {
        // Swift: testLayoutCodeWithOneSegmentDoesNotResolve
        assertFalse(ShelfMatching.matches("310", null, "310"));
        assertFalse(ShelfMatching.matches("310/1", null, "310"));
    }

    @Test
    void nonNumericMeterDoesNotResolve() {
        // Swift: testNonNumericMeterDoesNotResolve
        assertFalse(ShelfMatching.matches("310/1", null, "310/x/1/1"));
        assertFalse(ShelfMatching.matches("310/1", null, "310//1/1"));
    }

    @Test
    void meterMismatchDoesNotResolve() {
        // Swift: testMeterMismatchDoesNotResolve
        assertFalse(ShelfMatching.matches("520/1", null, "520/2/3/1"));
    }

    @Test
    void explicitMeterOverridesCategorySegment() {
        // Swift: meter ?? parseMeter(category)
        assertTrue(ShelfMatching.matches("520", 2, "520/2/1/1"));
        assertFalse(ShelfMatching.matches("520", 2, "520/1/1/1"));
    }

    @Test
    void missingOrEmptyLayoutCodeDoesNotMatch() {
        assertFalse(ShelfMatching.matches("310/1", null, null));
        assertFalse(ShelfMatching.matches("310/1", null, ""));
    }

    @Test
    void categoryHelpersIgnoreEmptySegmentsLikeSwift() {
        assertEquals("310", ShelfMatching.categoryBase("310/1"));
        assertEquals("310", ShelfMatching.categoryBase("/310/1"));
        assertNull(ShelfMatching.categoryBase(""));
        assertNull(ShelfMatching.categoryBase(null));
        assertEquals(Integer.valueOf(1), ShelfMatching.parseMeter("310//1"));
        assertNull(ShelfMatching.parseMeter("310/"));
        assertNull(ShelfMatching.parseMeter("310/x"));
    }
}
