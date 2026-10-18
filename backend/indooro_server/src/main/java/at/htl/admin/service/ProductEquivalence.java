package at.htl.admin.service;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * Decides whether two catalog products are interchangeable for upsell purposes.
 *
 * <p>Two products are equivalent when they share a strong product class (for example two apple packs or two
 * kitchen rolls) or when their normalized base names are exactly equal. Domain, category and layout never make
 * two products equivalent, so unknown or loosely related products stay eligible.</p>
 *
 * <p>Normalization only feeds the comparison. The original product name is never changed.</p>
 */
final class ProductEquivalence {

    /**
     * Classes specific enough that two products of the same class are interchangeable. The service classes
     * listed here are accepted as-is; alias classes (toothpaste, cola, kitchen_paper, cleaner) are derived from
     * name tokens and are strong by definition.
     */
    static final Set<String> STRONG_CLASSES = Set.of(
            "apple", "banana", "orange", "butter", "milk", "yogurt", "eggs", "flour", "sugar", "bread",
            "honey", "oil", "pasta", "pasta_sauce", "rice_risotto", "oats_cereal", "laundry_softener",
            "laundry_detergent", "laundry_stain_remover", "trash_bag", "cleaning_gloves", "mushroom", "onion",
            "toothpaste", "cola", "kitchen_paper", "cleaner"
    );

    /**
     * Brand, quality and packaging words that do not change the product type. Only used to build the base name
     * for comparison. Keep this list small and documented.
     */
    private static final Set<String> MODIFIER_TOKENS = Set.of(
            "bio", "ja", "clever", "premium", "classic", "budget", "lose", "frisch",
            "tray", "beutel", "flasche", "dose", "packung", "pack", "stueck", "stk", "rolle", "rollen"
    );

    /**
     * Name fragments that disqualify a class for a product, e.g. "Apfelsaft" is not an apple class product.
     * Checked against every normalized name token, so compounds such as "Erdnussbutter" are caught.
     */
    private static final Map<String, Set<String>> BLOCKED_PARTS = Map.of(
            "apple", Set.of("saft", "juice", "mus", "kuchen", "strudel", "essig", "schorle", "chips", "likoer", "tee", "kaugummi"),
            "butter", Set.of("keks", "erdnuss", "nuss", "mandel", "kakao", "milch", "schoko", "popcorn", "cookie", "brot", "creme"),
            "milk", Set.of("schoko", "kakao", "butter", "kaffee", "soja", "hafer", "mandel", "reis", "kokos", "likoer"),
            "eggs", Set.of("likoer", "nudel", "schoko", "teig"),
            "sugar", Set.of("vanille", "schoko")
    );

    private static final Set<String> KITCHEN_EXACT = Set.of(
            "kuechenrolle", "kuechenrollen", "kuechenpapier", "kuechentuch", "kuechentuecher",
            "haushaltsrolle", "haushaltsrollen", "haushaltstuch", "haushaltstuecher",
            "papierhandtuch", "papierhandtuecher"
    );

    private static final Set<String> KITCHEN_SUFFIXES = Set.of(
            "kuechenrolle", "kuechenpapier", "kuechentuch", "kuechentuecher", "papierhandtuch"
    );

    private static final Set<String> ENGLISH_KITCHEN_WORDS = Set.of("roll", "rolls", "paper", "towel", "towels");

    /** Alias rules: the first matching rule decides the class, before the service class is considered. */
    private static final List<AliasRule> ALIAS_RULES = List.of(
            alias("toothpaste",
                    Set.of("zahnpasta", "zahnpasten", "zahncreme", "zahncremes", "toothpaste"),
                    Set.of("zahnpasta", "zahncreme")),
            alias("cola", Set.of("cola", "colas", "coca", "pepsi"), Set.of()),
            new AliasRule("kitchen_paper", ProductEquivalence::isKitchenPaper),
            alias("cleaner", Set.of("reiniger", "reinigers", "cleaner"), Set.of("reiniger")),
            alias("apple", Set.of("apfel", "apfeln", "aepfel", "aepfeln", "apple", "apples"), Set.of()),
            alias("flour", Set.of("mehl", "flour"), Set.of("mehl")),
            alias("butter", Set.of("butter"), Set.of("butter")),
            alias("eggs", Set.of("ei", "eier", "eiern", "egg", "eggs"), Set.of("eier")),
            alias("milk", Set.of("milch", "milk", "vollmilch", "frischmilch"), Set.of("milch")),
            alias("sugar", Set.of("zucker", "sugar", "puderzucker", "rohrzucker"), Set.of("zucker"))
    );

    private ProductEquivalence() {
    }

    /**
     * Comparison identity of a product.
     *
     * @param baseName normalized name without size, count, unit, brand and packaging words; empty when unknown
     * @param classKey strong product class, or null when the product has no strong class
     * @param tokens   normalized comparison tokens
     */
    record ProductIdentity(String baseName, String classKey, Set<String> tokens) {

