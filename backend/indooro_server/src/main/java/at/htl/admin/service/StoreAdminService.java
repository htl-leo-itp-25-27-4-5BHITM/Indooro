package at.htl.admin.service;

import at.htl.admin.dto.CommonDtos;
import at.htl.admin.dto.StoreDtos;
import at.htl.admin.entity.AuditLogEntity;
import at.htl.admin.entity.BeaconAssignmentEntity;
import at.htl.admin.entity.LayoutVersionEntity;
import at.htl.admin.entity.LayoutVersionStatus;
import at.htl.admin.entity.RecordStatus;
import at.htl.admin.entity.RegionEntity;
import at.htl.admin.entity.StoreEntity;
import at.htl.admin.repository.AuditLogRepository;
import at.htl.admin.repository.BeaconAssignmentRepository;
import at.htl.admin.repository.LayoutVersionRepository;
import at.htl.admin.repository.RegionRepository;
import at.htl.admin.repository.StoreRepository;
import io.quarkus.hibernate.orm.panache.PanacheQuery;
import io.quarkus.panache.common.Page;
import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.persistence.LockModeType;
import jakarta.persistence.LockTimeoutException;
import jakarta.persistence.PessimisticLockException;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@ApplicationScoped
public class StoreAdminService {

    @Inject
    StoreRepository storeRepository;

    @Inject
    RegionRepository regionRepository;

    @Inject
    BeaconAssignmentRepository beaconAssignmentRepository;

    @Inject
    LayoutVersionRepository layoutVersionRepository;

    @Inject
    AuditLogRepository auditLogRepository;

    @Inject
    AuditLogService auditLogService;

    @Inject
    AdminAccessService adminAccessService;

    public CommonDtos.PageResponse<StoreDtos.StoreSummaryResponse> listStores(String query,
                                                                             UUID regionId,
                                                                             RecordStatus status,
                                                                             Boolean hasActiveLayout,
                                                                             int page,
                                                                             int size) {
        StringBuilder hql = new StringBuilder("from StoreEntity s where 1 = 1");
        Map<String, Object> params = new HashMap<>();

        RecordStatus effectiveStatus = status == null ? RecordStatus.ACTIVE : status;
        hql.append(" and s.status = :status");
        params.put("status", effectiveStatus);

        UUID effectiveRegionId = adminAccessService.effectiveRegionFilter(regionId);
        UUID effectiveStoreId = adminAccessService.effectiveStoreFilter(null);

        if (effectiveRegionId != null) {
            hql.append(" and s.region.id = :regionId");
            params.put("regionId", effectiveRegionId);
        }

        if (effectiveStoreId != null) {
            hql.append(" and s.id = :storeId");
            params.put("storeId", effectiveStoreId);
        }

        if (query != null && !query.isBlank()) {
            hql.append(" and (lower(s.name) like :query or lower(s.storeCode) like :query or lower(s.city) like :query)");
            params.put("query", "%" + query.trim().toLowerCase() + "%");
        }

        if (hasActiveLayout != null) {
            hql.append(hasActiveLayout
                    ? " and exists (select 1 from LayoutVersionEntity lv where lv.store.id = s.id and lv.status = :layoutStatus)"
                    : " and not exists (select 1 from LayoutVersionEntity lv where lv.store.id = s.id and lv.status = :layoutStatus)");
            params.put("layoutStatus", LayoutVersionStatus.ACTIVE);
        }

        PanacheQuery<StoreEntity> panacheQuery = storeRepository.find(hql.toString(), Sort.by("name"), params);
        panacheQuery.page(Page.of(Math.max(page, 0), Math.max(size, 1)));

        return new CommonDtos.PageResponse<>(
                panacheQuery.list().stream().map(this::toSummaryResponse).toList(),
                Math.max(page, 0),
                Math.max(size, 1),
                panacheQuery.count()
        );
    }

    public StoreDtos.StoreDetailResponse getStore(UUID storeId) {
        adminAccessService.requireStoreAccess(storeId);
        return toDetailResponse(requireStore(storeId));
    }

    @Transactional
    public StoreDtos.StoreDetailResponse createStore(StoreDtos.StoreUpsertRequest request) {
        adminAccessService.requireStoreCreateAccess(request.regionId());
        String normalizedStoreCode = request.storeCode().trim();
        storeRepository.findByStoreCode(normalizedStoreCode).ifPresent(existing -> {
            throw conflict("Eine Filiale mit diesem Store-Code existiert bereits.");
        });

        RegionEntity region = requireRegion(request.regionId());

        StoreEntity store = new StoreEntity();
        applyStoreRequest(store, request, region);
        store.status = RecordStatus.ACTIVE;
        storeRepository.persist(store);

        StoreDtos.StoreDetailResponse response = toDetailResponse(store);
        auditLogService.log("STORE", store.id, "CREATE", "Filiale angelegt", null, response);
        return response;
    }

    @Transactional
    public StoreDtos.StoreDetailResponse updateStore(UUID storeId, StoreDtos.StoreUpsertRequest request) {
        adminAccessService.requireStoreMutationAccess(storeId, request.regionId());
        StoreEntity store = requireStore(storeId);
        StoreDtos.StoreDetailResponse before = toDetailResponse(store);

        String normalizedStoreCode = request.storeCode().trim();
        storeRepository.findByStoreCode(normalizedStoreCode)
                .filter(existing -> !existing.id.equals(storeId))
                .ifPresent(existing -> {
                    throw conflict("Eine Filiale mit diesem Store-Code existiert bereits.");
                });

        RegionEntity region = requireRegion(request.regionId());
        applyStoreRequest(store, request, region);

        StoreDtos.StoreDetailResponse after = toDetailResponse(store);
        auditLogService.log("STORE", store.id, "UPDATE", "Filiale aktualisiert", before, after);
        return after;
    }

