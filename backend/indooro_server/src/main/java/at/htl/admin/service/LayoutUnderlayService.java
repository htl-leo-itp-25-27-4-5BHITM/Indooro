package at.htl.admin.service;

import at.htl.admin.dto.LayoutUnderlayDtos;
import at.htl.admin.entity.LayoutUnderlayEntity;
import at.htl.admin.repository.LayoutUnderlayRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.WebApplicationException;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Base64;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@ApplicationScoped
public class LayoutUnderlayService {
    private static final int MAX_BYTES = 10 * 1024 * 1024;
    private static final int MAX_SIDE = 8000;

    @Inject LayoutUnderlayRepository repository;
    @Inject AdminAccessService access;
    @Inject StoreAdminService stores;
    @Inject AuditLogService audit;

    public LayoutUnderlayDtos.Response get(UUID storeId) {
        checkStore(storeId);
        return toResponse(repository.findByIdOptional(storeId)
                .orElseThrow(() -> new NotFoundException("Kein Grundrissbild fuer diese Filiale vorhanden.")));
    }

    @Transactional
    public LayoutUnderlayDtos.Response save(UUID storeId, LayoutUnderlayDtos.SaveRequest request) {
        checkStore(storeId);
        if (request == null) throw new BadRequestException("Grundrissdaten fehlen.");
        stores.lockStore(storeId);
        LayoutUnderlayEntity entity = repository.findById(storeId);
        boolean created = entity == null;
        if (created) {
            entity = new LayoutUnderlayEntity();
            entity.storeId = storeId;
        }
        Map<String, Object> before = created ? null : metadata(entity);
        if (request.imageBase64() != null) {
            if (!"image/png".equals(request.contentType()) && !"image/jpeg".equals(request.contentType())) {
                throw new WebApplicationException("Nur PNG und JPEG sind erlaubt.", 415);
            }
            // Reject oversized input before allocating the decoded byte array.
            if (request.imageBase64().length() > ((MAX_BYTES + 2L) / 3L) * 4L + 4L) {
                throw new WebApplicationException("Grundrissbild ist groesser als 10 MB.", 413);
            }
            byte[] bytes;
            try {
                bytes = Base64.getDecoder().decode(request.imageBase64());
            } catch (IllegalArgumentException exception) {
                throw new BadRequestException("Bilddaten sind kein gueltiges Base64.");
            }
            if (bytes.length == 0 || bytes.length > MAX_BYTES) {
                throw new WebApplicationException("Grundrissbild ist leer oder groesser als 10 MB.", 413);
            }
            if (!hasMagic(bytes, request.contentType())) {
                throw new WebApplicationException("Bildformat und Inhalt stimmen nicht ueberein.", 415);
            }
            int[] dimensions = dimensions(bytes);
            entity.contentType = request.contentType();
            entity.bytes = bytes;
            entity.widthPx = dimensions[0];
            entity.heightPx = dimensions[1];
            if (!created) entity.scaleMPerPx = null; // new image needs fresh calibration
        } else if (created) {
            throw new BadRequestException("Bilddaten fehlen.");
        } else if (request.contentType() != null && !request.contentType().equals(entity.contentType)) {
            throw new BadRequestException("Bildformat kann ohne Bilddaten nicht geaendert werden.");
        }
        if (request.scaleMPerPx() != null) entity.scaleMPerPx = checked(request.scaleMPerPx(), 16, 10, true, "Massstab");
        if (request.offsetXM() != null) entity.offsetXM = checked(request.offsetXM(), 14, 6, false, "X-Versatz");
        if (request.offsetYM() != null) entity.offsetYM = checked(request.offsetYM(), 14, 6, false, "Y-Versatz");
        if (request.rotationDeg() != null) entity.rotationDeg = checked(request.rotationDeg(), 9, 4, false, "Drehung");
        if (request.opacity() != null) {
            entity.opacity = checked(request.opacity(), 4, 3, false, "Deckkraft");
            if (entity.opacity.compareTo(BigDecimal.ZERO) < 0 || entity.opacity.compareTo(BigDecimal.ONE) > 0) {
                throw new BadRequestException("Deckkraft muss zwischen 0 und 1 liegen.");
            }
        }
        if (request.locked() != null) entity.locked = request.locked();
        entity.updatedAt = Instant.now();
        String subject = access.currentUser().subject();
        entity.updatedBy = subject.substring(0, Math.min(subject.length(), 120));
        if (created) repository.persist(entity);
        audit.log("LAYOUT_UNDERLAY", storeId, created ? "CREATE" : "UPDATE",
                "Grundrissbild gespeichert.", before, metadata(entity));
        return toResponse(entity);
    }

