package at.htl.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;

/**
 * ETag-Werte fuer das mobile Layout. Der Wert ist der SHA-256-Hex-String; die Quotierung setzt JAX-RS
 * ({@code EntityTag}). Aenderungen nur ueber Aktivierung moeglich, Versionen sind unveraenderlich.
 */
public final class LayoutEtag {

    private LayoutEtag() {
    }

    /** ETag eines aktiven Layouts: SHA-256 von {@code layoutId:activatedAt}. */
    public static String ofActiveLayout(UUID layoutId, Instant activatedAt) {
        return sha256Hex(layoutId + ":" + activatedAt);
    }

    /** ETag des Standard-Layouts einer Filiale; enthaelt Filialname und Hash des gebuendelten Layouts. */
    public static String ofDefaultLayout(UUID storeId, String storeName, String bundledHash) {
        return sha256Hex("default:" + storeId + ":" + storeName + ":" + bundledHash);
    }

    /**
     * Prueft einen {@code If-None-Match}-Header gegen den aktuellen ETag. Unterstuetzt {@code *}, Listen
     * (kommagetrennt) und das {@code W/}-Praefix (schwacher Vergleich, RFC 9110).
     */
    public static boolean matches(String ifNoneMatch, String etag) {
        if (ifNoneMatch == null || ifNoneMatch.isBlank() || etag == null) {
            return false;
        }
        for (String candidate : ifNoneMatch.split(",")) {
            String value = candidate.trim();
            if ("*".equals(value)) {
                return true;
            }
            if (value.startsWith("W/")) {
                value = value.substring(2);
            }
            if (unquote(value).equals(etag)) {
                return true;
            }
        }
        return false;
    }

    static String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 ist in dieser JVM nicht verfuegbar.", e);
        }
    }

    private static String unquote(String value) {
        if (value.length() >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
            return value.substring(1, value.length() - 1);
        }
        return value;
    }
}
