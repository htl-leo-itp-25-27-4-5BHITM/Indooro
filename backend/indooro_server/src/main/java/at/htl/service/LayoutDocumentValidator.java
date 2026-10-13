package at.htl.service;

import at.htl.admin.util.BeaconIdentityUtil;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;

/** Validates the shared legacy and per-store layout document before it reaches persistence. */
@ApplicationScoped
public class LayoutDocumentValidator {

    public static final int MAX_DOCUMENT_BYTES = 1_048_576;
    public static final int MAX_ELEMENTS = 5_000;
    public static final int MAX_TEXT_LENGTH = 200;
    public static final double MAX_GRID_DIMENSION = 1_000;
    public static final long MAX_MOBILE_ELEMENT_ID = 9_007_199_254_740_991L;

    /** Published layouts are decoded as Int64 by the iOS client. Drafts may retain legacy IDs for repair. */
    public void validateMobileElementIds(JsonNode document) {
        JsonNode elements = document == null ? null : document.get("elements");
        if (elements == null || !elements.isArray()) {
            throw badRequest("elements muss eine Liste sein.");
        }
        for (int index = 0; index < elements.size(); index++) {
            JsonNode id = elements.get(index).get("id");
            if (id == null || !id.isIntegralNumber() || !id.canConvertToLong()
                    || id.longValue() <= 0 || id.longValue() > MAX_MOBILE_ELEMENT_ID) {
                throw badRequest("elements[" + index + "].id muss fuer die iOS-Karte eine positive sichere Ganzzahl sein.");
            }
        }
    }

    /** Product layout codes must address the same shelf that the mobile client resolves by category and section. */
    public void validatePublishedShelfRouting(JsonNode document) {
        JsonNode elements = document == null ? null : document.get("elements");
        if (elements == null || !elements.isArray()) {
            throw badRequest("elements muss eine Liste sein.");
        }
        for (int index = 0; index < elements.size(); index++) {
            JsonNode element = elements.get(index);
            if (!"shelf".equals(element.path("type").asText())) {
                continue;
            }
            String layoutCode = element.path("layoutCode").asText("").trim();
            if (layoutCode.isEmpty()) {
                continue;
            }
            String category = element.path("category").asText("");
            if (!layoutCode.matches("\\d{1,4}/\\d{1,3}/\\d{1,2}/\\d{1,2}")
                    || !category.matches("\\d{1,4}/\\d{1,3}")
                    || !layoutCode.startsWith(category + "/")) {
                throw badRequest("elements[" + index + "].layoutCode muss zur Regal-Kategorie und zum Abschnitt passen.");
            }
            JsonNode meter = element.get("meter");
            if (meter != null && !meter.isNull()
                    && (!meter.isIntegralNumber() || meter.intValue() != Integer.parseInt(category.split("/")[1]))) {
                throw badRequest("elements[" + index + "].meter muss zum Regal-Abschnitt passen.");
            }
        }
    }

