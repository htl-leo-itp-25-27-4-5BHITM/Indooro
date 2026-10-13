package at.htl.admin.service;

import at.htl.admin.dto.LayoutDtos;
import at.htl.admin.entity.BeaconAssignmentEntity;
import at.htl.admin.entity.LayoutVersionEntity;
import at.htl.admin.entity.LayoutVersionStatus;
import at.htl.admin.entity.StoreEntity;
import at.htl.admin.repository.BeaconAssignmentRepository;
import at.htl.admin.repository.LayoutVersionRepository;
import at.htl.service.LayoutDocumentValidator;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.NotFoundException;

import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@ApplicationScoped
public class StoreLayoutAdminService {

    @Inject
    LayoutVersionRepository layoutVersionRepository;

    @Inject
    BeaconAssignmentRepository beaconAssignmentRepository;

    @Inject
    StoreAdminService storeAdminService;

    @Inject
    ObjectMapper objectMapper;

    @Inject
    LayoutDocumentValidator layoutDocumentValidator;

    @Inject
    AuditLogService auditLogService;

    @Inject
    AdminAccessService adminAccessService;

    public LayoutDtos.StoreLayoutResponse getCurrentLayout(UUID storeId) {
        adminAccessService.requireStoreAccess(storeId);
        StoreEntity store = storeAdminService.requireStore(storeId);
        return layoutVersionRepository.findActiveByStoreId(storeId)
                .map(this::toLayoutResponse)
                .orElseGet(() -> new LayoutDtos.StoreLayoutResponse(
                        null,
                        store.id,
                        null,
                        "DEFAULT",
                        null,
                        null,
                        loadDefaultLayout(store.name)
                ));
    }

    public List<LayoutDtos.LayoutVersionSummary> listLayoutVersions(UUID storeId) {
        adminAccessService.requireStoreAccess(storeId);
        storeAdminService.requireStore(storeId);
        return layoutVersionRepository.listByStoreId(storeId)
                .stream()
                .map(this::toVersionSummary)
                .toList();
    }

    public LayoutDtos.StoreLayoutResponse getLayoutVersion(UUID storeId, UUID layoutId) {
        adminAccessService.requireStoreAccess(storeId);
        storeAdminService.requireStore(storeId);
        LayoutVersionEntity entity = layoutVersionRepository.findByStoreAndId(storeId, layoutId)
                .orElseThrow(() -> new NotFoundException("Layout-Version nicht gefunden."));
        return toLayoutResponse(entity);
    }

    @Transactional
    public LayoutDtos.StoreLayoutResponse saveLayoutVersion(UUID storeId, LayoutDtos.LayoutSaveRequest request) {
        adminAccessService.requireStoreAccess(storeId);
        layoutDocumentValidator.validate(request == null ? null : request.layout());
        // Serialize version numbering and active-version transitions for this store.
        StoreEntity store = storeAdminService.lockStore(storeId);
        LayoutVersionEntity activeLayout = layoutVersionRepository.findActiveByStoreId(storeId).orElse(null);
        // An explicit false is a draft even for a new store. Omitted/null retains the
        // historical first-save behavior for existing API clients.
        boolean shouldActivate = Boolean.TRUE.equals(request.activate())
                || request.activate() == null && activeLayout == null;

        if (shouldActivate) {
            validateAssignedBeacons(storeId, request.layout());
        }

        if (shouldActivate && activeLayout != null) {
            activeLayout.status = LayoutVersionStatus.ARCHIVED;
            // The partial unique index permits only one ACTIVE row. Flush the archive
            // before Hibernate inserts the replacement; update ordering is not guaranteed.
            layoutVersionRepository.flush();
        }

        LayoutVersionEntity entity = new LayoutVersionEntity();
        entity.store = store;
        entity.versionNo = layoutVersionRepository.nextVersionNo(storeId);
        entity.layoutName = trimToNull(request.layoutName());
        entity.changeNote = trimToNull(request.changeNote());
        entity.layoutJson = normalizeLayout(request.layout(), store.name);
        entity.status = shouldActivate ? LayoutVersionStatus.ACTIVE : LayoutVersionStatus.DRAFT;
        entity.createdByRole = "SYSTEM";
        entity.createdByLabel = "system";
        entity.activatedAt = shouldActivate ? Instant.now() : null;
        layoutVersionRepository.persist(entity);

        LayoutDtos.StoreLayoutResponse response = toLayoutResponse(entity);
        auditLogService.log("LAYOUT", entity.id, shouldActivate ? "ACTIVATE" : "CREATE", "Layout-Version gespeichert", null, response);
        return response;
    }

