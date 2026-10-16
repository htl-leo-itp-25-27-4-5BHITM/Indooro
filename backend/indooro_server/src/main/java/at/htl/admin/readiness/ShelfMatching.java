package at.htl.admin.readiness;

import java.util.regex.Pattern;

/**
 * Exact product-to-shelf matching, mirroring Swift {@code LayoutElement.matchesProductLayoutCode}
 * in swift/indooro-EinkaeuferFinal/indooroApp/Models/LayoutData.swift.
 *
 * <ul>
 *   <li>Category base is the first non-empty segment of the shelf category.</li>
 *   <li>Shelf meter is the explicit meter, else the second non-empty segment of the category.</li>
 *   <li>A product layoutCode must have at least two segments: base and numeric meter.</li>
 *   <li>Base must equal exactly ({@code 31} never matches {@code 310}).</li>
 *   <li>A shelf without a meter matches any product meter.</li>
 * </ul>
 */
public final class ShelfMatching {

    private static final Pattern INTEGER = Pattern.compile("[+-]?[0-9]+");

    private ShelfMatching() {
    }

    /** First non-empty segment of the category (Swift split with omittingEmptySubsequences), or null. */
    public static String categoryBase(String category) {
        String[] segments = nonEmptySegments(category);
        return segments.length == 0 ? null : segments[0];
    }

    /** Second non-empty segment of the category parsed as Int, or null (Swift parseMeter). */
    public static Integer parseMeter(String category) {
        String[] segments = nonEmptySegments(category);
        if (segments.length < 2) {
            return null;
        }
        return parseInt(segments[1]);
    }

    /**
     * @param category     shelf category, e.g. "520/2" or "310"
     * @param explicitMeter meter from the element, or null to use the category
     * @param layoutCode   product layout code, e.g. "520/2/3/1"
     */
    public static boolean matches(String category, Integer explicitMeter, String layoutCode) {
        if (layoutCode == null) {
            return false;
        }
        String base = categoryBase(category);
        if (base == null) {
            return false;
        }
        String[] parts = layoutCode.split("/", -1);
        if (parts.length < 2 || !base.equals(parts[0])) {
            return false;
        }
        Integer productMeter = parseInt(parts[1]);
        if (productMeter == null) {
            return false;
        }
        Integer shelfMeter = explicitMeter != null ? explicitMeter : parseMeter(category);
        return shelfMeter == null || shelfMeter.intValue() == productMeter.intValue();
    }

    private static Integer parseInt(String value) {
        if (value == null || !INTEGER.matcher(value).matches()) {
            return null;
        }
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException overflow) {
            return null;
        }
    }

    private static String[] nonEmptySegments(String value) {
        if (value == null) {
            return new String[0];
        }
        return java.util.Arrays.stream(value.split("/"))
                .filter(segment -> !segment.isEmpty())
                .toArray(String[]::new);
    }
}
