package at.htl.admin.service;

import at.htl.admin.dto.AdminLogDtos;
import at.htl.admin.entity.AuditLogEntity;
import at.htl.admin.repository.AuditLogRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.jboss.logging.Logger;

import java.util.UUID;
import java.util.List;

@ApplicationScoped
public class AuditLogService {

    private static final Logger LOG = Logger.getLogger(AuditLogService.class);
    private static final int MAX_SUBJECT_LENGTH = 120;

    /**
     * Akteur eines Audit-Eintrags. Ohne angemeldeten Admin-Benutzer gilt {@link #SYSTEM}.
     */
    public record Actor(String role, String label, String subject) {

        public static final Actor SYSTEM = new Actor("SYSTEM", "system", null);
    }

    @Inject
    AuditLogRepository auditLogRepository;

    @Inject
    ObjectMapper objectMapper;

    @Inject
    SecurityIdentity identity;

    @Inject
    AdminAccessService adminAccessService;

    @Transactional
    public void log(String entityType,
                    UUID entityId,
                    String action,
                    String summary,
                    Object before,
                    Object after) {
        Actor actor = currentActor();
        persist(actor.role(), actor.label(), actor.subject(), entityType, entityId, action, summary, before, after);
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
        persist(admin.role().value(), admin.username(), admin.subject(), entityType, entityId, action, summary, before, after);
    }

    /**
     * Ermittelt den Akteur wie {@link #log}: angemeldeter Admin-Benutzer oder {@link Actor#SYSTEM}.
     * Wirft nicht; anonyme oder nicht aufloesbare Identitaeten ergeben SYSTEM.
     */
    public Actor currentActor() {
        if (identity == null || identity.isAnonymous()) {
            return Actor.SYSTEM;
        }
        try {
            CurrentAdminUser admin = adminAccessService.currentUser();
            if (admin == null || admin.role() == null) {
                return Actor.SYSTEM;
            }
            return new Actor(admin.role().value(), admin.username(), admin.subject());
        } catch (RuntimeException exception) {
            LOG.debug("Audit-Akteur nicht aufloesbar, Eintrag wird dem System zugeordnet", exception);
            return Actor.SYSTEM;
        }
    }

    private void persist(String actorRole,
                         String actorLabel,
                         String actorSubject,
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
        entry.actorSubject = truncate(actorSubject);
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

    private static String truncate(String value) {
        if (value == null || value.length() <= MAX_SUBJECT_LENGTH) {
            return value;
        }
        return value.substring(0, MAX_SUBJECT_LENGTH);
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
