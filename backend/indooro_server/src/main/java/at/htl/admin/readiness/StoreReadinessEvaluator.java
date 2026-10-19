package at.htl.admin.readiness;

import at.htl.admin.readiness.ReadinessDtos.AssignedBeacon;
import at.htl.admin.readiness.ReadinessDtos.ProductRef;
import at.htl.admin.readiness.ReadinessDtos.ReadinessCounts;
import at.htl.admin.readiness.ReadinessDtos.ReadinessFinding;
import at.htl.admin.readiness.ReadinessDtos.ReadinessInput;
import at.htl.admin.readiness.ReadinessDtos.ReadinessReport;
import at.htl.admin.readiness.ReadinessDtos.Severity;
import at.htl.admin.readiness.ReadinessDtos.Status;
import at.htl.admin.util.BeaconIdentityUtil;
import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Pure evaluation of a store's readiness for a pilot session. No CDI, no I/O.
 *
 * <p>Blocking: no active layout, entrance count not exactly one, product without a matching shelf,
 * target shelf without label. Warnings: shelf without products, duplicate product ids, assigned beacon
 * not placed, placed beacon without identity, grid size outside 5 to 200, more than 5 % of walkable
 * cells with fewer than three placed beacons within the radius, product list truncated by the
 * loader.
 *
 * <p>Walkability follows Swift {@code IndoorGraphBuilder.fromLayout}: all elements except beacon and
 * entrance block cells starting at floor(x) with ceil(width) cells. For rotated elements the rule uses
 * the bounding box of the rotated rectangle (rotation is around the centre, as in the editor). The iOS
 * graph itself ignores rotation, so this is a deliberate deviation for rotated elements.
 */
public final class StoreReadinessEvaluator {

    /** Coverage rule values come from the shared {@link CoverageRule} (resource coverage-rule.json). */
    public static final double DEFAULT_RADIUS = CoverageRule.DEFAULT.radiusMeters();
    public static final double MIN_RADIUS = CoverageRule.DEFAULT.minRadiusMeters();
    public static final double MAX_RADIUS = CoverageRule.DEFAULT.maxRadiusMeters();

    static final int MIN_BEACONS_PER_CELL = CoverageRule.DEFAULT.minBeaconsPerCell();
    static final double MAX_LOW_COVERAGE_SHARE = CoverageRule.DEFAULT.maxLowCoverageShare();
    static final double MIN_GRID_EDGE = 5.0;
    static final double MAX_GRID_EDGE = 200.0;
    /** Upper bound for coverage grids; the layout validator allows at most 1000 x 1000. */
    static final long MAX_COVERAGE_CELLS = 1_000_000L;
    private static final double EPS = 1e-9;
    private static final Pattern INTEGER = Pattern.compile("[+-]?[0-9]+");

