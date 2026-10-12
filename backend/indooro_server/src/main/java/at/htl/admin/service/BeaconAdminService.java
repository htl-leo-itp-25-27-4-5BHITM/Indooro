package at.htl.admin.service;

import at.htl.admin.dto.BeaconDtos;
import at.htl.admin.entity.BeaconAssignmentEntity;
import at.htl.admin.entity.BeaconEntity;
import at.htl.admin.entity.RecordStatus;
import at.htl.admin.entity.StoreEntity;
import at.htl.admin.repository.BeaconAssignmentRepository;
import at.htl.admin.repository.BeaconRepository;
import at.htl.admin.repository.StoreRepository;
import at.htl.admin.util.BeaconIdentityUtil;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@ApplicationScoped
public class BeaconAdminService {

    @Inject
    BeaconRepository beaconRepository;

    @Inject
    BeaconAssignmentRepository beaconAssignmentRepository;

    @Inject
    StoreRepository storeRepository;

    @Inject
    AuditLogService auditLogService;

    @Inject
    AdminAccessService adminAccessService;

    public List<BeaconDtos.BeaconResponse> listBeacons(RecordStatus status, Boolean assigned, UUID storeId, String query) {
        UUID effectiveStoreId = adminAccessService.effectiveStoreFilter(storeId);
        List<BeaconEntity> candidates = listBeaconCandidates(status, query);
        Map<UUID, BeaconAssignmentEntity> activeAssignments = beaconAssignmentRepository.listActiveAssignments()
                .stream()
                .collect(Collectors.toMap(assignment -> assignment.beacon.id, Function.identity(), (left, right) -> left, HashMap::new));

        return candidates.stream()
                .map(beacon -> toResponse(beacon, activeAssignments.get(beacon.id)))
                .filter(response -> filterAssigned(response, assigned, effectiveStoreId))
                .filter(this::filterVisible)
                .sorted(Comparator.comparing(BeaconDtos.BeaconResponse::beaconCode, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    public List<BeaconDtos.BeaconResponse> listFreeBeacons() {
        return listBeacons(RecordStatus.ACTIVE, false, null, null);
    }

    public BeaconDtos.BeaconResponse getBeacon(UUID beaconId) {
        BeaconEntity beacon = requireBeacon(beaconId);
        BeaconAssignmentEntity assignment = beaconAssignmentRepository.findActiveByBeaconId(beaconId).orElse(null);
        requireBeaconAccess(assignment);
        return toResponse(beacon, assignment);
    }

    @Transactional
    public BeaconDtos.BeaconResponse createBeacon(BeaconDtos.BeaconCreateRequest request) {
        adminAccessService.requireAdmin();
        String normalizedUuid = validateAndNormalizeIdentity(request.uuid(), request.major(), request.minor());
        ensureBeaconCodeIsAvailable(request.beaconCode(), null);
        String identityKey = BeaconIdentityUtil.toIdentityKey(normalizedUuid, request.major(), request.minor());
        ensureIdentityKeyIsAvailable(identityKey, null);

        BeaconEntity beacon = new BeaconEntity();
        beacon.beaconCode = request.beaconCode().trim();
        beacon.uuid = normalizedUuid;
        beacon.major = request.major();
        beacon.minor = request.minor();
        beacon.identityKey = identityKey;
        beacon.notes = trimToNull(request.notes());
        beacon.status = RecordStatus.ACTIVE;
        beaconRepository.persist(beacon);

        BeaconDtos.BeaconResponse response = toResponse(beacon, null);
        auditLogService.log("BEACON", beacon.id, "CREATE", "Beacon angelegt", null, response);
        return response;
    }

    @Transactional
    public BeaconDtos.BeaconResponse updateBeacon(UUID beaconId, BeaconDtos.BeaconCreateRequest request) {
        BeaconEntity beacon = requireBeacon(beaconId);
        BeaconAssignmentEntity assignment = beaconAssignmentRepository.findActiveByBeaconId(beaconId).orElse(null);
        requireBeaconAccess(assignment);
        BeaconDtos.BeaconResponse before = toResponse(beacon, assignment);

        String normalizedUuid = validateAndNormalizeIdentity(request.uuid(), request.major(), request.minor());
        ensureBeaconCodeIsAvailable(request.beaconCode(), beaconId);
        String identityKey = BeaconIdentityUtil.toIdentityKey(normalizedUuid, request.major(), request.minor());
        ensureIdentityKeyIsAvailable(identityKey, beaconId);

        beacon.beaconCode = request.beaconCode().trim();
        beacon.uuid = normalizedUuid;
        beacon.major = request.major();
        beacon.minor = request.minor();
        beacon.identityKey = identityKey;
        beacon.notes = trimToNull(request.notes());

        BeaconDtos.BeaconResponse after = toResponse(beacon, beaconAssignmentRepository.findActiveByBeaconId(beaconId).orElse(null));
        auditLogService.log("BEACON", beacon.id, "UPDATE", "Beacon aktualisiert", before, after);
        return after;
    }

    @Transactional
    public BeaconDtos.BeaconResponse archiveBeacon(UUID beaconId) {
        BeaconEntity beacon = requireBeacon(beaconId);
        BeaconAssignmentEntity activeAssignment = beaconAssignmentRepository.findActiveByBeaconId(beaconId).orElse(null);
        requireBeaconAccess(activeAssignment);
        BeaconDtos.BeaconResponse before = toResponse(beacon, activeAssignment);

        if (activeAssignment != null) {
            BeaconAssignmentEntity assignment = activeAssignment;
            assignment.isActive = false;
            assignment.releasedAt = Instant.now();
        }

        beacon.status = RecordStatus.ARCHIVED;
        BeaconDtos.BeaconResponse after = toResponse(beacon, null);
        auditLogService.log("BEACON", beacon.id, "ARCHIVE", "Beacon archiviert", before, after);
        return after;
    }

    @Transactional
    public BeaconDtos.BeaconBulkCreateResponse bulkCreate(BeaconDtos.BeaconBulkCreateRequest request) {
        adminAccessService.requireAdmin();
        if (request.items() == null || request.items().isEmpty()) {
            throw new WebApplicationException("Mindestens ein Beacon muss angelegt werden.", Response.Status.BAD_REQUEST);
        }

        List<BeaconDtos.BeaconResponse> created = new ArrayList<>();
        for (BeaconDtos.BeaconBulkItemRequest item : request.items()) {
            BeaconDtos.BeaconCreateRequest createRequest = new BeaconDtos.BeaconCreateRequest(
                    item.beaconCode(),
                    request.uuid(),
                    request.major(),
                    item.minor(),
                    request.notes()
            );
            created.add(createBeacon(createRequest));
        }

        return new BeaconDtos.BeaconBulkCreateResponse(created.size(), created);
    }

    @Transactional
    public BeaconDtos.BeaconAssignmentResponse assignBeacon(UUID beaconId, UUID storeId) {
        BeaconEntity beacon = requireActiveBeacon(beaconId);
        StoreEntity store = requireActiveStore(storeId);
        adminAccessService.requireStoreAccess(store.id);

        BeaconAssignmentEntity currentAssignment = beaconAssignmentRepository.findActiveByBeaconId(beaconId).orElse(null);
        requireBeaconAccess(currentAssignment, true);
        if (currentAssignment != null && currentAssignment.store.id.equals(storeId)) {
            return toAssignmentResponse(currentAssignment);
        }

        if (currentAssignment != null) {
            currentAssignment.isActive = false;
            currentAssignment.releasedAt = Instant.now();
        }

        BeaconAssignmentEntity newAssignment = new BeaconAssignmentEntity();
        newAssignment.beacon = beacon;
        newAssignment.store = store;
        newAssignment.isActive = true;
        beaconAssignmentRepository.persist(newAssignment);

        BeaconDtos.BeaconAssignmentResponse response = toAssignmentResponse(newAssignment);
        auditLogService.log("BEACON", beacon.id, "ASSIGN", "Beacon einer Filiale zugeordnet", null, response);
        return response;
    }

    @Transactional
    public Map<String, Object> releaseBeacon(UUID beaconId) {
        BeaconEntity beacon = requireBeacon(beaconId);
        BeaconAssignmentEntity assignment = beaconAssignmentRepository.findActiveByBeaconId(beaconId).orElse(null);
        if (assignment == null) {
            adminAccessService.requireAdmin();
            return Map.of("beaconId", beacon.id, "released", false);
        }
        requireBeaconAccess(assignment);

        assignment.isActive = false;
        assignment.releasedAt = Instant.now();
        auditLogService.log("BEACON", beacon.id, "RELEASE", "Beacon freigegeben", toAssignmentResponse(assignment), Map.of("released", true));
        return Map.of("beaconId", beacon.id, "released", true);
    }

    private List<BeaconEntity> listBeaconCandidates(RecordStatus status, String query) {
        StringBuilder hql = new StringBuilder("1 = 1");
        Map<String, Object> params = new HashMap<>();

        RecordStatus effectiveStatus = status == null ? RecordStatus.ACTIVE : status;
        hql.append(" and status = :status");
        params.put("status", effectiveStatus);

        if (query != null && !query.isBlank()) {
            hql.append(" and (lower(beaconCode) like :query or lower(identityKey) like :query)");
            params.put("query", "%" + query.trim().toLowerCase() + "%");
        }

        return beaconRepository.find(hql.toString(), params).list();
    }

    private boolean filterAssigned(BeaconDtos.BeaconResponse response, Boolean assigned, UUID storeId) {
        if (assigned != null) {
            boolean hasStore = response.currentStore() != null;
            if (assigned != hasStore) {
                return false;
            }
        }

        if (storeId != null) {
            return response.currentStore() != null && storeId.equals(response.currentStore().id());
        }

        return true;
    }

    private boolean filterVisible(BeaconDtos.BeaconResponse response) {
        if (response.currentStore() == null) {
            return adminAccessService.canSeeBeaconStore(null);
        }
        StoreEntity store = storeRepository.findByIdOptional(response.currentStore().id()).orElse(null);
        return adminAccessService.canSeeBeaconStore(store);
    }

    private void requireBeaconAccess(BeaconAssignmentEntity assignment) {
        requireBeaconAccess(assignment, false);
    }

    private void requireBeaconAccess(BeaconAssignmentEntity assignment, boolean allowUnassignedForScopedStoreAction) {
        if (assignment == null) {
            if (allowUnassignedForScopedStoreAction) {
                adminAccessService.currentUser();
                return;
            }
            adminAccessService.requireAdmin();
            return;
        }
        adminAccessService.requireStoreAccess(assignment.store.id);
    }

    private String validateAndNormalizeIdentity(String uuid, Integer major, Integer minor) {
        if (uuid == null || uuid.isBlank()) {
            throw new WebApplicationException("Beacon UUID ist erforderlich.", Response.Status.BAD_REQUEST);
        }
        if ((major == null) != (minor == null)) {
            throw new WebApplicationException("Major und Minor muessen entweder beide gesetzt oder beide leer sein.", Response.Status.BAD_REQUEST);
        }
        try {
            return BeaconIdentityUtil.normalizeUuid(uuid);
        } catch (IllegalArgumentException e) {
            throw new WebApplicationException("Beacon UUID muss 32 hexadezimale Zeichen enthalten.", Response.Status.BAD_REQUEST);
        }
    }

    private void ensureBeaconCodeIsAvailable(String beaconCode, UUID excludeId) {
        beaconRepository.findByBeaconCode(beaconCode.trim())
                .filter(existing -> excludeId == null || !existing.id.equals(excludeId))
                .ifPresent(existing -> {
                    throw conflict("Ein Beacon mit diesem Code existiert bereits.");
                });
    }

    private void ensureIdentityKeyIsAvailable(String identityKey, UUID excludeId) {
        beaconRepository.findByIdentityKey(identityKey)
                .filter(existing -> excludeId == null || !existing.id.equals(excludeId))
                .ifPresent(existing -> {
                    throw conflict("Diese Beacon-ID ist bereits vergeben.");
                });
    }

    private BeaconEntity requireBeacon(UUID beaconId) {
        return beaconRepository.findByIdOptional(beaconId)
                .orElseThrow(() -> new NotFoundException("Beacon nicht gefunden."));
    }

    private BeaconEntity requireActiveBeacon(UUID beaconId) {
        BeaconEntity beacon = requireBeacon(beaconId);
        if (beacon.status != RecordStatus.ACTIVE) {
            throw new WebApplicationException("Beacon ist archiviert und kann nicht zugeordnet werden.", Response.Status.BAD_REQUEST);
        }
        return beacon;
    }

    private StoreEntity requireActiveStore(UUID storeId) {
        StoreEntity store = storeRepository.findByIdOptional(storeId)
                .orElseThrow(() -> new NotFoundException("Filiale nicht gefunden."));
        if (store.status != RecordStatus.ACTIVE) {
            throw new WebApplicationException("Beacon kann nur einer aktiven Filiale zugeordnet werden.", Response.Status.BAD_REQUEST);
        }
        return store;
    }

    private BeaconDtos.BeaconResponse toResponse(BeaconEntity beacon, BeaconAssignmentEntity assignment) {
        BeaconDtos.BeaconStoreSummary currentStore = assignment == null
                ? null
                : new BeaconDtos.BeaconStoreSummary(assignment.store.id, assignment.store.storeCode, assignment.store.name, assignment.store.region.id);

        return new BeaconDtos.BeaconResponse(
                beacon.id,
                beacon.beaconCode,
                beacon.uuid,
                beacon.major,
                beacon.minor,
                beacon.identityKey,
                beacon.status.name(),
                beacon.notes,
                currentStore,
                beacon.createdAt,
                beacon.updatedAt
        );
    }

    private BeaconDtos.BeaconAssignmentResponse toAssignmentResponse(BeaconAssignmentEntity assignment) {
        return new BeaconDtos.BeaconAssignmentResponse(
                assignment.id,
                assignment.beacon.id,
                assignment.beacon.beaconCode,
                assignment.beacon.identityKey,
                assignment.store.id,
                assignment.store.storeCode,
                assignment.store.name,
                assignment.assignedAt,
                assignment.isActive
        );
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private WebApplicationException conflict(String message) {
        return new WebApplicationException(message, Response.Status.CONFLICT);
    }
}
