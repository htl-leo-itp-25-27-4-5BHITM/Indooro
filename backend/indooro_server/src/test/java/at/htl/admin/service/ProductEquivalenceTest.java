package at.htl.admin.service;

import at.htl.model.Product;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProductEquivalenceTest {

    private static final UpsellSuggestionService CLASSIFIER = new UpsellSuggestionService();

    @Test
    void appleVariantsAreEquivalentAcrossBrandsSizesAndUmlauts() {
        assertEquivalent("Aepfel 1kg", "Bio Aepfel lose");
        assertEquivalent("Aepfel 1kg", "Äpfel Gala 1kg");
        assertEquivalent("Bio Aepfel lose", "Äpfel Gala 1kg");
    }

    @Test
    void kitchenRollAndKitchenPaperAreEquivalent() {
        assertEquivalent("Kuechenrolle 4 Rollen", "Küchenpapier");
        assertEquivalent("Kuechenrolle 4 Rollen", "Kitchen Paper 2 Rollen");
        assertEquivalent("Kuechenrolle 4 Rollen", "Haushaltsrollen 3 Stueck");
    }

    @Test
    void toothpasteSynonymsAreEquivalent() {
        assertEquivalent("Zahnpasta Elmex 75ml", "Zahncreme Aronal");
    }

    @Test
    void colaVariantsAreEquivalentAcrossBrandsAndSizes() {
        assertEquivalent("Coca-Cola 1.5L", "Pepsi Cola 2L");
    }

    @Test
    void butterAndFlourVariantsAreEquivalent() {
        assertEquivalent("Butter 250g", "Butter Bio 250g");
        assertEquivalent("Weizenmehl 1kg", "Mehl Type 480 1kg");
    }

    @Test
    void eggsAndMilkVariantsAreEquivalent() {
        assertEquivalent("Freilandeier 10 Stueck", "Eier 6 Stueck");
        assertEquivalent("Vollmilch 1L", "Milch 3,5% 1L");
    }

    @Test
    void unrelatedProductsAreNotEquivalent() {
        assertNotEquivalent("Risotto Reis 500g", "Butter 250g");
        assertNotEquivalent("Freilandeier 10 Stueck", "Weizenmehl 1kg");
        assertNotEquivalent("Eier 10 Stueck", "Vollmilch 1L");
        assertNotEquivalent("Bananen", "Aepfel 1kg");
    }

    @Test
    void compoundsWithBlockedPartsAreNotTheirBaseProduct() {
        assertNotEquivalent("Butter 250g", "Butterkeks");
        assertNotEquivalent("Apfel", "Apfelsaft");
    }

    @Test
    void unknownProductsAreEquivalentOnlyWhenNormalizedBaseNamesMatch() {
        assertNotEquivalent("Xyz Spezial", "Qrs Mix");
        assertEquivalent("Xyz Spezial 500g", "XYZ-Spezial");
    }

    @Test
    void unknownProductsWithoutAnyNameNeverMatch() {
        ProductEquivalence.ProductIdentity empty = ProductEquivalence.ProductIdentity.of(null, null);
        assertFalse(ProductEquivalence.equivalent(empty, ProductEquivalence.ProductIdentity.of("", null)));
        assertFalse(ProductEquivalence.equivalent(null, identity("Aepfel 1kg")));
        assertFalse(ProductEquivalence.equivalent(identity("Aepfel 1kg"), null));
    }

    @Test
    void diversityKeyPrefersStrongClassThenBaseName() {
        assertEquals("class:apple", ProductEquivalence.diversityKey(identity("Bio Aepfel lose")));
        assertEquals("name:xyz spezial", ProductEquivalence.diversityKey(identity("Xyz Spezial 500g")));
        assertNull(ProductEquivalence.diversityKey(identity("500g")));
        assertNull(ProductEquivalence.diversityKey(null));
    }

    @Test
    void normalizationTransliteratesUmlautsAndStripsPunctuation() {
        assertEquals("kuechenpapier 2 lagig", ProductEquivalence.normalizeText("Küchenpapier 2-lagig"));
        assertEquals("aepfel", ProductEquivalence.normalizeText("Äpfel"));
        assertEquals("", ProductEquivalence.normalizeText(null));
    }

    @Test
    void foldingRemovesAtMostOneSuffix() {
        assertEquals("aepfel", ProductEquivalence.fold("aepfel"));
        assertEquals("eier", ProductEquivalence.fold("eier"));
        assertEquals("kuechenroll", ProductEquivalence.fold("kuechenrollen"));
    }

    @Test
    void serviceClassKeyIsOptionalForAliasedProducts() {
        assertTrue(ProductEquivalence.equivalent(
                ProductEquivalence.ProductIdentity.of("Zahnpasta Elmex 75ml", null),
                ProductEquivalence.ProductIdentity.of("Zahncreme Aronal", "personal_care")
        ));
    }

    private static ProductEquivalence.ProductIdentity identity(String name) {
        String serviceClassKey = CLASSIFIER.classifyProduct(new Product(null, name, null, null)).classKey();
        return ProductEquivalence.ProductIdentity.of(name, serviceClassKey);
    }

    private static void assertEquivalent(String first, String second) {
        assertTrue(ProductEquivalence.equivalent(identity(first), identity(second)), first + " vs " + second);
        assertTrue(ProductEquivalence.equivalent(identity(second), identity(first)), second + " vs " + first);
    }

    private static void assertNotEquivalent(String first, String second) {
        assertFalse(ProductEquivalence.equivalent(identity(first), identity(second)), first + " vs " + second);
        assertFalse(ProductEquivalence.equivalent(identity(second), identity(first)), second + " vs " + first);
    }
}
