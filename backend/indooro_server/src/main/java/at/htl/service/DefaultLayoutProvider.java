package at.htl.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.io.IOException;
import java.io.InputStream;
import java.util.Optional;

/**
 * Liefert das gebuendelte Standard-Layout ({@code default-layout.json}). Die Datei wird einmal geladen und
 * bei jedem Aufruf als Kopie herausgegeben, damit Aufrufer die Rueckgabe veraendern koennen.
 */
@ApplicationScoped
public class DefaultLayoutProvider {

    private static final String RESOURCE_NAME = "default-layout.json";

    private ObjectMapper objectMapper;

    /** Leer, wenn die Ressource fehlt. Erst beim ersten Zugriff gesetzt. */
    private volatile Optional<ObjectNode> template;

    /** Hash des gebuendelten Layouts, erst beim ersten Zugriff gesetzt. */
    private volatile String contentHash;

    @Inject
    public DefaultLayoutProvider(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /** Standard-Layout fuer eine Filiale: Kopie mit {@code shopName = storeName}. */
    public ObjectNode forStore(String storeName) {
        ObjectNode layout = template().map(ObjectNode::deepCopy).orElseGet(objectMapper::createObjectNode);
        layout.put("shopName", storeName);
        return layout;
    }

    /** Gebuendeltes Standard-Layout (Legacy-Fallback). Ohne Ressource ein leeres Objekt. */
    public ObjectNode bundled() {
        Optional<ObjectNode> loaded = template();
        ObjectNode layout = loaded.map(ObjectNode::deepCopy).orElseGet(objectMapper::createObjectNode);
        if (loaded.isPresent()) {
            layout.put("layoutId", "bundled-default");
            layout.put("recordType", "bundled");
        }
        return layout;
    }

    /**
     * SHA-256 (hex) des gebuendelten Standard-Layout-JSON. Einmal berechnet; Grundlage des ETag fuer das
     * Standard-Layout einer Filiale. Ohne Ressource der Hash des leeren Strings.
     */
    public String contentHash() {
        String cached = contentHash;
        if (cached != null) {
            return cached;
        }
        synchronized (this) {
            if (contentHash == null) {
                contentHash = LayoutEtag.sha256Hex(serializeTemplate());
            }
            return contentHash;
        }
    }

    private String serializeTemplate() {
        return template().map(layout -> {
            try {
                return objectMapper.writeValueAsString(layout);
            } catch (JsonProcessingException e) {
                throw new IllegalStateException("Standard-Layout konnte nicht serialisiert werden.", e);
            }
        }).orElse("");
    }

    private Optional<ObjectNode> template() {
        Optional<ObjectNode> cached = template;
        if (cached != null) {
            return cached;
        }
        synchronized (this) {
            if (template == null) {
                template = loadTemplate();
            }
            return template;
        }
    }

    private Optional<ObjectNode> loadTemplate() {
        try (InputStream input = Thread.currentThread().getContextClassLoader().getResourceAsStream(RESOURCE_NAME)) {
            if (input == null) {
                return Optional.empty();
            }
            return Optional.of((ObjectNode) objectMapper.readTree(input));
        } catch (IOException e) {
            throw new IllegalStateException("Standard-Layout konnte nicht geladen werden.", e);
        }
    }
}
