package at.htl.admin.readiness;

import at.htl.admin.readiness.ReadinessDtos.AssignedBeacon;
import at.htl.admin.readiness.ReadinessDtos.ProductRef;
import at.htl.admin.readiness.ReadinessDtos.ReadinessFinding;
import at.htl.admin.readiness.ReadinessDtos.ReadinessInput;
import at.htl.admin.readiness.ReadinessDtos.ReadinessReport;
import at.htl.admin.readiness.ReadinessDtos.Severity;
import at.htl.admin.readiness.ReadinessDtos.Status;
import at.htl.admin.util.BeaconIdentityUtil;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class StoreReadinessEvaluatorTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final StoreReadinessEvaluator EVALUATOR = new StoreReadinessEvaluator();
    private static final String UUID_HEX = "0f0e0d0c0b0a09080706050403020100";

    // ----------------------------------------------------------------- blocking checks

    @Test
    void missingActiveLayoutIsBlocking() {
        ReadinessReport report = evaluate(null, List.of(), List.of(), 8.0);

        assertEquals(Status.RED, report.status());
        assertEquals(1, report.blockingCount());
        assertEquals("NO_ACTIVE_LAYOUT", report.findings().get(0).code());
        assertEquals(Severity.BLOCKING, report.findings().get(0).severity());
    }

    @Test
    void entranceCountMustBeExactlyOne() {
        assertTrue(hasFinding(evaluate(layout(20, 20, shelf("s1", 5, 5, 4, 1, "520/1", "Milch")),
                List.of(product(1, "520/1/1/1")), List.of(), 8.0), Severity.BLOCKING, "ENTRANCE_COUNT"));
        assertTrue(hasFinding(evaluate(layout(20, 20, entrance("e1", 0, 0), entrance("e2", 19, 19)),
                List.of(), List.of(), 8.0), Severity.BLOCKING, "ENTRANCE_COUNT"));
        assertFalse(hasCode(evaluate(layout(20, 20, entrance("e1", 0, 0)), List.of(), List.of(), 8.0),
                "ENTRANCE_COUNT"));
    }

    @Test
    void productWithoutMatchingShelfIsBlockingAndNamesProductAndLayoutCode() {
        ReadinessReport report = evaluate(
                layout(20, 20, entrance("e1", 0, 0), shelf("s1", 5, 5, 4, 1, "310/1", "Chips")),
                List.of(product(42, "31/1/1/1")),
                List.of(),
                8.0);

        ReadinessFinding finding = findFinding(report, "PRODUCT_NO_SHELF");
        assertEquals(Severity.BLOCKING, finding.severity());
        assertEquals(42, finding.productId());
        assertEquals("31/1/1/1", finding.layoutCode());
        assertEquals(Status.RED, report.status());
    }

    @Test
    void productMatchingShelfIsNotReported() {
        ReadinessReport report = evaluate(
                layout(20, 20, entrance("e1", 0, 0), shelf("s1", 5, 5, 4, 1, "520/2", "Milch")),
                List.of(product(7, "520/2/3/1")),
                List.of(),
                8.0);

        assertFalse(hasCode(report, "PRODUCT_NO_SHELF"));
        assertFalse(hasCode(report, "TARGET_SHELF_WITHOUT_LABEL"));
    }

    @Test
    void targetShelfWithoutLabelIsBlocking() {
        ReadinessReport missing = evaluate(
                layout(20, 20, entrance("e1", 0, 0), shelf("s1", 5, 5, 4, 1, "520/1", null)),
                List.of(product(1, "520/1/1/1")), List.of(), 8.0);
        ReadinessFinding finding = findFinding(missing, "TARGET_SHELF_WITHOUT_LABEL");
        assertEquals(Severity.BLOCKING, finding.severity());
        assertEquals("s1", finding.elementId());

        ReadinessReport blank = evaluate(
                layout(20, 20, entrance("e1", 0, 0), shelf("s1", 5, 5, 4, 1, "520/1", "   ")),
                List.of(product(1, "520/1/1/1")), List.of(), 8.0);
        assertTrue(hasFinding(blank, Severity.BLOCKING, "TARGET_SHELF_WITHOUT_LABEL"));
    }

    @Test
    void unlabeledShelfWithoutProductsIsNotATargetShelf() {
        ReadinessReport report = evaluate(
                layout(20, 20, entrance("e1", 0, 0), shelf("s1", 5, 5, 4, 1, "520/1", null)),
                List.of(), List.of(), 8.0);

        assertFalse(hasCode(report, "TARGET_SHELF_WITHOUT_LABEL"));
        assertTrue(hasFinding(report, Severity.WARNING, "SHELF_WITHOUT_PRODUCTS"));
    }

    @Test
    void rotatedTargetShelfWithoutLabelIsBlocking() {
        ReadinessReport report = evaluate(
                layout(20, 20, entrance("e1", 0, 0), rotated(shelf("s1", 5, 5, 4, 1, "520/1", null), 90)),
                List.of(product(1, "520/1/1/1")), List.of(), 8.0);

        assertTrue(hasFinding(report, Severity.BLOCKING, "TARGET_SHELF_WITHOUT_LABEL"));
    }

    @Test
    void rotatedShelfBlocksBoundingBoxOfRotatedRectangle() {
        // 4 x 1 shelf at (5,5). Unrotated: columns 5..8 in row 5, 4 cells.
        // Rotated 90 degrees around (7, 5.5): x in [6.5, 7.5], y in [3.5, 7.5] -> columns 6..7, rows 3..7, 10 cells.
        ReadinessReport unrotated = evaluate(
                layout(20, 20, entrance("e1", 0, 0), shelf("s1", 5, 5, 4, 1, "520/1", "Milch")),
                List.of(product(1, "520/1/1/1")), List.of(), 8.0);
        ReadinessReport rotatedReport = evaluate(
                layout(20, 20, entrance("e1", 0, 0), rotated(shelf("s1", 5, 5, 4, 1, "520/1", "Milch"), 90)),
                List.of(product(1, "520/1/1/1")), List.of(), 8.0);

        assertEquals(396, unrotated.counts().walkableCells());
        assertEquals(390, rotatedReport.counts().walkableCells());
        assertFalse(hasCode(rotatedReport, "TARGET_SHELF_WITHOUT_LABEL"));
    }

    // ----------------------------------------------------------------- warnings

    @Test
    void shelfWithoutProductsIsWarning() {
        ReadinessReport report = evaluate(
                layout(20, 20, entrance("e1", 0, 0), shelf("s9", 5, 5, 4, 1, "520/2", "Obst")),
                List.of(), List.of(), 8.0);

        ReadinessFinding finding = findFinding(report, "SHELF_WITHOUT_PRODUCTS");
        assertEquals(Severity.WARNING, finding.severity());
        assertEquals("s9", finding.elementId());
        assertEquals("520/2", finding.layoutCode());
        assertEquals(0, report.blockingCount());
        assertEquals(Status.YELLOW, report.status());
    }

    @Test
    void duplicateProductIdIsWarningOncePerId() {
        ReadinessReport report = evaluate(
                layout(20, 20, entrance("e1", 0, 0), shelf("s1", 5, 5, 4, 1, "520/1", "Milch")),
                List.of(product(7, "520/1/1/1"), product(7, "520/1/2/1"), product(7, "520/1/3/1")),
                List.of(), 8.0);

        long duplicates = report.findings().stream().filter(f -> "DUPLICATE_PRODUCT_ID".equals(f.code())).count();
        assertEquals(1, duplicates);
        ReadinessFinding finding = findFinding(report, "DUPLICATE_PRODUCT_ID");
        assertEquals(Severity.WARNING, finding.severity());
        assertEquals(7, finding.productId());
    }

    @Test
    void assignedBeaconNotPlacedIsWarning() {
        AssignedBeacon assigned = assignedBeacon("B-99", UUID_HEX, 1, 99);
        ReadinessReport report = evaluate(
                layout(20, 20, entrance("e1", 0, 0), shelf("s1", 5, 5, 4, 1, "520/1", "Milch")),
                List.of(product(1, "520/1/1/1")), List.of(assigned), 8.0);

        ReadinessFinding finding = findFinding(report, "BEACON_ASSIGNED_NOT_PLACED");
        assertEquals(Severity.WARNING, finding.severity());
        assertEquals("B-99", finding.beaconCode());
    }

    @Test
    void assignedBeaconMatchedByIdOrIdentityIsNotReported() {
        AssignedBeacon byCode = assignedBeacon("B-01", UUID_HEX, 1, 1);
        AssignedBeacon byIdentity = assignedBeacon("B-02", UUID_HEX, 1, 2);
        ObjectNode placedById = beacon("b1", 2, 2, "B-01", null, null, null);
        ObjectNode placedByIdentity = beacon("b2", 3, 3, null, UUID_HEX, 1, 2);
        ReadinessReport report = evaluate(
                layout(20, 20, entrance("e1", 0, 0), placedById, placedByIdentity),
                List.of(), List.of(byCode, byIdentity), 8.0);

        assertFalse(hasCode(report, "BEACON_ASSIGNED_NOT_PLACED"));
    }

    @Test
    void placedBeaconWithoutIdentityIsWarning() {
        ReadinessReport report = evaluate(
                layout(20, 20, entrance("e1", 0, 0), beacon("b1", 2, 2, "B-01", null, null, null)),
                List.of(), List.of(), 8.0);

        ReadinessFinding finding = findFinding(report, "BEACON_WITHOUT_IDENTITY");
        assertEquals(Severity.WARNING, finding.severity());
        assertEquals("b1", finding.elementId());
    }

    @Test
    void gridEdgeOutsideFiveToTwoHundredIsWarning() {
        assertTrue(hasFinding(evaluate(layout(4, 20, entrance("e1", 0, 0)), List.of(), List.of(), 8.0),
                Severity.WARNING, "GRID_SIZE_IMPLAUSIBLE"));
        assertTrue(hasFinding(evaluate(layout(20, 201, entrance("e1", 0, 0)), List.of(), List.of(), 8.0),
                Severity.WARNING, "GRID_SIZE_IMPLAUSIBLE"));
        assertFalse(hasCode(evaluate(layout(5, 5, entrance("e1", 0, 0)), List.of(), List.of(), 8.0),
                "GRID_SIZE_IMPLAUSIBLE"));
        assertFalse(hasCode(evaluate(layout(200, 200, entrance("e1", 0, 0)), List.of(), List.of(), 8.0),
                "GRID_SIZE_IMPLAUSIBLE"));
    }

    @Test
    void productListTruncationIsWarning() {
        ReadinessInput input = new ReadinessInput(UUID.randomUUID(), UUID.randomUUID(), 1,
                layout(20, 20, entrance("e1", 0, 0)), List.of(), true, List.of(), 8.0);
        ReadinessReport report = EVALUATOR.evaluate(input);

        assertTrue(hasFinding(report, Severity.WARNING, "PRODUCT_LIMIT_REACHED"));
    }

    // ----------------------------------------------------------------- beacon coverage

    @Test
    void fourCornerBeaconsLeaveWalkableCellsUncoveredAtRadiusEight() {
        ReadinessReport report = evaluate(
                layout(20, 20, entrance("e1", 0, 0),
                        beaconAt("c1", 0, 0), beaconAt("c2", 20, 0), beaconAt("c3", 0, 20), beaconAt("c4", 20, 20)),
                List.of(), List.of(), 8.0);

        assertEquals(400, report.counts().walkableCells());
        assertEquals(400, report.counts().lowCoverageCells());
        assertTrue(hasFinding(report, Severity.WARNING, "LOW_BEACON_COVERAGE"));
    }

    @Test
    void nineBeaconsInThreeByThreeRasterStillWarnAtRadiusEight() {
        // Measured: 136 of 400 cells (34 %) have fewer than three beacons within 8 m.
        ReadinessReport report = evaluate(
                layout(20, 20, entrance("e1", 0, 0), raster3x3()),
                List.of(), List.of(), 8.0);

        assertEquals(136, report.counts().lowCoverageCells());
        assertTrue(hasFinding(report, Severity.WARNING, "LOW_BEACON_COVERAGE"));
    }

    @Test
    void nineBeaconsInThreeByThreeRasterPassAtRadiusTen() {
        // Measured: 8 of 400 cells (2 %) are below three beacons, which is within the 5 % limit.
        ReadinessReport report = evaluate(
                layout(20, 20, entrance("e1", 0, 0), raster3x3()),
                List.of(), List.of(), 10.0);

        assertEquals(8, report.counts().lowCoverageCells());
        assertFalse(hasCode(report, "LOW_BEACON_COVERAGE"));
    }

    @Test
    void sixteenBeaconsAtFiveMetreSpacingPassAtDefaultRadius() {
        double[] axis = {2.5, 7.5, 12.5, 17.5};
        ObjectNode[] beacons = new ObjectNode[16];
        int index = 0;
        for (double x : axis) {
            for (double y : axis) {
                beacons[index] = beacon("b" + index, x, y, "B-" + index, UUID_HEX, 1, index + 1);
                index++;
            }
        }
        ReadinessReport report = evaluate(layout(20, 20, entrance("e1", 0, 0), beacons), List.of(), List.of(), 8.0);

        assertEquals(0, report.counts().lowCoverageCells());
        assertFalse(hasCode(report, "LOW_BEACON_COVERAGE"));
    }

    // ----------------------------------------------------------------- traffic light

    @Test
    void readyStoreIsGreenWithoutFindings() {
        ObjectNode[] beacons = new ObjectNode[16];
        List<AssignedBeacon> assigned = new ArrayList<>();
        double[] axis = {2.5, 7.5, 12.5, 17.5};
        int index = 0;
        for (double x : axis) {
            for (double y : axis) {
                beacons[index] = beacon("b" + index, x, y, "B-" + index, UUID_HEX, 1, index + 1);
                assigned.add(assignedBeacon("B-" + index, UUID_HEX, 1, index + 1));
                index++;
            }
        }
        ReadinessReport report = evaluate(
                layout(20, 20, entrance("e1", 0, 0), shelf("s1", 5, 5, 4, 1, "520/1", "Milch"), beacons),
                List.of(product(1, "520/1/1/1")), assigned, 8.0);

        assertEquals(Status.GREEN, report.status());
        assertEquals(0, report.blockingCount());
        assertEquals(0, report.warningCount());
        assertTrue(report.findings().isEmpty());
    }

    @Test
    void onlyWarningsGiveYellowAndBlockingGivesRed() {
        List<AssignedBeacon> registered = new ArrayList<>(registeredRaster3x3());
        registered.add(assignedBeacon("B-77", UUID_HEX, 1, 77));
        ReadinessReport yellow = evaluate(
                layout(20, 20, entrance("e1", 0, 0), shelf("s1", 5, 5, 4, 1, "520/1", "Milch"), raster3x3()),
                List.of(product(1, "520/1/1/1")), registered, 10.0);
        assertEquals(Status.YELLOW, yellow.status());

        ReadinessReport red = evaluate(
                layout(20, 20, entrance("e1", 0, 0), shelf("s1", 5, 5, 4, 1, "520/1", "Milch")),
                List.of(product(1, "520/1/1/1"), product(2, "999/1/1/1")), List.of(), 8.0);
        assertEquals(Status.RED, red.status());
    }

    // ----------------------------------------------------------------- beacon consistency

    private static final String ZERO_UUID = "00000000000000000000000000000000";

    /** Layout with an entrance and the given beacon elements. */
    private static JsonNode beaconLayout(ObjectNode... beacons) {
        return layout(20, 20, entrance("e1", 0, 0), beacons);
    }

    private static ReadinessReport evaluateBeacons(JsonNode layout, List<AssignedBeacon> registered) {
        return evaluate(layout, List.of(), registered, 8.0);
    }

    @Test
    void registeredBeaconWithAllZeroUuidIsBlocking() {
        ReadinessReport report = evaluateBeacons(beaconLayout(),
                List.of(new AssignedBeacon(UUID.randomUUID(), "Indooro5", ZERO_UUID + ":1:5",
                        ZERO_UUID, 1, 5)));

        ReadinessFinding finding = findFinding(report, "BEACON_UUID_ALL_ZERO");
        assertEquals(Severity.BLOCKING, finding.severity());
        assertEquals("Indooro5", finding.beaconCode());
        assertEquals(Status.RED, report.status());
    }

    @Test
    void allZeroUuidWithDashesIsRecognised() {
        ReadinessReport report = evaluateBeacons(beaconLayout(),
                List.of(new AssignedBeacon(UUID.randomUUID(), "Dashed", "x",
                        "00000000-0000-0000-0000-000000000000", 1, 5)));

        assertTrue(hasFinding(report, Severity.BLOCKING, "BEACON_UUID_ALL_ZERO"));
    }

    @Test
    void layoutBeaconWithAllZeroUuidIsBlockingAndNotAlsoReportedUnregistered() {
        ReadinessReport report = evaluateBeacons(
                beaconLayout(beacon("b1", 5, 5, "Indooro5", ZERO_UUID, 1, 5)), List.of());

        ReadinessFinding finding = findFinding(report, "BEACON_UUID_ALL_ZERO");
        assertEquals("b1", finding.elementId());
        assertFalse(hasCode(report, "LAYOUT_BEACON_NOT_REGISTERED"));
    }

    @Test
    void registeredBeaconWithoutMajorOrMinorIsBlocking() {
        ReadinessReport report = evaluateBeacons(beaconLayout(), List.of(
                new AssignedBeacon(UUID.randomUUID(), "NoMajor", UUID_HEX, UUID_HEX, null, null),
                new AssignedBeacon(UUID.randomUUID(), "NoMinor", UUID_HEX + ":3", UUID_HEX, 3, null)));

        List<ReadinessFinding> missing = report.findings().stream()
                .filter(f -> "BEACON_MAJOR_MINOR_MISSING".equals(f.code())).toList();
        assertEquals(2, missing.size());
        assertTrue(missing.stream().allMatch(f -> f.severity() == Severity.BLOCKING));
        assertEquals(List.of("NoMajor", "NoMinor"), missing.stream().map(ReadinessFinding::beaconCode).toList());
    }

    @Test
    void registeredBeaconBuiltFromBareIdentityKeyHasMissingMajorMinor() {
        ReadinessReport report = evaluateBeacons(beaconLayout(),
                List.of(new AssignedBeacon(UUID.randomUUID(), "Indooro3", UUID_HEX)));

        assertTrue(hasFinding(report, Severity.BLOCKING, "BEACON_MAJOR_MINOR_MISSING"));
    }

    @Test
    void layoutBeaconWithoutRegisteredCounterpartIsBlocking() {
        ReadinessReport report = evaluateBeacons(
                beaconLayout(beacon("b1", 5, 5, null, UUID_HEX, 1, 17)),
                List.of(assignedBeacon("Other", UUID_HEX, 1, 99)));

        ReadinessFinding finding = findFinding(report, "LAYOUT_BEACON_NOT_REGISTERED");
        assertEquals(Severity.BLOCKING, finding.severity());
        assertEquals("b1", finding.elementId());
        assertTrue(finding.message().contains("1/17"), finding.message());
        assertTrue(hasCode(report, "BEACON_ASSIGNED_NOT_PLACED"));
    }

    @Test
    void layoutBeaconLinkedToRegisteredBeaconWithOtherIdentityIsMismatch() {
        // Live case 2026-10-19: admin beacon Indooro5 registered with zero UUID, layout has another beacon there.
        ReadinessReport report = evaluateBeacons(
                beaconLayout(beacon("b1", 5, 5, "Indooro5", UUID_HEX, 1, 17)),
                List.of(assignedBeacon("Indooro5", UUID_HEX, 1, 15)));

        ReadinessFinding finding = findFinding(report, "BEACON_IDENTITY_MISMATCH");
        assertEquals(Severity.BLOCKING, finding.severity());
        assertEquals("b1", finding.elementId());
        assertEquals("Indooro5", finding.beaconCode());
        assertFalse(hasCode(report, "LAYOUT_BEACON_NOT_REGISTERED"));
    }

    @Test
    void matchingLayoutAndRegistryProduceNoBeaconConsistencyFinding() {
        ReadinessReport report = evaluateBeacons(
                beaconLayout(beacon("b1", 5, 5, "Indooro5", UUID_HEX, 1, 5),
                        beacon("b2", 9, 9, null, UUID_HEX.toUpperCase(), 1, 6)),
                List.of(assignedBeacon("Indooro5", UUID_HEX, 1, 5), assignedBeacon("Indooro6", UUID_HEX, 1, 6)));

        for (String code : List.of("BEACON_UUID_ALL_ZERO", "BEACON_MAJOR_MINOR_MISSING", "BEACON_IDENTITY_DUPLICATE",
                "BEACON_IDENTITY_MISMATCH", "LAYOUT_BEACON_NOT_REGISTERED", "BEACON_ASSIGNED_NOT_PLACED")) {
            assertFalse(hasCode(report, code), code + " in " + report.findings());
        }
    }

    @Test
    void duplicateIdentityInRegistryIsBlocking() {
        ReadinessReport report = evaluateBeacons(beaconLayout(), List.of(
                assignedBeacon("A", UUID_HEX, 1, 5),
                new AssignedBeacon(UUID.randomUUID(), "B", "other-key", UUID_HEX.toUpperCase(), 1, 5)));

        ReadinessFinding finding = findFinding(report, "BEACON_IDENTITY_DUPLICATE");
        assertEquals(Severity.BLOCKING, finding.severity());
        assertEquals("B", finding.beaconCode());
    }

    @Test
    void duplicateIdentityInLayoutIsBlocking() {
        ReadinessReport report = evaluateBeacons(
                beaconLayout(beacon("b1", 5, 5, "A", UUID_HEX, 1, 5), beacon("b2", 9, 9, "B", UUID_HEX, 1, 5)),
                List.of(assignedBeacon("A", UUID_HEX, 1, 5)));

        ReadinessFinding finding = findFinding(report, "BEACON_IDENTITY_DUPLICATE");
        assertEquals("b2", finding.elementId());
    }

    @Test
    void sameUuidWithDifferentMajorMinorIsNotADuplicate() {
        ReadinessReport report = evaluateBeacons(beaconLayout(), List.of(
                assignedBeacon("A", UUID_HEX, 1, 5), assignedBeacon("B", UUID_HEX, 1, 6),
                assignedBeacon("C", UUID_HEX, 2, 5)));

        assertFalse(hasCode(report, "BEACON_IDENTITY_DUPLICATE"));
    }

    @Test
    void noBeaconsAnywhereGivesNoConsistencyFinding() {
        ReadinessReport report = evaluateBeacons(beaconLayout(), List.of());

        assertFalse(hasCode(report, "LAYOUT_BEACON_NOT_REGISTERED"));
        assertFalse(hasCode(report, "BEACON_IDENTITY_DUPLICATE"));
    }

    // ----------------------------------------------------------------- helpers

    private static ReadinessReport evaluate(JsonNode layout, List<ProductRef> products,
                                            List<AssignedBeacon> assigned, double radius) {
        return EVALUATOR.evaluate(new ReadinessInput(
                UUID.randomUUID(), layout == null ? null : UUID.randomUUID(), layout == null ? null : 1,
                layout, products, false, assigned, radius));
    }

    private static boolean hasCode(ReadinessReport report, String code) {
        return report.findings().stream().anyMatch(f -> code.equals(f.code()));
    }

    private static boolean hasFinding(ReadinessReport report, Severity severity, String code) {
        return report.findings().stream().anyMatch(f -> code.equals(f.code()) && f.severity() == severity);
    }

    private static ReadinessFinding findFinding(ReadinessReport report, String code) {
        return report.findings().stream()
                .filter(f -> code.equals(f.code()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Finding fehlt: " + code + " in " + report.findings()));
    }

    private static ProductRef product(int id, String layoutCode) {
        return new ProductRef(id, "Produkt " + id, layoutCode);
    }

    private static AssignedBeacon assignedBeacon(String code, String uuidHex, int major, int minor) {
        return new AssignedBeacon(UUID.randomUUID(), code, BeaconIdentityUtil.toIdentityKey(uuidHex, major, minor));
    }

    /** Parts are single element nodes or arrays of element nodes. */
    private static JsonNode layout(double width, double height, Object... parts) {
        ObjectNode layout = JSON.createObjectNode();
        layout.put("shopName", "Test");
        ObjectNode grid = layout.putObject("gridSize");
        grid.put("width", width);
        grid.put("height", height);
        var array = layout.putArray("elements");
        for (Object part : parts) {
            if (part instanceof JsonNode node) {
                array.add(node);
            } else if (part instanceof JsonNode[] nodes) {
                for (JsonNode node : nodes) {
                    array.add(node);
                }
            }
        }
        return layout;
    }

    private static ObjectNode element(String type, String id, double x, double y, double width, double height) {
        ObjectNode node = JSON.createObjectNode();
        node.put("type", type);
        if (id != null) {
            node.put("id", id);
        }
        node.put("x", x);
        node.put("y", y);
        node.put("width", width);
        node.put("height", height);
        return node;
    }

    private static ObjectNode entrance(String id, double x, double y) {
        return element("entrance", id, x, y, 1, 1);
    }

    private static ObjectNode shelf(String id, double x, double y, double width, double height,
                                    String category, String label) {
        ObjectNode node = element("shelf", id, x, y, width, height);
        node.put("category", category);
        if (label != null) {
            node.put("label", label);
        }
        return node;
    }

    private static ObjectNode rotated(ObjectNode node, double degrees) {
        node.put("rotation", degrees);
        return node;
    }

    private static ObjectNode beaconAt(String id, double x, double y) {
        return beacon(id, x, y, id, UUID_HEX, 1, Math.abs(id.hashCode() % 60000));
    }

    private static ObjectNode beacon(String id, double x, double y, String beaconId,
                                     String uuid, Integer major, Integer minor) {
        ObjectNode node = element("beacon", id, x, y, 0, 0);
        if (beaconId != null) {
            node.put("beaconId", beaconId);
        }
        if (uuid != null) {
            node.put("uuid", uuid);
        }
        if (major != null) {
            node.put("major", major);
        }
        if (minor != null) {
            node.put("minor", minor);
        }
        return node;
    }

    /** Registry entries that match {@link #raster3x3()} (major 2, minor index + 1). */
    private static List<AssignedBeacon> registeredRaster3x3() {
        List<AssignedBeacon> registered = new ArrayList<>();
        for (int index = 0; index < 9; index++) {
            registered.add(assignedBeacon("R-" + index, UUID_HEX, 2, index + 1));
        }
        return registered;
    }

    /** Nine beacons at 10/3, 10 and 50/3 on both axes (3.33, 10, 16.67). */
    private static ObjectNode[] raster3x3() {
        double[] axis = {10.0 / 3, 10.0, 50.0 / 3};
        ObjectNode[] beacons = new ObjectNode[9];
        int index = 0;
        for (double x : axis) {
            for (double y : axis) {
                beacons[index] = beacon("r" + index, x, y, "R-" + index, UUID_HEX, 2, index + 1);
                index++;
            }
        }
        return beacons;
    }
}