    public ReadinessReport evaluate(ReadinessInput input) {
        if (!(input.radius() > 0)) {
            throw new IllegalArgumentException("radius muss groesser als 0 sein.");
        }
        String profile = CoverageRule.forProfile(input.profile()) == null ? CoverageRule.PROFILE_MARKET : input.profile();
        CoverageRule rule = CoverageRule.forProfile(profile);
        List<AssignedBeacon> assigned = input.assignedBeacons() == null ? List.of() : input.assignedBeacons();
        List<ProductRef> products = input.products() == null ? List.of() : input.products();
        List<ReadinessFinding> findings = new ArrayList<>();

        if (input.layout() == null || !input.layout().isObject()) {
            findings.add(finding(Severity.BLOCKING, "NO_ACTIVE_LAYOUT",
                    "Keine aktive Layout-Version: Die Filiale kann nicht getestet werden.",
                    null, null, null, null));
            return report(input, findings, new ReadinessCounts(0, 0, products.size(), 0, assigned.size(), 0, 0),
                    profile, rule, false);
        }

        JsonNode layout = input.layout();
        List<Element> elements = parseElements(layout.get("elements"));
        List<Element> entrances = elements.stream().filter(e -> "entrance".equals(e.type())).toList();
        List<Element> beacons = elements.stream().filter(e -> "beacon".equals(e.type())).toList();
        List<Element> shelves = elements.stream().filter(StoreReadinessEvaluator::isShelf).toList();

        // Grid size
        JsonNode grid = layout.get("gridSize");
        double gridWidth = number(grid, "width");
        double gridHeight = number(grid, "height");
        if (!inRange(gridWidth, MIN_GRID_EDGE, MAX_GRID_EDGE) || !inRange(gridHeight, MIN_GRID_EDGE, MAX_GRID_EDGE)) {
            findings.add(finding(Severity.WARNING, "GRID_SIZE_IMPLAUSIBLE",
                    String.format(Locale.ROOT, "Gitterkante liegt ausserhalb von 5 bis 200 m (Breite %s, Hoehe %s).",
                            fmt(gridWidth), fmt(gridHeight)),
                    null, null, null, null));
        }

        // Entrance
        if (entrances.size() != 1) {
            findings.add(finding(Severity.BLOCKING, "ENTRANCE_COUNT",
                    "Genau ein Eingang ist erforderlich, gefunden: " + entrances.size() + ".",
                    null, null, null, null));
        }

        // Products against shelves
        if (input.productListTruncated()) {
            findings.add(finding(Severity.WARNING, "PRODUCT_LIMIT_REACHED",
                    "Die Produktliste wurde beim Sicherheitslimit abgebrochen; das Ergebnis ist unvollstaendig.",
                    null, null, null, null));
        }
        Set<Integer> seenProductIds = new HashSet<>();
        Set<Integer> reportedDuplicates = new HashSet<>();
        for (ProductRef product : products) {
            if (product.id() != null && !seenProductIds.add(product.id()) && reportedDuplicates.add(product.id())) {
                findings.add(finding(Severity.WARNING, "DUPLICATE_PRODUCT_ID",
                        "Produkt-ID " + product.id() + " kommt mehrfach vor.",
                        null, product.id(), null, null));
            }
        }

        boolean[] hit = new boolean[shelves.size()];
        for (ProductRef product : products) {
            boolean matched = false;
            for (int i = 0; i < shelves.size(); i++) {
                Element shelf = shelves.get(i);
                if (ShelfMatching.matches(shelf.category(), shelf.meter(), product.layoutCode())) {
                    hit[i] = true;
                    matched = true;
                }
            }
            if (!matched) {
                String code = product.layoutCode() == null ? "(leer)" : product.layoutCode();
                findings.add(finding(Severity.BLOCKING, "PRODUCT_NO_SHELF",
                        "Produkt " + product.id() + " hat einen layoutCode (" + code + "), der kein Regal trifft.",
                        null, product.id(), product.layoutCode(), null));
            }
        }
        for (int i = 0; i < shelves.size(); i++) {
            Element shelf = shelves.get(i);
            if (hit[i] && shelf.label() == null) {
                findings.add(finding(Severity.BLOCKING, "TARGET_SHELF_WITHOUT_LABEL",
                        "Regal " + shelf.category() + " wird von Produkten angesteuert, hat aber kein Label.",
                        shelf.id(), null, shelf.category(), null));
            }
            if (!hit[i]) {
                findings.add(finding(Severity.WARNING, "SHELF_WITHOUT_PRODUCTS",
                        "Regal " + shelf.category() + " hat keine Produkte.",
                        shelf.id(), null, shelf.category(), null));
            }
        }

        // Beacons
        for (Element beacon : beacons) {
            if (beacon.identityKey() == null) {
                findings.add(finding(Severity.WARNING, "BEACON_WITHOUT_IDENTITY",
                        "Platziertes Beacon hat keine vollstaendige Identity (UUID, Major, Minor).",
                        beacon.id(), null, null, beacon.beaconCode()));
            }
        }
        for (AssignedBeacon assignedBeacon : assigned) {
            boolean placed = beacons.stream().anyMatch(beacon -> matchesAssigned(beacon, assignedBeacon));
            if (!placed) {
                findings.add(finding(Severity.WARNING, "BEACON_ASSIGNED_NOT_PLACED",
                        "Beacon " + assignedBeacon.beaconCode() + " ist der Filiale zugewiesen, aber nicht im Layout platziert.",
                        null, null, null, assignedBeacon.beaconCode()));
            }
        }

        // Walkable cells and beacon coverage
        int walkable = 0;
        int lowCoverage = 0;
        boolean coverageComputed = gridWidth >= 1 && gridHeight >= 1 && gridWidth * gridHeight <= MAX_COVERAGE_CELLS;
        if (!coverageComputed) {
            findings.add(finding(Severity.WARNING, "COVERAGE_NOT_COMPUTED",
                    "Die Abdeckung wurde nicht berechnet: Das Gitter fehlt, ist kleiner als 1 m oder hat mehr als "
                            + MAX_COVERAGE_CELLS + " Zellen.",
                    null, null, null, null));
        } else {
            int width = (int) gridWidth;
            int height = (int) gridHeight;
            boolean[] blocked = blockedCells(elements, width, height);
            int[] coverage = new int[width * height];
            for (Element beacon : beacons) {
                countBeaconCoverage(beacon, input.radius(), width, height, coverage);
            }
            for (int index = 0; index < blocked.length; index++) {
                if (blocked[index]) {
                    continue;
                }
                walkable++;
                if (coverage[index] < rule.minBeaconsPerCell()) {
                    lowCoverage++;
                }
            }
            if (walkable > 0 && lowCoverage > rule.maxLowCoverageShare() * walkable) {
                findings.add(finding(Severity.WARNING, "LOW_BEACON_COVERAGE",
                        String.format(Locale.ROOT,
                                "%d von %d begehbaren Zellen (%.1f %%) haben weniger als %d Beacons im Radius %s m "
                                        + "(erlaubt: %s %%, Profil %s).",
                                lowCoverage, walkable, 100.0 * lowCoverage / walkable, rule.minBeaconsPerCell(),
                                fmt(input.radius()), fmt(100.0 * rule.maxLowCoverageShare()), profile),
                        null, null, null, null));
            }
        }

        ReadinessCounts counts = new ReadinessCounts(
                shelves.size(),
                entrances.size(),
                products.size(),
                beacons.size(),
                assigned.size(),
                walkable,
                lowCoverage);
        return report(input, findings, counts, profile, rule, coverageComputed);
    }

