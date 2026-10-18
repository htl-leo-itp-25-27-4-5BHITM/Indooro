package at.htl.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DefaultLayoutProviderTest {

    private final DefaultLayoutProvider provider = new DefaultLayoutProvider(new ObjectMapper());

    @Test
    void repeatedCallsReturnEqualButIndependentCopies() {
        ObjectNode first = provider.forStore("Leonding");
        ObjectNode second = provider.forStore("Leonding");

        assertEquals(first, second);
        assertNotSame(first, second);
    }

    @Test
    void mutatingOneCopyDoesNotChangeTheNextOne() {
        ObjectNode first = provider.forStore("Leonding");
        ObjectNode expected = first.deepCopy();

        first.put("shopName", "Veraendert");
        first.withArray("elements").removeAll();

        assertEquals(expected, provider.forStore("Leonding"));
    }

    @Test
    void forStoreSetsShopName() {
        assertEquals("Leonding", provider.forStore("Leonding").path("shopName").asText());
        assertEquals("Linz", provider.forStore("Linz").path("shopName").asText());
    }

    @Test
    void bundledLayoutCarriesLayoutIdAndRecordType() {
        ObjectNode bundled = provider.bundled();

        assertEquals("bundled-default", bundled.path("layoutId").asText());
        assertEquals("bundled", bundled.path("recordType").asText());
        assertTrue(bundled.path("elements").isArray());
    }

    @Test
    void bundledCopiesAreIndependent() {
        ObjectNode first = provider.bundled();
        ObjectNode second = provider.bundled();

        assertEquals(first, second);
        assertNotSame(first, second);
    }
}
