package at.htl.admin.util;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

class AuditEntityIdsTest {

    @Test
    void productIdIsNameBasedAndStable() {
        UUID expected = UUID.nameUUIDFromBytes("product:42".getBytes(StandardCharsets.UTF_8));

        assertEquals(expected, AuditEntityIds.product(42));
        assertEquals(AuditEntityIds.product(42), AuditEntityIds.product(42));
        assertNotEquals(AuditEntityIds.product(42), AuditEntityIds.product(43));
    }

    @Test
    void productAndCategoryWithSameNumberDoNotCollide() {
        assertNotEquals(AuditEntityIds.product(310), AuditEntityIds.category(310));
    }

    @Test
    void bulkIdsDependOnMarketKey() {
        assertEquals(AuditEntityIds.productBulk("SPAR-Leonding-001"), AuditEntityIds.productBulk("SPAR-Leonding-001"));
        assertNotEquals(AuditEntityIds.productBulk("SPAR-Leonding-001"), AuditEntityIds.productBulk("*"));
    }
}