    public void validate(JsonNode document) {
        if (document == null || !document.isObject()) {
            throw badRequest("Layout muss ein JSON-Objekt sein.");
        }
        if (document.toString().getBytes(StandardCharsets.UTF_8).length > MAX_DOCUMENT_BYTES) {
            throw badRequest("Layout darf hoechstens 1 MiB gross sein.");
        }

        JsonNode grid = document.get("gridSize");
        if (grid == null || !grid.isObject()) {
            throw badRequest("gridSize muss ein Objekt sein.");
        }
        double gridWidth = requiredNumber(grid, "width", "gridSize.width");
        double gridHeight = requiredNumber(grid, "height", "gridSize.height");
        if (gridWidth <= 0 || gridHeight <= 0 || gridWidth > MAX_GRID_DIMENSION || gridHeight > MAX_GRID_DIMENSION) {
            throw badRequest("gridSize muss groesser als 0 und hoechstens 1000 x 1000 sein.");
        }

        JsonNode elements = document.get("elements");
        if (elements == null || !elements.isArray()) {
            throw badRequest("elements muss eine Liste sein.");
        }
        if (elements.size() > MAX_ELEMENTS) {
            throw badRequest("Layout darf hoechstens 5000 Elemente enthalten.");
        }

        Set<String> elementIds = new HashSet<>();
        Set<String> beaconIds = new HashSet<>();
        Set<String> beaconIdentities = new HashSet<>();
        for (int index = 0; index < elements.size(); index++) {
            JsonNode element = elements.get(index);
            String path = "elements[" + index + "]";
            if (!element.isObject()) {
                throw badRequest(path + " muss ein Objekt sein.");
            }
            JsonNode type = element.get("type");
            if (type == null || !type.isTextual() || type.asText().isBlank()) {
                throw badRequest(path + ".type ist erforderlich.");
            }
            if (type.asText().length() > MAX_TEXT_LENGTH) {
                throw badRequest(path + ".type ist zu lang.");
            }
            validateId(element.get("id"), elementIds, path);
            validateText(element, "label", path);
            validateText(element, "beaconId", path);
            validateText(element, "category", path);

            double x = requiredNumber(element, "x", path + ".x");
            double y = requiredNumber(element, "y", path + ".y");
            if (x < 0 || x > gridWidth || y < 0 || y > gridHeight) {
                throw badRequest(path + " liegt ausserhalb von gridSize.");
            }
            boolean beacon = "beacon".equals(type.asText());
            Double width = optionalDimension(element, "width", path, gridWidth, !beacon);
            Double height = optionalDimension(element, "height", path, gridHeight, !beacon);
            if (!beacon && (x + width > gridWidth || y + height > gridHeight)) {
                throw badRequest(path + " liegt mit seiner Flaeche ausserhalb von gridSize.");
            }
            optionalNumber(element, "rotation", path);
            if (beacon) {
                validateBeacon(element, beaconIds, beaconIdentities, path);
            }
        }
    }

    private void validateId(JsonNode id, Set<String> ids, String path) {
        if (id == null || id.isNull()) {
            return; // Older layout documents can omit element ids.
        }
        String key;
        if (id.isIntegralNumber() && id.canConvertToLong()) {
            key = "n:" + id.longValue();
        } else if (id.isTextual() && !id.asText().isBlank() && id.asText().length() <= MAX_TEXT_LENGTH) {
            key = "s:" + id.asText();
        } else {
            throw badRequest(path + ".id muss eine ganze Zahl oder ein kurzer Text sein.");
        }
        if (!ids.add(key)) {
            throw badRequest(path + ".id ist doppelt vorhanden.");
        }
    }

    private void validateText(JsonNode element, String field, String path) {
        JsonNode value = element.get(field);
        if (value != null && !value.isNull()
                && (!value.isTextual() || value.asText().length() > MAX_TEXT_LENGTH)) {
            throw badRequest(path + "." + field + " muss Text mit hoechstens 200 Zeichen sein.");
        }
    }

    private double requiredNumber(JsonNode parent, String field, String path) {
        JsonNode value = parent.get(field);
        if (value == null || !value.isNumber() || !Double.isFinite(value.doubleValue())) {
            throw badRequest(path + " muss eine endliche Zahl sein.");
        }
        return value.doubleValue();
    }

    private Double optionalNumber(JsonNode parent, String field, String path) {
        JsonNode value = parent.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        return requiredNumber(parent, field, path + "." + field);
    }

    private Double optionalDimension(JsonNode element, String field, String path, double maximum, boolean required) {
        Double value = optionalNumber(element, field, path);
        if (value == null) {
            if (required) {
                throw badRequest(path + "." + field + " ist erforderlich.");
            }
            return null;
        }
        if (value <= 0 || value > maximum) {
            throw badRequest(path + "." + field + " muss groesser als 0 und innerhalb von gridSize sein.");
        }
        return value;
    }

