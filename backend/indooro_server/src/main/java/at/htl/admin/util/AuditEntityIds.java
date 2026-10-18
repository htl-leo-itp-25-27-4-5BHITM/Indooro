package at.htl.admin.util;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * Deterministische Entity-IDs fuer Audit-Eintraege von Katalogobjekten, deren Schluessel keine UUID sind
 * (Produkt-ID, Kategorie-Code). Die Nummer steht zusaetzlich im Summary des Eintrags.
 */
public final class AuditEntityIds {

    private AuditEntityIds() {
    }

    public static UUID product(int productId) {
        return nameBased("product:" + productId);
    }

    /** Bulk-Eintrag eines Marktes; storeKey ist der Marktcode oder "*" ohne Markt. */
    public static UUID productBulk(String storeKey) {
        return nameBased("product-bulk:" + storeKey);
    }

    public static UUID category(int categoryCode) {
        return nameBased("category:" + categoryCode);
    }

    public static UUID categoryBulk() {
        return nameBased("category-bulk");
    }

    static UUID nameBased(String key) {
        return UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8));
    }
}
