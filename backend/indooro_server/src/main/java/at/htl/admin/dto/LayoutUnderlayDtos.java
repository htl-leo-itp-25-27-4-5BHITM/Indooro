package at.htl.admin.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public final class LayoutUnderlayDtos {
    private LayoutUnderlayDtos() {}

    public record SaveRequest(String contentType, String imageBase64, BigDecimal scaleMPerPx,
                              BigDecimal offsetXM, BigDecimal offsetYM, BigDecimal rotationDeg,
                              BigDecimal opacity, Boolean locked) {}

    public record Response(UUID storeId, String contentType, String imageBase64,
                           int widthPx, int heightPx, BigDecimal scaleMPerPx,
                           BigDecimal offsetXM, BigDecimal offsetYM, BigDecimal rotationDeg,
                           BigDecimal opacity, boolean locked, Instant updatedAt) {}
}
