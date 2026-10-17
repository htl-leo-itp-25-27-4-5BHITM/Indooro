package at.htl.admin.service;

import at.htl.admin.entity.RegionEntity;
import at.htl.admin.entity.StoreEntity;
import at.htl.admin.entity.UserAccessAssignmentEntity;
import at.htl.admin.repository.StoreRepository;
import jakarta.ws.rs.ForbiddenException;
import jakarta.ws.rs.NotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.when;

/** Store scope rules of AdminAccessService without a database: the current user is stubbed, stores come from a mocked repository. */
class AdminAccessServiceStoreScopeTest {

    private final UUID regionA = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private final UUID regionB = UUID.fromString("22222222-2222-2222-2222-222222222222");
    private final UUID storeInA = UUID.fromString("33333333-3333-3333-3333-333333333333");
    private final UUID otherStoreInA = UUID.fromString("44444444-4444-4444-4444-444444444444");
    private final UUID storeInB = UUID.fromString("55555555-5555-5555-5555-555555555555");
    private final UUID unknownStore = UUID.fromString("66666666-6666-6666-6666-666666666666");

    private RegionEntity regionEntityA;
    private RegionEntity regionEntityB;
    private StoreEntity ownStore;
    private StoreEntity otherStore;
    private StoreEntity storeB;
    private AdminAccessService access;

    @BeforeEach
    void setUp() {
        regionEntityA = region(regionA);
        regionEntityB = region(regionB);
        ownStore = store(storeInA, regionEntityA);
        otherStore = store(otherStoreInA, regionEntityA);
        storeB = store(storeInB, regionEntityB);

        StoreRepository stores = mock(StoreRepository.class);
        when(stores.findByIdOptional(storeInA)).thenReturn(Optional.of(ownStore));
        when(stores.findByIdOptional(otherStoreInA)).thenReturn(Optional.of(otherStore));
        when(stores.findByIdOptional(storeInB)).thenReturn(Optional.of(storeB));
        when(stores.findByIdOptional(unknownStore)).thenReturn(Optional.empty());

        access = spy(new AdminAccessService());
        access.storeRepository = stores;
    }

    @Test
    void adminMayAccessStoresOfAnyRegion() {
        asUser(admin());
        assertDoesNotThrow(() -> access.requireStoreAccess(storeInA));
        assertDoesNotThrow(() -> access.requireStoreAccess(storeInB));
    }

    @Test
    void regionManagerMayAccessStoreOfOwnRegion() {
        asUser(regionManager(regionEntityA));
        assertDoesNotThrow(() -> access.requireStoreAccess(storeInA));
        assertDoesNotThrow(() -> access.requireStoreAccess(otherStoreInA));
    }

    @Test
    void regionManagerIsForbiddenOnStoreOfAnotherRegion() {
        asUser(regionManager(regionEntityA));
        assertThrows(ForbiddenException.class, () -> access.requireStoreAccess(storeInB));
    }

    @Test
    void storeManagerMayAccessOwnStore() {
        asUser(storeManager(ownStore));
        assertDoesNotThrow(() -> access.requireStoreAccess(storeInA));
    }

    @Test
    void storeManagerIsForbiddenOnOtherStoreOfSameRegion() {
        asUser(storeManager(ownStore));
        assertThrows(ForbiddenException.class, () -> access.requireStoreAccess(otherStoreInA));
    }

    @Test
    void storeManagerIsForbiddenOnStoreOfAnotherRegion() {
        asUser(storeManager(ownStore));
        assertThrows(ForbiddenException.class, () -> access.requireStoreAccess(storeInB));
    }

    @Test
    void regionManagerOnUnknownStoreGetsNotFound() {
        asUser(regionManager(regionEntityA));
        assertThrows(NotFoundException.class, () -> access.requireStoreAccess(unknownStore));
    }

    @Test
    void requireAdminAcceptsOnlyAdmin() {
        asUser(admin());
        assertDoesNotThrow(() -> access.requireAdmin());

        asUser(regionManager(regionEntityA));
        assertThrows(ForbiddenException.class, () -> access.requireAdmin());

        asUser(storeManager(ownStore));
        assertThrows(ForbiddenException.class, () -> access.requireAdmin());
    }

    private void asUser(CurrentAdminUser user) {
        doReturn(user).when(access).currentUser();
    }

    private CurrentAdminUser admin() {
        return new CurrentAdminUser("admin-subject", "admin", null, AdminRole.ADMIN, null);
    }

    private CurrentAdminUser regionManager(RegionEntity region) {
        UserAccessAssignmentEntity assignment = assignment(AdminRole.REGION_MANAGER, region, null);
        return new CurrentAdminUser("region-subject", "region", null, AdminRole.REGION_MANAGER, assignment);
    }

    private CurrentAdminUser storeManager(StoreEntity store) {
        UserAccessAssignmentEntity assignment = assignment(AdminRole.STORE_MANAGER, null, store);
        return new CurrentAdminUser("store-subject", "store", null, AdminRole.STORE_MANAGER, assignment);
    }

    private static UserAccessAssignmentEntity assignment(AdminRole role, RegionEntity region, StoreEntity store) {
        UserAccessAssignmentEntity assignment = new UserAccessAssignmentEntity();
        assignment.role = role.value();
        assignment.region = region;
        assignment.store = store;
        return assignment;
    }

    private static RegionEntity region(UUID id) {
        RegionEntity region = new RegionEntity();
        region.id = id;
        region.name = "Region " + id.toString().charAt(0);
        return region;
    }

    private static StoreEntity store(UUID id, RegionEntity region) {
        StoreEntity store = new StoreEntity();
        store.id = id;
        store.region = region;
        store.name = "Filiale " + id.toString().charAt(0);
        store.storeCode = "S-" + id.toString().charAt(0);
        return store;
    }
}
