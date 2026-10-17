package at.htl.admin.service;

import at.htl.admin.dto.AdminLogDtos;
import at.htl.admin.entity.AuditLogEntity;
import at.htl.admin.repository.AuditLogRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;

import java.util.UUID;
import java.util.List;

@ApplicationScoped
public class AuditLogService {

    @Inject
    AuditLogRepository auditLogRepository;

    @Inject
    ObjectMapper objectMapper;

    @Transactional
    public void log(String entityType,
                    UUID entityId,
                    String action,
                    String summary,
                    Object before,
                    Object after) {
        persist("SYSTEM", "system", entityType, entityId, action, summary, before, after);
    }

    /**
     * Schreibt einen Eintrag, der dem angemeldeten Admin-Benutzer zugeordnet wird.
     */
    @Transactional
    public void logByAdmin(CurrentAdminUser admin,
                           String entityType,
                           UUID entityId,
                           String action,
                           String summary,
                           Object before,
                           Object after) {
        persist(admin.role().value(), admin.username(), entityType, entityId, action, summary, before, after);
    }

    private void persist(String actorRole,
                         String actorLabel,
                         String entityType,
                         UUID entityId,
                         String action,
                         String summary,
                         Object before,
                         Object after) {
        AuditLogEntity entry = new AuditLogEntity();
        entry.entityType = entityType;
        entry.entityId = entityId;
        entry.action = action;
        entry.actorRole = actorRole;
        entry.actorLabel = actorLabel;
        entry.summary = summary;
        entry.beforeJson = toJson(before);
        entry.afterJson = toJson(after);
        auditLogRepository.persist(entry);
    }

    public AdminLogDtos.SystemLogResponse getRecentLogs(int limit) {
        int normalizedLimit = Math.min(Math.max(limit, 1), 100);
        List<AdminLogDtos.SystemLogEntry> entries = auditLogRepository.listRecent(normalizedLimit).stream()
                .map(this::toSystemLogEntry)
                .toList();
        return new AdminLogDtos.SystemLogResponse(normalizedLimit, entries);
    }

    private JsonNode toJson(Object value) {
        if (value == null) {
            return null;
        }
        return objectMapper.valueToTree(value);
    }

    private AdminLogDtos.SystemLogEntry toSystemLogEntry(AuditLogEntity entry) {
        return new AdminLogDtos.SystemLogEntry(
                entry.id,
                entry.entityType,
                entry.entityId,
                entry.action,
                entry.summary,
                entry.actorRole,
                entry.actorLabel,
                entry.createdAt
        );
    }
}
