package at.htl.admin.service;

import at.htl.admin.dto.MobileDtos;
import at.htl.admin.entity.BeaconAssignmentEntity;
import at.htl.admin.entity.BeaconEntity;
import at.htl.admin.entity.RecordStatus;
import at.htl.admin.entity.StoreEntity;
import at.htl.admin.repository.BeaconAssignmentRepository;
import at.htl.admin.repository.BeaconRepository;
import at.htl.admin.util.BeaconIdentityUtil;
import jakarta.ws.rs.NotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Beacon lookup by UUID, major and minor: exact match first, then only UUID-only registrations. */
class MobileStoreBeaconResolutionTest {

    private static final String UUID_VALUE = "0123456789abcdef0123456789abcdef";

    private MobileStoreService service;
    private BeaconRepository beaconRepository;
    private BeaconAssignmentRepository assignmentRepository;
    private StoreEntity store;

    @BeforeEach
    void setUp() {
        service = new MobileStoreService();
        beaconRepository = mock(BeaconRepository.class);
        assignmentRepository = mock(BeaconAssignmentRepository.class);
        service.beaconRepository = beaconRepository;
        service.beaconAssignmentRepository = assignmentRepository;

        store = new StoreEntity();
        store.id = UUID.randomUUID();
        store.storeCode = "LEO-1";
        store.name = "Leonding";
        store.status = RecordStatus.ACTIVE;
    }

    @Test
    void exactActiveMatchIsUsedFirst() {
        BeaconEntity exact = beacon("EXACT", 1, 2, RecordStatus.ACTIVE);
        when(beaconRepository.findByIdentityKey(BeaconIdentityUtil.toIdentityKey(UUID_VALUE, 1, 2))).thenReturn(Optional.of(exact));
        when(assignmentRepository.findActiveByBeaconId(exact.id)).thenReturn(Optional.of(assignment(exact)));

        MobileDtos.StoreByBeaconResponse response = service.findStoreByBeacon(UUID_VALUE, 1, 2);

        assertEquals("EXACT", response.matchedBeacon().beaconCode());
        verify(beaconRepository, never()).findActiveUuidOnly(anyString());
    }

    @Test
    void uuidOnlyRegistrationAnswersWhenNoExactMatchExists() {
        BeaconEntity uuidOnly = beacon("UUID-ONLY", null, null, RecordStatus.ACTIVE);
        when(beaconRepository.findByIdentityKey(anyString())).thenReturn(Optional.empty());
        when(beaconRepository.findActiveUuidOnly(UUID_VALUE)).thenReturn(Optional.of(uuidOnly));
        when(assignmentRepository.findActiveByBeaconId(uuidOnly.id)).thenReturn(Optional.of(assignment(uuidOnly)));

        MobileDtos.StoreByBeaconResponse response = service.findStoreByBeacon(UUID_VALUE, 7, 8);

        assertEquals("UUID-ONLY", response.matchedBeacon().beaconCode());
    }

    @Test
    void beaconWithAnotherMajorMinorIsNeverUsedAsFallback() {
        when(beaconRepository.findByIdentityKey(anyString())).thenReturn(Optional.empty());
        when(beaconRepository.findActiveUuidOnly(UUID_VALUE)).thenReturn(Optional.empty());
        when(beaconRepository.listActiveByUuid(UUID_VALUE))
                .thenReturn(List.of(beacon("OTHER-MINOR", 1, 9, RecordStatus.ACTIVE)));

        assertThrows(NotFoundException.class, () -> service.findStoreByBeacon(UUID_VALUE, 1, 2));
        verify(beaconRepository, never()).listActiveByUuid(anyString());
    }

    @Test
    void archivedExactMatchDoesNotCountAsExact() {
        BeaconEntity archived = beacon("ARCHIVED", 1, 2, RecordStatus.ARCHIVED);
        when(beaconRepository.findByIdentityKey(BeaconIdentityUtil.toIdentityKey(UUID_VALUE, 1, 2))).thenReturn(Optional.of(archived));
        when(beaconRepository.findActiveUuidOnly(UUID_VALUE)).thenReturn(Optional.empty());

        assertThrows(NotFoundException.class, () -> service.findStoreByBeacon(UUID_VALUE, 1, 2));
    }

    @Test
    void lookupWithoutMajorMinorStillMatchesAnyActiveBeaconOfTheUuid() {
        BeaconEntity single = beacon("ONLY", 3, 4, RecordStatus.ACTIVE);
        when(beaconRepository.listActiveByUuid(UUID_VALUE)).thenReturn(List.of(single));
        when(assignmentRepository.findActiveByBeaconId(single.id)).thenReturn(Optional.of(assignment(single)));

        MobileDtos.StoreByBeaconResponse response = service.findStoreByBeacon(UUID_VALUE, null, null);

        assertEquals("ONLY", response.matchedBeacon().beaconCode());
        verify(beaconRepository, never()).findActiveUuidOnly(anyString());
    }

    @Test
    void unknownUuidIsNotFound() {
        when(beaconRepository.listActiveByUuid(UUID_VALUE)).thenReturn(List.of());

        assertThrows(NotFoundException.class, () -> service.findStoreByBeacon(UUID_VALUE, null, null));
    }

    private BeaconEntity beacon(String code, Integer major, Integer minor, RecordStatus status) {
        BeaconEntity beacon = new BeaconEntity();
        beacon.id = UUID.randomUUID();
        beacon.beaconCode = code;
        beacon.uuid = UUID_VALUE;
        beacon.major = major;
        beacon.minor = minor;
        beacon.identityKey = BeaconIdentityUtil.toIdentityKey(UUID_VALUE, major, minor);
        beacon.status = status;
        return beacon;
    }

    private BeaconAssignmentEntity assignment(BeaconEntity beacon) {
        BeaconAssignmentEntity assignment = new BeaconAssignmentEntity();
        assignment.id = UUID.randomUUID();
        assignment.beacon = beacon;
        assignment.store = store;
        assignment.isActive = true;
        return assignment;
    }
}