    private void validateBeacon(JsonNode element, Set<String> ids, Set<String> identities, String path) {
        String beaconId = textOrNull(element, "beaconId");
        if (beaconId != null && !beaconId.isBlank() && !ids.add(beaconId)) {
            throw badRequest(path + ".beaconId ist doppelt vorhanden.");
        }

        String identityKey = checkedTextOrNull(element, "identityKey", path);
        String uuid = checkedTextOrNull(element, "uuid", path);
        String beaconUuid = checkedTextOrNull(element, "beaconUUID", path);
        Integer major = integerOrNull(element, "major", path);
        Integer minor = integerOrNull(element, "minor", path);
        Integer beaconMajor = integerOrNull(element, "beaconMajor", path);
        Integer beaconMinor = integerOrNull(element, "beaconMinor", path);

        if (uuid != null && beaconUuid != null && !normalizeUuid(uuid, path).equals(normalizeUuid(beaconUuid, path))) {
            throw badRequest(path + " enthaelt widerspruechliche Beacon-UUIDs.");
        }
        if ((major != null && beaconMajor != null && !major.equals(beaconMajor))
                || (minor != null && beaconMinor != null && !minor.equals(beaconMinor))) {
            throw badRequest(path + " enthaelt widerspruechliche Beacon-Major/Minor-Werte.");
        }

        String effectiveUuid = uuid != null ? normalizeUuid(uuid, path)
                : beaconUuid != null ? normalizeUuid(beaconUuid, path) : null;
        Integer effectiveMajor = major != null ? major : beaconMajor;
        Integer effectiveMinor = minor != null ? minor : beaconMinor;
        if ((effectiveMajor == null) != (effectiveMinor == null)) {
            throw badRequest(path + " benoetigt Major und Minor gemeinsam.");
        }

        if (identityKey != null && !identityKey.isBlank()) {
            String[] parts = identityKey.split(":", -1);
            if (parts.length != 1 && parts.length != 3) {
                throw badRequest(path + ".identityKey ist ungueltig.");
            }
            String keyUuid = normalizeUuid(parts[0], path);
            String normalizedKey = keyUuid;
            if (parts.length == 3) {
                try {
                    normalizedKey = BeaconIdentityUtil.toIdentityKey(
                            keyUuid, Integer.valueOf(parts[1]), Integer.valueOf(parts[2]));
                } catch (NumberFormatException exception) {
                    throw badRequest(path + ".identityKey ist ungueltig.");
                }
            }
            if (effectiveUuid != null && !effectiveUuid.equals(keyUuid)) {
                throw badRequest(path + ".identityKey stimmt nicht mit der UUID ueberein.");
            }
            if (parts.length == 1 && effectiveMajor != null) {
                throw badRequest(path + ".identityKey enthaelt kein Major/Minor-Paar.");
            }
            if (parts.length == 3 && effectiveMajor != null
                    && !normalizedKey.equals(BeaconIdentityUtil.toIdentityKey(keyUuid, effectiveMajor, effectiveMinor))) {
                throw badRequest(path + ".identityKey stimmt nicht mit Major/Minor ueberein.");
            }
            effectiveUuid = keyUuid;
            if (parts.length == 3) {
                effectiveMajor = Integer.valueOf(parts[1]);
                effectiveMinor = Integer.valueOf(parts[2]);
            }
        }
        if (effectiveUuid != null) {
            String normalizedIdentity = BeaconIdentityUtil.toIdentityKey(effectiveUuid, effectiveMajor, effectiveMinor);
            if (!identities.add(normalizedIdentity)) {
                throw badRequest(path + ".identityKey ist doppelt vorhanden.");
            }
        }
    }

    private String textOrNull(JsonNode parent, String field) {
        JsonNode value = parent.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }

    private String checkedTextOrNull(JsonNode parent, String field, String path) {
        JsonNode value = parent.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        if (!value.isTextual() || value.asText().length() > MAX_TEXT_LENGTH) {
            throw badRequest(path + "." + field + " muss kurzer Text sein.");
        }
        return value.asText();
    }

    private Integer integerOrNull(JsonNode parent, String field, String path) {
        JsonNode value = parent.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        if (!value.isIntegralNumber() || !value.canConvertToInt()) {
            throw badRequest(path + "." + field + " muss eine ganze Zahl sein.");
        }
        return value.intValue();
    }

    private String normalizeUuid(String uuid, String path) {
        try {
            return BeaconIdentityUtil.normalizeUuid(uuid);
        } catch (IllegalArgumentException exception) {
            throw badRequest(path + " enthaelt eine ungueltige Beacon-UUID.");
        }
    }

    private WebApplicationException badRequest(String message) {
        return new WebApplicationException(message, Response.Status.BAD_REQUEST);
    }
}