        ProductIdentity {
            baseName = baseName == null ? "" : baseName;
            tokens = tokens == null ? Set.of() : Set.copyOf(tokens);
        }

        /**
         * Builds the comparison identity for a product name and its service class key (may be null).
         */
        static ProductIdentity of(String productName, String serviceClassKey) {
            List<String> rawTokens = rawTokens(productName);
            String classKey = classKeyFor(rawTokens, serviceClassKey);

            List<String> comparable = new ArrayList<>();
            for (String token : rawTokens) {
                if (token.length() < 2 || containsDigit(token) || MODIFIER_TOKENS.contains(token)) {
                    continue;
                }
                comparable.add(fold(token));
            }
            return new ProductIdentity(
                    String.join(" ", comparable),
                    classKey,
                    new LinkedHashSet<>(comparable)
            );
        }
    }

    /**
     * True when the two identities are interchangeable: the same strong class, or an identical non-empty base name.
     */
    static boolean equivalent(ProductIdentity first, ProductIdentity second) {
        if (first == null || second == null) {
            return false;
        }
        if (first.classKey() != null && first.classKey().equals(second.classKey())) {
            return true;
        }
        return !first.baseName().isEmpty() && first.baseName().equals(second.baseName());
    }

    /**
     * Grouping label used for logs: "class:&lt;classKey&gt;" for strong classes, "name:&lt;baseName&gt;" otherwise,
     * or null when neither is known.
     */
    static String diversityKey(ProductIdentity identity) {
        if (identity == null) {
            return null;
        }
        if (identity.classKey() != null) {
            return "class:" + identity.classKey();
        }
        return identity.baseName().isEmpty() ? null : "name:" + identity.baseName();
    }

    private static String classKeyFor(List<String> rawTokens, String serviceClassKey) {
        for (AliasRule rule : ALIAS_RULES) {
            if (!isBlocked(rule.classKey(), rawTokens) && rule.matcher().test(rawTokens)) {
                return rule.classKey();
            }
        }
        String mapped = "paper_towel".equals(serviceClassKey) ? "kitchen_paper" : serviceClassKey;
        if (mapped == null || !STRONG_CLASSES.contains(mapped) || isBlocked(mapped, rawTokens)) {
            return null;
        }
        return mapped;
    }

    private static boolean isBlocked(String classKey, List<String> rawTokens) {
        if (classKey == null) {
            return false;
        }
        Set<String> parts = BLOCKED_PARTS.getOrDefault(classKey, Set.of());
        return rawTokens.stream().anyMatch(token -> parts.stream().anyMatch(token::contains));
    }

    private static boolean isKitchenPaper(List<String> tokens) {
        boolean germanMatch = tokens.stream().anyMatch(token ->
                KITCHEN_EXACT.contains(token)
                        || KITCHEN_SUFFIXES.stream().anyMatch(token::endsWith));
        boolean englishMatch = tokens.contains("kitchen")
                && tokens.stream().anyMatch(ENGLISH_KITCHEN_WORDS::contains);
        return germanMatch || englishMatch;
    }

    private static AliasRule alias(String classKey, Set<String> exactTokens, Set<String> suffixes) {
        return new AliasRule(classKey, tokens -> tokens.stream()
                .anyMatch(token -> exactTokens.contains(token) || suffixes.stream().anyMatch(token::endsWith)));
    }

    /**
     * Normalizes German text for comparison: lowercase, umlauts transliterated, diacritics stripped,
     * punctuation turned into single spaces.
     */
    static String normalizeText(String value) {
        if (value == null) {
            return "";
        }
        String lower = value.toLowerCase(Locale.ROOT)
                .replace("ä", "ae")
                .replace("ö", "oe")
                .replace("ü", "ue")
                .replace("ß", "ss");
        String withoutDiacritics = Normalizer.normalize(lower, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        return withoutDiacritics.replaceAll("[^a-z0-9]+", " ").trim();
    }

    private static List<String> rawTokens(String value) {
        List<String> tokens = new ArrayList<>();
        for (String part : normalizeText(value).split(" ")) {
            if (!part.isEmpty()) {
                tokens.add(part);
            }
        }
        return tokens;
    }

    private static boolean containsDigit(String token) {
        return token.chars().anyMatch(Character::isDigit);
    }

    /**
     * Conservative singular/plural folding for comparison only. At most one suffix is removed.
     */
    static String fold(String token) {
        int length = token.length();
        if (length >= 6 && token.endsWith("en")) {
            return token.substring(0, length - 2);
        }
        if (length >= 5 && (token.endsWith("e") || token.endsWith("n"))) {
            return token.substring(0, length - 1);
        }
        if (length >= 5 && token.endsWith("s") && !token.endsWith("ss")) {
            return token.substring(0, length - 1);
        }
        return token;
    }

    private record AliasRule(String classKey, Predicate<List<String>> matcher) {
    }
}
