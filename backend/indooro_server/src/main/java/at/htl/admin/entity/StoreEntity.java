package at.htl.admin.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "stores")
public class StoreEntity extends AuditableEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "region_id", nullable = false)
    public RegionEntity region;

    @Column(name = "store_code", nullable = false, unique = true, length = 50)
    public String storeCode;

    @Column(nullable = false, length = 150)
    public String name;

    @Column(nullable = false, length = 150)
    public String street;

    @Column(name = "zip_code", nullable = false, length = 20)
    public String zipCode;

    @Column(nullable = false, length = 100)
    public String city;

    @Column(nullable = false, length = 100)
    public String country;

    @Column
    public Double latitude;

    @Column
    public Double longitude;

    @Column(columnDefinition = "TEXT")
    public String notes;

    /** Coverage profile of the readiness check: "market" (default) or a profile of coverage-rule.json. */
    @Column(name = "readiness_profile", nullable = false, length = 20)
    public String readinessProfile = "market";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    public RecordStatus status = RecordStatus.ACTIVE;

    @Column(name = "archived_at")
    public Instant archivedAt;
}
