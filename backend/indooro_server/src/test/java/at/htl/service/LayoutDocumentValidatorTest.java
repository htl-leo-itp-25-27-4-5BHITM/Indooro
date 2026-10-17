package at.htl.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.ws.rs.WebApplicationException;
import org.junit.jupiter.api.Test;

import java.io.InputStream;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LayoutDocumentValidatorTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final LayoutDocumentValidator validator = new LayoutDocumentValidator();

    @Test
    void acceptsBundledLayoutUnchanged() throws Exception {
        try (InputStream stream = getClass().getClassLoader().getResourceAsStream("default-layout.json")) {
            JsonNode layout = mapper.readTree(stream);
            String before = layout.toString();
            assertDoesNotThrow(() -> validator.validate(layout));
            assertDoesNotThrow(() -> validator.validateMobileElementIds(layout));
            assertEquals(before, layout.toString());
        }
    }

    @Test
    void publicationRequiresSafeNumericIdsWhileDraftValidationKeepsLegacyIds() {
        ObjectNode layout = layout();
        ObjectNode element = elementWithoutId(1, 1);
        ((ArrayNode) layout.get("elements")).add(element);
        assertDoesNotThrow(() -> validator.validate(layout));
        assertMobileBadRequest(layout);

        element.put("id", "legacy-1");
        assertDoesNotThrow(() -> validator.validate(layout));
        assertMobileBadRequest(layout);

        element.put("id", LayoutDocumentValidator.MAX_MOBILE_ELEMENT_ID + 1);
        assertMobileBadRequest(layout);

        element.put("id", LayoutDocumentValidator.MAX_MOBILE_ELEMENT_ID);
        assertDoesNotThrow(() -> validator.validateMobileElementIds(layout));
    }

    @Test
    void publicationRejectsShelfLayoutCodesForAnotherCategoryOrSection() {
        ObjectNode layout = layout();
        ObjectNode shelf = elementWithoutId(1, 1);
        shelf.put("id", 1);
        shelf.put("category", "310/1");
        shelf.put("meter", 1);
        shelf.put("layoutCode", "310/1/1/1");
        ((ArrayNode) layout.get("elements")).add(shelf);
        assertDoesNotThrow(() -> validator.validatePublishedShelfRouting(layout));

        shelf.put("layoutCode", "525/2/1/1");
        assertDoesNotThrow(() -> validator.validate(layout)); // Historical drafts remain editable.
        WebApplicationException mismatch = assertThrows(WebApplicationException.class,
                () -> validator.validatePublishedShelfRouting(layout));
        assertEquals(400, mismatch.getResponse().getStatus());

        shelf.put("layoutCode", "310/1/1/1");
        shelf.put("meter", 2);
        WebApplicationException section = assertThrows(WebApplicationException.class,
                () -> validator.validatePublishedShelfRouting(layout));
        assertEquals(400, section.getResponse().getStatus());
    }

    @Test
    void publicationRejectsUnroutableShelfAddressesEvenWithoutLayoutCode() {
        ObjectNode layout = layout();
        ObjectNode shelf = elementWithoutId(1, 1);
        shelf.put("id", 1);
        shelf.put("category", "310/1");
        shelf.put("meter", 1);
        ((ArrayNode) layout.get("elements")).add(shelf);
        assertDoesNotThrow(() -> validator.validatePublishedShelfRouting(layout));

        shelf.put("meter", 2);
        assertDoesNotThrow(() -> validator.validate(layout)); // Drafts remain repairable.
        assertEquals(400, assertThrows(WebApplicationException.class,
                () -> validator.validatePublishedShelfRouting(layout)).getResponse().getStatus());

        shelf.put("meter", 1);
        shelf.put("category", "0310/1");
        assertEquals(400, assertThrows(WebApplicationException.class,
                () -> validator.validatePublishedShelfRouting(layout)).getResponse().getStatus());

        shelf.put("category", "310/1");
        ObjectNode duplicate = shelf.deepCopy();
        duplicate.put("id", 2);
        ((ArrayNode) layout.get("elements")).add(duplicate);
        assertEquals(400, assertThrows(WebApplicationException.class,
                () -> validator.validatePublishedShelfRouting(layout)).getResponse().getStatus());

        ((ArrayNode) layout.get("elements")).remove(1);
        shelf.remove("category");
        shelf.putArray("productPositions").add("310-42");
        assertEquals(400, assertThrows(WebApplicationException.class,
                () -> validator.validatePublishedShelfRouting(layout)).getResponse().getStatus());
    }

    @Test
    void acceptsBoundaryGridAndFiveThousandElementsWithOptionalLegacyIds() {
        ObjectNode layout = layout();
        ((ObjectNode) layout.get("gridSize")).put("width", 1_000);
        ((ObjectNode) layout.get("gridSize")).put("height", 1_000);
        ArrayNode elements = (ArrayNode) layout.get("elements");
        for (int i = 0; i < 5_000; i++) {
            elements.add(elementWithoutId(i % 1_000, i / 1_000));
        }
        assertDoesNotThrow(() -> validator.validate(layout));
    }

    @Test
    void rejectsMalformedRootAndMissingRequiredStructure() throws Exception {
        assertBadRequest(null);
        assertBadRequest(mapper.readTree("[]"));
        assertBadRequest(mapper.readTree("{\"gridSize\":{\"width\":40,\"height\":60}}"));
        assertBadRequest(mapper.readTree("{\"gridSize\":{\"width\":40,\"height\":60},\"elements\":[null]}"));
        assertBadRequest(mapper.readTree("{\"gridSize\":{\"width\":40,\"height\":60},\"elements\":[{\"type\":\"shelf\",\"x\":0,\"y\":0}]}"));
    }

    @Test
    void rejectsOneMiBAndFiveThousandElementLimits() {
        ObjectNode tooLarge = layout();
        tooLarge.put("notes", "x".repeat(LayoutDocumentValidator.MAX_DOCUMENT_BYTES));
        assertBadRequest(tooLarge);

        ObjectNode tooMany = layout();
        ArrayNode elements = (ArrayNode) tooMany.get("elements");
        for (int i = 0; i < 5_001; i++) {
            elements.add(elementWithoutId(1, 1));
        }
        assertBadRequest(tooMany);
    }

    @Test
    void rejectsOutOfRangeGridAndNonNumericOrNonFiniteGeometry() throws Exception {
        ObjectNode badGrid = layout();
        ((ObjectNode) badGrid.get("gridSize")).put("width", 1_001);
        assertBadRequest(badGrid);
        ((ObjectNode) badGrid.get("gridSize")).put("width", 0);
        assertBadRequest(badGrid);

        for (String field : new String[]{"x", "y", "width", "height", "rotation"}) {
            ObjectNode bad = layout();
            ObjectNode element = elementWithoutId(1, 1);
            element.put(field, "not a number");
            ((ArrayNode) bad.get("elements")).add(element);
            assertBadRequest(bad);
        }

        ObjectNode infinite = layout();
        ObjectNode element = elementWithoutId(1, 1);
        element.put("x", Double.POSITIVE_INFINITY);
        ((ArrayNode) infinite.get("elements")).add(element);
        assertBadRequest(infinite);

        ObjectNode outside = layout();
        ((ArrayNode) outside.get("elements")).add(elementWithoutId(41, 1));
        assertBadRequest(outside);

        ObjectNode crossingBoundary = layout();
        ObjectNode crossingElement = elementWithoutId(39, 59);
        crossingElement.put("width", 2);
        ((ArrayNode) crossingBoundary.get("elements")).add(crossingElement);
        assertBadRequest(crossingBoundary);
    }

    @Test
    void rejectsOversizedTextAndDuplicatePresentIds() {
        for (String field : new String[]{"label", "beaconId", "category"}) {
            ObjectNode layout = layout();
            ObjectNode element = elementWithoutId(1, 1);
            element.put(field, "x".repeat(201));
            ((ArrayNode) layout.get("elements")).add(element);
            assertBadRequest(layout);
        }

        ObjectNode duplicate = layout();
        ObjectNode first = elementWithoutId(1, 1);
        first.put("id", 42);
        ObjectNode second = elementWithoutId(2, 2);
        second.put("id", 42);
        ((ArrayNode) duplicate.get("elements")).add(first).add(second);
        assertBadRequest(duplicate);
    }

    @Test
    void permitsUnassignedBeaconsButRejectsDuplicateOrConflictingIdentities() {
        ObjectNode unassigned = layout();
        ObjectNode beacon = mapper.createObjectNode();
        beacon.put("type", "beacon");
        beacon.put("x", 40);
        beacon.put("y", 60);
        ((ArrayNode) unassigned.get("elements")).add(beacon);
        assertDoesNotThrow(() -> validator.validate(unassigned));

        ObjectNode duplicateCode = layout();
        ((ArrayNode) duplicateCode.get("elements"))
                .add(beacon("Indooro1", "00000000000000000000000000000000:1:1"))
                .add(beacon("Indooro1", "00000000000000000000000000000000:1:2"));
        assertBadRequest(duplicateCode);

        ObjectNode conflict = layout();
        ObjectNode inconsistent = beacon("Indooro1", "00000000000000000000000000000000:1:1");
        inconsistent.put("uuid", "11111111-1111-1111-1111-111111111111");
        ((ArrayNode) conflict.get("elements")).add(inconsistent);
        assertBadRequest(conflict);

        ObjectNode duplicateIdentity = layout();
        ((ArrayNode) duplicateIdentity.get("elements"))
                .add(beacon("Indooro1", "00000000000000000000000000000000:1:1"))
                .add(beacon("Indooro2", "00000000-0000-0000-0000-000000000000:1:1"));
        assertBadRequest(duplicateIdentity);

        ObjectNode missingKeyParts = layout();
        ObjectNode inconsistentKey = beacon("Indooro1", "00000000000000000000000000000000");
        inconsistentKey.put("major", 1);
        inconsistentKey.put("minor", 1);
        ((ArrayNode) missingKeyParts.get("elements")).add(inconsistentKey);
        assertBadRequest(missingKeyParts);
    }

    @Test
    void acceptsValidAnchorsAndLayoutsWithoutAnchors() {
        ObjectNode withoutAnchors = layout();
        ((ArrayNode) withoutAnchors.get("elements")).add(elementWithoutId(1, 1));
        assertDoesNotThrow(() -> validator.validateAnchors(withoutAnchors));

        ObjectNode anchored = layout();
        ((ArrayNode) anchored.get("elements"))
                .add(anchor("A1", 1, 1))
                .add(anchor("A12", 5, 1))
                .add(anchor("GANG-4-ENDE", 9, 1));
        assertDoesNotThrow(() -> validator.validate(anchored));
        assertDoesNotThrow(() -> validator.validateAnchors(anchored));
    }

    @Test
    void publicationRejectsDuplicateAnchorIdsWithElementIndex() {
        ObjectNode layout = layout();
        ((ArrayNode) layout.get("elements"))
                .add(anchor("A1", 1, 1))
                .add(anchor("A2", 2, 1))
                .add(anchor("A1", 3, 1));
        assertDoesNotThrow(() -> validator.validate(layout)); // Drafts may keep duplicates until publication.
        WebApplicationException duplicate = assertThrows(WebApplicationException.class,
                () -> validator.validateAnchors(layout));
        assertEquals(400, duplicate.getResponse().getStatus());
        assertTrue(duplicate.getMessage().contains("elements[2]"));
    }

    @Test
    void publicationRejectsMalformedAnchorIds() {
        for (String anchorId : new String[]{"a1", "A1234567890123", "A1_2", "A 1", "A/1", "Ä1", ""}) {
            ObjectNode layout = layout();
            ((ArrayNode) layout.get("elements")).add(anchor(anchorId, 1, 1));
            assertDoesNotThrow(() -> validator.validate(layout)); // Drafts remain repairable.
            WebApplicationException malformed = assertThrows(WebApplicationException.class,
                    () -> validator.validateAnchors(layout));
            assertEquals(400, malformed.getResponse().getStatus(), anchorId);
        }
    }

    @Test
    void publicationRejectsAnchorWithoutTextualId() {
        ObjectNode layout = layout();
        ObjectNode withoutId = anchor("A1", 1, 1);
        withoutId.remove("anchorId");
        ((ArrayNode) layout.get("elements")).add(withoutId);
        assertDoesNotThrow(() -> validator.validate(layout));
        assertEquals(400, assertThrows(WebApplicationException.class,
                () -> validator.validateAnchors(layout)).getResponse().getStatus());

        withoutId.put("anchorId", 12);
        assertEquals(400, assertThrows(WebApplicationException.class,
                () -> validator.validateAnchors(layout)).getResponse().getStatus());
    }

    private ObjectNode anchor(String anchorId, double x, double y) {
        ObjectNode anchor = elementWithoutId(x, y);
        anchor.put("type", "anchor");
        anchor.put("anchorId", anchorId);
        anchor.put("label", "Gang 4 - Anfang");
        return anchor;
    }

    private ObjectNode layout() {
        ObjectNode layout = mapper.createObjectNode();
        layout.put("shopName", "Indooro");
        ObjectNode grid = layout.putObject("gridSize");
        grid.put("width", 40);
        grid.put("height", 60);
        layout.putArray("elements");
        return layout;
    }

    private ObjectNode elementWithoutId(double x, double y) {
        ObjectNode element = mapper.createObjectNode();
        element.put("type", "shelf");
        element.put("x", x);
        element.put("y", y);
        element.put("width", 1);
        element.put("height", 1);
        return element;
    }

    private ObjectNode beacon(String code, String identityKey) {
        ObjectNode element = mapper.createObjectNode();
        element.put("type", "beacon");
        element.put("x", 1);
        element.put("y", 1);
        element.put("beaconId", code);
        element.put("identityKey", identityKey);
        return element;
    }

    private void assertBadRequest(JsonNode layout) {
        WebApplicationException exception = assertThrows(WebApplicationException.class, () -> validator.validate(layout));
        assertEquals(400, exception.getResponse().getStatus());
    }

    private void assertMobileBadRequest(JsonNode layout) {
        WebApplicationException exception = assertThrows(WebApplicationException.class,
                () -> validator.validateMobileElementIds(layout));
        assertEquals(400, exception.getResponse().getStatus());
    }
}
