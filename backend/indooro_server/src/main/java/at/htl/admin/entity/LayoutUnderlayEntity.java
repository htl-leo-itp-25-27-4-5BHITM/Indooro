package at.htl.admin.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "layout_underlays")
public class LayoutUnderlayEntity {
    @Id
    @Column(name = "store_id", nullable = false)
    public UUID storeId;

    @Column(name = "content_type", nullable = false, length = 20)
    public String contentType;

    @JdbcTypeCode(SqlTypes.VARBINARY)
    @Column(name = "bytes", nullable = false, columnDefinition = "bytea")
    public byte[] bytes;

    @Column(name = "width_px", nullable = false)
    public int widthPx;

    @Column(name = "height_px", nullable = false)
    public int heightPx;

    @Column(name = "scale_m_per_px", precision = 16, scale = 10)
    public BigDecimal scaleMPerPx;

    @Column(name = "offset_x_m", nullable = false, precision = 14, scale = 6)
    public BigDecimal offsetXM = BigDecimal.ZERO;

    @Column(name = "offset_y_m", nullable = false, precision = 14, scale = 6)
    public BigDecimal offsetYM = BigDecimal.ZERO;

    @Column(name = "rotation_deg", nullable = false, precision = 9, scale = 4)
    public BigDecimal rotationDeg = BigDecimal.ZERO;

    @Column(nullable = false, precision = 4, scale = 3)
    public BigDecimal opacity = new BigDecimal("0.5");

    @Column(nullable = false)
    public boolean locked;

    @Column(name = "updated_at", nullable = false)
    public Instant updatedAt;

    @Column(name = "updated_by", nullable = false, length = 120)
    public String updatedBy;
}