    private static ReadinessReport report(ReadinessInput input, List<ReadinessFinding> findings, ReadinessCounts counts,
                                          String profile, CoverageRule rule, boolean coverageComputed) {
        // Stable sort: blocking findings first, otherwise in check order.
        findings.sort(Comparator.comparingInt(f -> f.severity().ordinal()));
        int blocking = (int) findings.stream().filter(f -> f.severity() == Severity.BLOCKING).count();
        int warnings = findings.size() - blocking;
        Status status = blocking > 0 ? Status.RED : warnings > 0 ? Status.YELLOW : Status.GREEN;
        return new ReadinessReport(
                input.storeId(),
                input.layoutId(),
                input.layoutVersionNo(),
                input.radius(),
                status,
                blocking,
                warnings,
                counts,
                List.copyOf(findings),
                profile,
                coverageComputed,
                rule.minBeaconsPerCell(),
                rule.maxLowCoverageShare());
    }

    private static ReadinessFinding finding(Severity severity, String code, String message, String elementId,
                                            Integer productId, String layoutCode, String beaconCode) {
        return new ReadinessFinding(severity, code, message, elementId, productId, layoutCode, beaconCode);
    }

    /** Shelf: not beacon, not entrance, and a category with a non-empty base. */
    private static boolean isShelf(Element element) {
        return !"beacon".equals(element.type())
                && !"entrance".equals(element.type())
                && ShelfMatching.categoryBase(element.category()) != null;
    }