    @Transactional
    public void delete(UUID storeId) {
        checkStore(storeId);
        stores.lockStore(storeId);
        LayoutUnderlayEntity entity = repository.findByIdOptional(storeId)
                .orElseThrow(() -> new NotFoundException("Kein Grundrissbild fuer diese Filiale vorhanden."));
        Map<String, Object> before = metadata(entity);
        repository.delete(entity);
        audit.log("LAYOUT_UNDERLAY", storeId, "DELETE", "Grundrissbild entfernt.", before, null);
    }

    private void checkStore(UUID storeId) {
        access.requireStoreAccess(storeId);
        stores.requireStore(storeId);
    }

    private static BigDecimal checked(BigDecimal value, int precision, int scale, boolean positive, String name) {
        if ((positive && value.signum() <= 0) || value.scale() > scale || value.precision() - value.scale() > precision - scale) {
            throw new BadRequestException(name + " ist ausserhalb des erlaubten Bereichs.");
        }
        return value;
    }

    private static boolean hasMagic(byte[] bytes, String type) {
        if ("image/png".equals(type)) {
            byte[] png = {(byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a};
            if (bytes.length < png.length) return false;
            for (int i = 0; i < png.length; i++) if (bytes[i] != png[i]) return false;
            return true;
        }
        return bytes.length >= 4 && (bytes[0] & 0xff) == 0xff && (bytes[1] & 0xff) == 0xd8
                && (bytes[2] & 0xff) == 0xff && (bytes[bytes.length - 2] & 0xff) == 0xff
                && (bytes[bytes.length - 1] & 0xff) == 0xd9;
    }

    private static int[] dimensions(byte[] bytes) {
        try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw new WebApplicationException("Bildformat wird nicht unterstuetzt.", 415);
            ImageReader reader = readers.next();
            try {
                reader.setInput(input, true, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE) {
                    throw new WebApplicationException("Bildabmessungen duerfen 8000 Pixel nicht ueberschreiten.", 413);
                }
                return new int[] {width, height};
            } finally {
                reader.dispose();
            }
        } catch (IOException exception) {
            throw new WebApplicationException("Bilddaten sind ungueltig.", 415);
        }
    }

    private static Map<String, Object> metadata(LayoutUnderlayEntity entity) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("storeId", entity.storeId);
        result.put("contentType", entity.contentType);
        result.put("widthPx", entity.widthPx);
        result.put("heightPx", entity.heightPx);
        result.put("scaleMPerPx", entity.scaleMPerPx);
        result.put("offsetXM", entity.offsetXM);
        result.put("offsetYM", entity.offsetYM);
        result.put("rotationDeg", entity.rotationDeg);
        result.put("opacity", entity.opacity);
        result.put("locked", entity.locked);
        result.put("updatedAt", entity.updatedAt);
        return result;
    }

    private static LayoutUnderlayDtos.Response toResponse(LayoutUnderlayEntity entity) {
        return new LayoutUnderlayDtos.Response(entity.storeId, entity.contentType,
                Base64.getEncoder().encodeToString(entity.bytes), entity.widthPx, entity.heightPx,
                entity.scaleMPerPx, entity.offsetXM, entity.offsetYM, entity.rotationDeg,
                entity.opacity, entity.locked, entity.updatedAt);
    }
}
