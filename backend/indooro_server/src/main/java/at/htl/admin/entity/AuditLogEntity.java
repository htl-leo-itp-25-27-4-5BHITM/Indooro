package at.htl.admin.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.UUID;

@Entity
@Table(name = "audit_logs")
public class AuditLogEntity extends AuditableEntity {

    @Column(name = "entity_type", nullable = false, length = 40)
    public String entityType;

    @Column(name = "entity_id", nullable = false)
    public UUID entityId;

    @Column(nullable = false, length = 40)
    public String action;

    @Column(name = "actor_role", length = 40)
    public String actorRole;

    @Column(name = "actor_label", length = 120)
    public String actorLabel;

    @Column(name = "actor_subject", length = 120)
    public String actorSubject;

    @Column(columnDefinition = "TEXT")
    public String summary;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "before_json", columnDefinition = "jsonb")
    public JsonNode beforeJson;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "after_json", columnDefinition = "jsonb")
    public JsonNode afterJson;
}