    private static boolean matchesAssigned(Element beacon, AssignedBeacon assigned) {
        String beaconIdText = assigned.beaconId() == null ? null : assigned.beaconId().toString();
        for (String reference : new String[]{beacon.beaconId(), beacon.beaconCode()}) {
            if (reference != null && (reference.equals(beaconIdText)
                    || reference.equals(assigned.beaconCode())
                    || reference.equals(assigned.identityKey()))) {
                return true;
            }
        }
        return beacon.identityKey() != null && beacon.identityKey().equals(assigned.identityKey());
    }

    private static boolean[] blockedCells(List<Element> elements, int width, int height) {
        boolean[] blocked = new boolean[width * height];
        for (Element element : elements) {
            if ("beacon".equals(element.type()) || "entrance".equals(element.type())) {
                continue;
            }
            if (Double.isNaN(element.x()) || Double.isNaN(element.y())) {
                continue;
            }
            double w = element.width() == null ? 1 : element.width();
            double h = element.height() == null ? 1 : element.height();
            long x0;
            long x1;
            long y0;
            long y1;
            if (element.rotation() != null && element.rotation() != 0 && Double.isFinite(element.rotation())) {
                double[] box = rotatedBoundingBox(element.x(), element.y(), w, h, element.rotation());
                x0 = (long) Math.floor(box[0] + EPS);
                x1 = (long) Math.ceil(box[1] - EPS);
                y0 = (long) Math.floor(box[2] + EPS);
                y1 = (long) Math.ceil(box[3] - EPS);
                if (x1 <= x0) x1 = x0 + 1;
                if (y1 <= y0) y1 = y0 + 1;
            } else {
                x0 = (long) Math.floor(clamp(element.x()));
                x1 = x0 + Math.max(1L, (long) Math.ceil(clamp(w)));
                y0 = (long) Math.floor(clamp(element.y()));
                y1 = y0 + Math.max(1L, (long) Math.ceil(clamp(h)));
            }
            for (long y = Math.max(0, y0); y < Math.min(height, y1); y++) {
                for (long x = Math.max(0, x0); x < Math.min(width, x1); x++) {
                    blocked[(int) (y * width + x)] = true;
                }
            }
        }
        return blocked;
    }

    /** Bounding box {minX, maxX, minY, maxY} of the rectangle rotated around its centre. */
    private static double[] rotatedBoundingBox(double x, double y, double w, double h, double rotationDegrees) {
        double cx = x + w / 2;
        double cy = y + h / 2;
        double radians = Math.toRadians(rotationDegrees);
        double cos = Math.cos(radians);
        double sin = Math.sin(radians);
        double[][] corners = {{x, y}, {x + w, y}, {x + w, y + h}, {x, y + h}};
        double minX = Double.POSITIVE_INFINITY;
        double maxX = Double.NEGATIVE_INFINITY;
        double minY = Double.POSITIVE_INFINITY;
        double maxY = Double.NEGATIVE_INFINITY;
        for (double[] corner : corners) {
            double dx = corner[0] - cx;
            double dy = corner[1] - cy;
            double rx = cx + dx * cos - dy * sin;
            double ry = cy + dx * sin + dy * cos;
            minX = Math.min(minX, rx);
            maxX = Math.max(maxX, rx);
            minY = Math.min(minY, ry);
            maxY = Math.max(maxY, ry);
        }
        return new double[]{minX, maxX, minY, maxY};
    }

    private static void countBeaconCoverage(Element beacon, double radius, int width, int height, int[] coverage) {
        if (Double.isNaN(beacon.x()) || Double.isNaN(beacon.y())) {
            return;
        }
        double bx = beacon.x();
        double by = beacon.y();
        int i0 = (int) Math.max(0, Math.floor(clamp(bx - radius - 0.5)));
        int i1 = (int) Math.min(width - 1, Math.ceil(clamp(bx + radius - 0.5)));
        int j0 = (int) Math.max(0, Math.floor(clamp(by - radius - 0.5)));
        int j1 = (int) Math.min(height - 1, Math.ceil(clamp(by + radius - 0.5)));
        double radiusSquared = radius * radius;
        for (int j = j0; j <= j1; j++) {
            for (int i = i0; i <= i1; i++) {
                double dx = (i + 0.5) - bx;
                double dy = (j + 0.5) - by;
                if (dx * dx + dy * dy <= radiusSquared) {
                    coverage[j * width + i]++;
                }
            }
        }
    }

