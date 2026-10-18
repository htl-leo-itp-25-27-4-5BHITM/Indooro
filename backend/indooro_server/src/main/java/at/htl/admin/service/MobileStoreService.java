package at.htl.admin.service;

import at.htl.admin.dto.MobileDtos;
import at.htl.admin.entity.BeaconAssignmentEntity;
import at.htl.admin.entity.BeaconEntity;
import at.htl.admin.entity.LayoutVersionEntity;
import at.htl.admin.entity.RecordStatus;
import at.htl.admin.entity.StoreEntity;
import at.htl.admin.repository.BeaconAssignmentRepository;
import at.htl.admin.repository.BeaconRepository;
import at.htl.admin.repository.LayoutVersionRepository;
import at.htl.admin.repository.StoreRepository;
import at.htl.admin.util.BeaconIdentityUtil;
import at.htl.service.DefaultLayoutProvider;
import at.htl.service.LayoutEtag;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@ApplicationScoped
public class MobileStoreService {

    @Inject
    BeaconRepository beaconRepository;

    @Inject
    BeaconAssignmentRepository beaconAssignmentRepository;

    @Inject
    StoreRepository storeRepository;

    @Inject
    LayoutVersionRepository layoutVersionRepository;

    @Inject
    DefaultLayoutProvider defaultLayoutProvider;

    public List<MobileDtos.MobileStoreSummary> listStores() {
        return storeRepository.find("status = ?1 order by name", RecordStatus.ACTIVE)
                .list()
                .stream()
                .map(this::toStoreSummary)
                .toList();
    }

    public MobileDtos.BeaconIdentitiesResponse listBeaconIdentities() {
        return new MobileDtos.BeaconIdentitiesResponse(beaconRepository.listActiveAssignedMobileUuids());
    }

    public MobileDtos.StoreByBeaconResponse findStoreByBeacon(String uuid, Integer major, Integer minor) {
        if (uuid == null || uuid.isBlank()) {
            throw new WebApplicationException("Beacon UUID ist erforderlich.", Response.Status.BAD_REQUEST);
        }
        if ((major == null) != (minor == null)) {
            throw new WebApplicationException("Major und Minor muessen entweder beide gesetzt oder beide leer sein.", Response.Status.BAD_REQUEST);
        }

        BeaconEntity beacon = resolveBeacon(uuid, major, minor);
        BeaconAssignmentEntity assignment = beaconAssignmentRepository.findActiveByBeaconId(beacon.id)
                .orElseThrow(() -> new NotFoundException("Keiner aktiven Filiale ist dieser Beacon zugeordnet."));

        if (assignment.store.status != RecordStatus.ACTIVE) {
            throw new NotFoundException("Die zugeordnete Filiale ist nicht aktiv.");
        }

        return new MobileDtos.StoreByBeaconResponse(
                toStoreSummary(assignment.store),
                new MobileDtos.MatchedBeaconSummary(beacon.id, beacon.beaconCode, beacon.identityKey)
        );
    }

    public MobileDtos.MobileLayoutResponse getCurrentLayout(UUID storeId) {
        return getCurrentLayoutWithEtag(storeId).layout();
    }

    /** Aktuelles Layout samt ETag; die Filiale wird vor dem ETag geprueft, unbekannte oder inaktive Filialen werfen 404. */
    public LayoutWithEtag getCurrentLayoutWithEtag(UUID storeId) {
        StoreEntity store = storeRepository.findByIdOptional(storeId)
                .orElseThrow(() -> new NotFoundException("Filiale nicht gefunden."));
        if (store.status != RecordStatus.ACTIVE) {
            throw new NotFoundException("Filiale ist nicht aktiv.");
        }

        LayoutVersionEntity activeLayout = layoutVersionRepository.findActiveByStoreId(storeId).orElse(null);
        if (activeLayout != null) {
            MobileDtos.MobileLayoutResponse response = new MobileDtos.MobileLayoutResponse(
                    store.id,
                    activeLayout.id,
                    "ACTIVE",
                    false,
                    activeLayout.layoutJson
            );
            return new LayoutWithEtag(response, LayoutEtag.ofActiveLayout(activeLayout.id, activeLayout.activatedAt));
        }

        MobileDtos.MobileLayoutResponse response = new MobileDtos.MobileLayoutResponse(
                store.id,
                null,
                "DEFAULT",
                true,
                defaultLayoutProvider.forStore(store.name)
        );
        return new LayoutWithEtag(
                response,
                LayoutEtag.ofDefaultLayout(store.id, store.name, defaultLayoutProvider.contentHash())
        );
    }

    /** Layout mit ETag-Wert (SHA-256 hex, ohne Anfuehrungszeichen). */
    public record LayoutWithEtag(MobileDtos.MobileLayoutResponse layout, String etag) {
    }

    private BeaconEntity resolveBeacon(String uuid, Integer major, Integer minor) {
        String normalizedUuid;
        try {
            normalizedUuid = BeaconIdentityUtil.normalizeUuid(uuid);
        } catch (IllegalArgumentException e) {
            throw new WebApplicationException("Beacon UUID muss 32 hexadezimale Zeichen enthalten.", Response.Status.BAD_REQUEST);
        }

        if (major != null && minor != null) {
            String exactIdentityKey = BeaconIdentityUtil.toIdentityKey(normalizedUuid, major, minor);
            BeaconEntity exactMatch = beaconRepository.findByIdentityKey(exactIdentityKey).orElse(null);
            if (exactMatch != null && exactMatch.status == RecordStatus.ACTIVE) {
                return exactMatch;
            }
            // Without an exact match only a UUID-only registration may answer. A beacon with another major or
            // minor must not be picked for a different identity.
            return beaconRepository.findActiveUuidOnly(normalizedUuid)
                    .orElseThrow(() -> new NotFoundException("Kein passender Beacon gefunden."));
        }

        List<BeaconEntity> uuidMatches = beaconRepository.listActiveByUuid(normalizedUuid);
        if (uuidMatches.isEmpty()) {
            throw new NotFoundException("Kein passender Beacon gefunden.");
        }

        if (uuidMatches.size() == 1) {
            return uuidMatches.get(0);
        }

        List<BeaconAssignmentEntity> activeAssignments = uuidMatches.stream()
                .map(beacon -> beaconAssignmentRepository.findActiveByBeaconId(beacon.id).orElse(null))
                .filter(assignment -> assignment != null && assignment.store.status == RecordStatus.ACTIVE)
                .toList();

        if (activeAssignments.size() == 1) {
            return activeAssignments.get(0).beacon;
        }

        Set<UUID> distinctStoreIds = new HashSet<>();
        for (BeaconAssignmentEntity assignment : activeAssignments) {
            distinctStoreIds.add(assignment.store.id);
        }

        if (distinctStoreIds.size() == 1 && !activeAssignments.isEmpty()) {
            return activeAssignments.get(0).beacon;
        }

        throw new WebApplicationException(
                "Mehrere aktive Beacons mit dieser UUID gefunden. Bitte UUID, Major und Minor mitsenden.",
                Response.Status.CONFLICT
        );
    }

    private MobileDtos.MobileStoreSummary toStoreSummary(StoreEntity store) {
        return new MobileDtos.MobileStoreSummary(
                store.id,
                store.storeCode,
                store.name,
                store.city,
                address(store),
                store.latitude,
                store.longitude
        );
    }

    private String address(StoreEntity store) {
        return String.format("%s, %s %s", store.street, store.zipCode, store.city);
    }

}