    @Transactional
    public LayoutDtos.StoreLayoutResponse activateLayoutVersion(UUID storeId, UUID layoutId) {
        adminAccessService.requireStoreAccess(storeId);
        storeAdminService.lockStore(storeId);
        LayoutVersionEntity entity = layoutVersionRepository.findByStoreAndId(storeId, layoutId)
                .orElseThrow(() -> new NotFoundException("Layout-Version nicht gefunden."));
        layoutDocumentValidator.validate(entity.layoutJson);
        validateAssignedBeacons(storeId, entity.layoutJson);

        layoutVersionRepository.findActiveByStoreId(storeId)
                .filter(active -> !active.id.equals(layoutId))
                .ifPresent(active -> {
                    active.status = LayoutVersionStatus.ARCHIVED;
                    layoutVersionRepository.flush();
                });

        entity.status = LayoutVersionStatus.ACTIVE;
        entity.activatedAt = Instant.now();
        LayoutDtos.StoreLayoutResponse response = toLayoutResponse(entity);
        auditLogService.log("LAYOUT", entity.id, "ACTIVATE", "Layout-Version aktiviert", null, response);
        return response;
    }

    public LayoutDtos.EditorContextResponse getEditorContext(UUID storeId) {
        adminAccessService.requireStoreAccess(storeId);
        StoreEntity store = storeAdminService.requireStore(storeId);
        LayoutVersionEntity active = layoutVersionRepository.findActiveByStoreId(storeId).orElse(null);
        LayoutVersionEntity latestDraft = layoutVersionRepository.listByStoreId(storeId).stream()
                .filter(version -> version.status == LayoutVersionStatus.DRAFT)
                .findFirst()
                .orElse(null);
        LayoutDtos.StoreLayoutResponse editable = latestDraft != null
                && (active == null || latestDraft.versionNo > active.versionNo)
                ? toLayoutResponse(latestDraft)
                : active != null ? toLayoutResponse(active) : getCurrentLayout(storeId);
        List<LayoutDtos.EditorBeaconResponse> beacons = beaconAssignmentRepository.listActiveByStoreId(storeId)
                .stream()
                .map(this::toEditorBeacon)
                .toList();

        return new LayoutDtos.EditorContextResponse(
                new LayoutDtos.StoreEditorReference(store.id, store.storeCode, store.name),
                editable,
                beacons
        );
    }

    private LayoutDtos.StoreLayoutResponse toLayoutResponse(LayoutVersionEntity entity) {
        return new LayoutDtos.StoreLayoutResponse(
                entity.id,
                entity.store.id,
                entity.versionNo,
                entity.status.name(),
                entity.createdAt,
                entity.activatedAt,
                entity.layoutJson
        );
    }

    private void validateAssignedBeacons(UUID storeId, JsonNode layout) {
        Set<String> assigned = new HashSet<>();
        for (BeaconAssignmentEntity assignment : beaconAssignmentRepository.listActiveByStoreId(storeId)) {
            if (assignment.beacon.id != null) assigned.add(assignment.beacon.id.toString());
            if (assignment.beacon.beaconCode != null) assigned.add(assignment.beacon.beaconCode);
            if (assignment.beacon.identityKey != null) assigned.add(assignment.beacon.identityKey);
        }
        for (JsonNode element : layout.path("elements")) {
            if (!"beacon".equals(element.path("type").asText())) continue;
            String beaconId = element.path("beaconId").asText("").trim();
            if (beaconId.isEmpty()) beaconId = element.path("beaconCode").asText("").trim();
            if (beaconId.isEmpty()) beaconId = element.path("identityKey").asText("").trim();
            if (beaconId.isEmpty() || !assigned.contains(beaconId)) {
                throw new BadRequestException("Layout-Beacon ist dieser Filiale nicht zugeordnet: " + beaconId);
            }
        }
    }

    private LayoutDtos.LayoutVersionSummary toVersionSummary(LayoutVersionEntity entity) {
        return new LayoutDtos.LayoutVersionSummary(
                entity.id,
                entity.versionNo,
                entity.layoutName,
                entity.status.name(),
                entity.createdAt,
                entity.activatedAt
        );
    }

    private LayoutDtos.EditorBeaconResponse toEditorBeacon(BeaconAssignmentEntity assignment) {
        return new LayoutDtos.EditorBeaconResponse(
                assignment.beacon.id,
                assignment.beacon.beaconCode,
                assignment.beacon.identityKey,
                assignment.beacon.uuid,
                assignment.beacon.major,
                assignment.beacon.minor
        );
    }

    private JsonNode normalizeLayout(JsonNode layout, String storeName) {
        ObjectNode document = layout != null && layout.isObject()
                ? ((ObjectNode) layout).deepCopy()
                : objectMapper.createObjectNode();

        if (!document.hasNonNull("shopName")) {
            document.put("shopName", storeName);
        }
        if (!document.hasNonNull("exportDate")) {
            document.put("exportDate", Instant.now().toString());
        }
        return document;
    }

    private JsonNode loadDefaultLayout(String storeName) {
        try (InputStream input = Thread.currentThread().getContextClassLoader().getResourceAsStream("default-layout.json")) {
            if (input == null) {
                ObjectNode fallback = objectMapper.createObjectNode();
                fallback.put("shopName", storeName);
                return fallback;
            }
            ObjectNode layout = (ObjectNode) objectMapper.readTree(input);
            layout.put("shopName", storeName);
            return layout;
        } catch (IOException e) {
            throw new IllegalStateException("Standard-Layout konnte nicht geladen werden.", e);
        }
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