    private static List<Element> parseElements(JsonNode elementsNode) {
        List<Element> elements = new ArrayList<>();
        if (elementsNode == null || !elementsNode.isArray()) {
            return elements;
        }
        for (JsonNode node : elementsNode) {
            if (node.isObject()) {
                elements.add(parseElement(node));
            }
        }
        return elements;
    }

    private static Element parseElement(JsonNode node) {
        String type = text(node, "type");
        String[] identityParts = text(node, "identityKey") == null
                ? new String[0]
                : text(node, "identityKey").split(":", -1);
        boolean hasIdentityParts = identityParts.length >= 3;
        String uuid = firstNonNull(text(node, "beaconUUID"), text(node, "uuid"),
                hasIdentityParts ? identityParts[0] : null);
        Integer major = firstNonNull(integer(node, "beaconMajor"), integer(node, "major"),
                hasIdentityParts ? parseInteger(identityParts[1]) : null);
        Integer minor = firstNonNull(integer(node, "beaconMinor"), integer(node, "minor"),
                hasIdentityParts ? parseInteger(identityParts[2]) : null);
        Double width = optionalNumber(node, "width");
        Double height = optionalNumber(node, "height");
        Double rotation = optionalNumber(node, "rotation");
        return new Element(
                type == null ? "" : type,
                text(node, "id"),
                number(node, "x"),
                number(node, "y"),
                width,
                height,
                rotation,
                text(node, "category"),
                integer(node, "meter") != null ? integer(node, "meter") : ShelfMatching.parseMeter(text(node, "category")),
                text(node, "label"),
                text(node, "layoutCode"),
                text(node, "beaconId"),
                text(node, "beaconCode"),
                completeIdentityKey(uuid, major, minor));
    }

    private static String completeIdentityKey(String uuid, Integer major, Integer minor) {
        if (uuid == null || major == null || minor == null) {
            return null;
        }
        try {
            return BeaconIdentityUtil.toIdentityKey(uuid, major, minor);
        } catch (IllegalArgumentException invalidUuid) {
            return null;
        }
    }

    /** Trimmed text, or null when missing, null or blank. Numbers are rendered as text. */
    private static String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        if (value == null || value.isNull() || value.isContainerNode()) {
            return null;
        }
        String trimmed = value.asText().trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static double number(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        if (value == null || value.isNull()) {
            return Double.NaN;
        }
        if (value.isNumber()) {
            return value.doubleValue();
        }
        try {
            return Double.parseDouble(value.asText().trim());
        } catch (NumberFormatException notANumber) {
            return Double.NaN;
        }
    }

    private static Double optionalNumber(JsonNode node, String field) {
        double value = number(node, field);
        return Double.isNaN(value) ? null : value;
    }

    private static Integer integer(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        if (value.isIntegralNumber() && value.canConvertToInt()) {
            return value.intValue();
        }
        return value.isTextual() ? parseInteger(value.asText().trim()) : null;
    }

    private static Integer parseInteger(String value) {
        if (value == null || !INTEGER.matcher(value).matches()) {
            return null;
        }
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException overflow) {
            return null;
        }
    }

    private static String firstNonNull(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private static Integer firstNonNull(Integer... values) {
        for (Integer value : values) {
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private static boolean inRange(double value, double min, double max) {
        return value >= min && value <= max;
    }

    private static double clamp(double value) {
        return Math.max(-1e9, Math.min(1e9, value));
    }

    private static String fmt(double value) {
        return String.format(Locale.ROOT, "%.1f", value);
    }

    /** Parsed layout element with the fields the checks need. */
    private record Element(
            String type,
            String id,
            double x,
            double y,
            Double width,
            Double height,
            Double rotation,
            String category,
            Integer meter,
            String label,
            String layoutCode,
            String beaconId,
            String beaconCode,
            String identityKey
    ) {
    }
}