    @Transactional
    public StoreDtos.StoreDetailResponse archiveStore(UUID storeId) {
        adminAccessService.requireStoreAccess(storeId);
        StoreEntity store = requireStore(storeId);
        StoreDtos.StoreDetailResponse before = toDetailResponse(store);

        store.status = RecordStatus.ARCHIVED;
        store.archivedAt = Instant.now();

        List<BeaconAssignmentEntity> activeAssignments = beaconAssignmentRepository.listActiveByStoreId(storeId);
        for (BeaconAssignmentEntity assignment : activeAssignments) {
            assignment.isActive = false;
            assignment.releasedAt = Instant.now();
        }

        StoreDtos.StoreDetailResponse after = toDetailResponse(store);
        auditLogService.log("STORE", store.id, "ARCHIVE", "Filiale archiviert", before, after);
        return after;
    }

    public List<StoreDtos.AuditLogResponse> getStoreAudit(UUID storeId) {
        adminAccessService.requireStoreAccess(storeId);
        requireStore(storeId);
        return auditLogRepository.listByEntity("STORE", storeId)
                .stream()
                .map(this::toAuditResponse)
                .toList();
    }

    public List<at.htl.admin.dto.BeaconDtos.BeaconAssignmentResponse> getStoreBeacons(UUID storeId) {
        adminAccessService.requireStoreAccess(storeId);
        StoreEntity store = requireStore(storeId);
        return beaconAssignmentRepository.listActiveByStoreId(storeId)
                .stream()
                .map(assignment -> new at.htl.admin.dto.BeaconDtos.BeaconAssignmentResponse(
                        assignment.id,
                        assignment.beacon.id,
                        assignment.beacon.beaconCode,
                        assignment.beacon.identityKey,
                        store.id,
                        store.storeCode,
                        store.name,
                        assignment.assignedAt,
                        assignment.isActive
                ))
                .toList();
    }

    StoreEntity requireStore(UUID storeId) {
        return storeRepository.findByIdOptional(storeId)
                .orElseThrow(() -> new NotFoundException("Filiale nicht gefunden."));
    }

    StoreEntity lockStore(UUID storeId) {
        try {
            return storeRepository.findByIdOptional(storeId, LockModeType.PESSIMISTIC_WRITE)
                    .orElseThrow(() -> new NotFoundException("Filiale nicht gefunden."));
        } catch (LockTimeoutException | PessimisticLockException exception) {
            throw new WebApplicationException("Filiallayout wird gerade bearbeitet. Bitte erneut versuchen.", exception, Response.Status.CONFLICT);
        }
    }

    private RegionEntity requireRegion(UUID regionId) {
        return regionRepository.findByIdOptional(regionId)
                .orElseThrow(() -> new NotFoundException("Region nicht gefunden."));
    }

    private void applyStoreRequest(StoreEntity store, StoreDtos.StoreUpsertRequest request, RegionEntity region) {
        store.region = region;
        store.storeCode = request.storeCode().trim();
        store.name = request.name().trim();
        store.street = request.street().trim();
        store.zipCode = request.zipCode().trim();
        store.city = request.city().trim();
        store.country = request.country().trim();
        store.latitude = request.latitude();
        store.longitude = request.longitude();
        store.notes = trimToNull(request.notes());
    }

    private StoreDtos.StoreSummaryResponse toSummaryResponse(StoreEntity entity) {
        long activeBeaconCount = beaconAssignmentRepository.countActiveByStore(entity);
        boolean hasActiveLayout = layoutVersionRepository.findActiveByStoreId(entity.id).isPresent();

        return new StoreDtos.StoreSummaryResponse(
                entity.id,
                entity.storeCode,
                entity.name,
                entity.city,
                entity.latitude,
                entity.longitude,
                entity.status.name(),
                toRegionSummary(entity.region),
                activeBeaconCount,
                hasActiveLayout
        );
    }

    private StoreDtos.StoreDetailResponse toDetailResponse(StoreEntity entity) {
        LayoutVersionEntity activeLayout = layoutVersionRepository.findActiveByStoreId(entity.id).orElse(null);
        return new StoreDtos.StoreDetailResponse(
                entity.id,
                entity.storeCode,
                entity.name,
                entity.street,
                entity.zipCode,
                entity.city,
                entity.country,
                entity.latitude,
                entity.longitude,
                entity.notes,
                entity.status.name(),
                entity.archivedAt,
                toRegionSummary(entity.region),
                activeLayout == null ? null : new StoreDtos.ActiveLayoutSummary(activeLayout.id, activeLayout.versionNo, activeLayout.createdAt),
                entity.createdAt,
                entity.updatedAt
        );
    }

    private StoreDtos.StoreRegionSummary toRegionSummary(RegionEntity region) {
        return new StoreDtos.StoreRegionSummary(region.id, region.code, region.name);
    }

    private StoreDtos.AuditLogResponse toAuditResponse(AuditLogEntity entity) {
        return new StoreDtos.AuditLogResponse(
                entity.id,
                entity.entityType,
                entity.action,
                entity.summary,
                entity.actorRole,
                entity.actorLabel,
                entity.createdAt
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
