package at.htl.admin.service;

import at.htl.admin.dto.LayoutDtos;
import at.htl.admin.dto.MobileDtos;
import at.htl.admin.entity.LayoutVersionEntity;
import at.htl.admin.entity.LayoutVersionStatus;
import at.htl.admin.entity.RecordStatus;
import at.htl.admin.entity.StoreEntity;
import at.htl.admin.repository.LayoutVersionRepository;
import at.htl.admin.repository.StoreRepository;
import at.htl.service.LayoutDocumentValidator;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class StoreLayoutDraftLifecycleTest {

    private final UUID storeId = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private final ObjectMapper mapper = new ObjectMapper();
    private final List<LayoutVersionEntity> versions = new ArrayList<>();

    private StoreLayoutAdminService adminService;
    private MobileStoreService mobileService;
    private StoreEntity store;

    @BeforeEach
    void setUp() {
        store = new StoreEntity();
        store.id = storeId;
        store.name = "Testmarkt";
        store.status = RecordStatus.ACTIVE;

        LayoutVersionRepository versionsRepository = mock(LayoutVersionRepository.class);
        when(versionsRepository.findActiveByStoreId(storeId))
                .thenAnswer(call -> versions.stream().filter(v -> v.status == LayoutVersionStatus.ACTIVE).findFirst());
        when(versionsRepository.findByStoreAndId(eq(storeId), any(UUID.class)))
                .thenAnswer(call -> versions.stream()
                        .filter(v -> v.id.equals(call.getArgument(1, UUID.class))).findFirst());
        when(versionsRepository.listByStoreId(storeId))
                .thenAnswer(call -> versions.stream()
                        .sorted(Comparator.comparingInt((LayoutVersionEntity v) -> v.versionNo).reversed()).toList());
        when(versionsRepository.nextVersionNo(storeId))
                .thenAnswer(call -> versions.stream().mapToInt(v -> v.versionNo).max().orElse(0) + 1);
        doAnswer(call -> {
            LayoutVersionEntity version = call.getArgument(0, LayoutVersionEntity.class);
            version.id = UUID.randomUUID();
            version.createdAt = Instant.now();
            versions.add(version);
            return null;
        }).when(versionsRepository).persist(any(LayoutVersionEntity.class));

        StoreAdminService storeAdminService = mock(StoreAdminService.class);
        when(storeAdminService.requireStore(storeId)).thenReturn(store);

        adminService = new StoreLayoutAdminService();
        adminService.layoutVersionRepository = versionsRepository;
        adminService.storeAdminService = storeAdminService;
        adminService.adminAccessService = mock(AdminAccessService.class);
        adminService.auditLogService = mock(AuditLogService.class);
        adminService.objectMapper = mapper;
        adminService.layoutDocumentValidator = new LayoutDocumentValidator();

        StoreRepository storesRepository = mock(StoreRepository.class);
        when(storesRepository.findByIdOptional(storeId)).thenReturn(Optional.of(store));
        mobileService = new MobileStoreService();
        mobileService.storeRepository = storesRepository;
        mobileService.layoutVersionRepository = versionsRepository;
        mobileService.objectMapper = mapper;
    }

    @Test
    void firstDraftIsRetrievableButMobileKeepsNoActiveFallbackUntilActivation() throws Exception {
        LayoutDtos.StoreLayoutResponse draft = adminService.saveLayoutVersion(storeId, request("Draft", false));

        assertEquals("DRAFT", draft.status());
        assertEquals(1, draft.versionNo());
        assertNull(draft.activatedAt());
        assertEquals(1, adminService.listLayoutVersions(storeId).size());
        assertEquals(draft.layout(), adminService.getLayoutVersion(storeId, draft.layoutId()).layout());
        assertEquals("DEFAULT", adminService.getCurrentLayout(storeId).status());

        MobileDtos.MobileLayoutResponse beforePublish = mobileService.getCurrentLayout(storeId);
        assertEquals("DEFAULT", beforePublish.source());
        assertTrue(beforePublish.fallback());
        assertNull(beforePublish.layoutId());
        assertEquals("Testmarkt", beforePublish.layout().path("shopName").asText());

        LayoutDtos.StoreLayoutResponse published = adminService.activateLayoutVersion(storeId, draft.layoutId());
        assertEquals("ACTIVE", published.status());
        assertNotNull(published.activatedAt());

        MobileDtos.MobileLayoutResponse afterPublish = mobileService.getCurrentLayout(storeId);
        assertEquals("ACTIVE", afterPublish.source());
        assertFalse(afterPublish.fallback());
        assertEquals(draft.layoutId(), afterPublish.layoutId());
        assertEquals(draft.layout(), afterPublish.layout());
        assertEquals(1, activeCount());
    }

    @Test
    void savingDraftWithOneActiveVersionDoesNotChangeMobileUntilExplicitActivation() throws Exception {
        LayoutDtos.StoreLayoutResponse first = adminService.saveLayoutVersion(storeId, request("Published", true));
        LayoutDtos.StoreLayoutResponse second = adminService.saveLayoutVersion(storeId, request("Replacement", false));

        assertEquals("ACTIVE", first.status());
        assertEquals("DRAFT", second.status());
        assertEquals(2, second.versionNo());
        assertEquals(2, adminService.listLayoutVersions(storeId).size());
        assertEquals("DRAFT", adminService.getLayoutVersion(storeId, second.layoutId()).status());
        assertEquals(first.layoutId(), mobileService.getCurrentLayout(storeId).layoutId());
        assertEquals(1, activeCount());

        adminService.activateLayoutVersion(storeId, second.layoutId());

        assertEquals("ARCHIVED", adminService.getLayoutVersion(storeId, first.layoutId()).status());
        assertEquals("ACTIVE", adminService.getLayoutVersion(storeId, second.layoutId()).status());
        assertEquals(second.layoutId(), mobileService.getCurrentLayout(storeId).layoutId());
        assertEquals(1, activeCount());
    }

    @Test
    void explicitActivationOnFirstSaveRetainsExistingBehavior() throws Exception {
        LayoutDtos.StoreLayoutResponse first = adminService.saveLayoutVersion(storeId, request("Published", true));

        assertEquals("ACTIVE", first.status());
        assertEquals(first.layoutId(), mobileService.getCurrentLayout(storeId).layoutId());
        assertEquals(1, activeCount());
    }

    @Test
    void omittedActivationOnFirstSaveRetainsLegacyClientBehavior() throws Exception {
        LayoutDtos.LayoutSaveRequest draftRequest = request("Legacy client", false);
        LayoutDtos.StoreLayoutResponse first = adminService.saveLayoutVersion(storeId,
                new LayoutDtos.LayoutSaveRequest(draftRequest.layoutName(), draftRequest.changeNote(), null, draftRequest.layout()));

        assertEquals("ACTIVE", first.status());
        assertEquals(first.layoutId(), mobileService.getCurrentLayout(storeId).layoutId());
        assertEquals(1, activeCount());
    }

    private long activeCount() {
        return versions.stream().filter(v -> v.status == LayoutVersionStatus.ACTIVE).count();
    }

    private LayoutDtos.LayoutSaveRequest request(String name, boolean activate) throws Exception {
        JsonNode layout = mapper.readTree("{\"shopName\":\"Testmarkt\",\"gridSize\":{\"width\":40,\"height\":60},\"elements\":[{\"id\":1,\"type\":\"shelf\",\"x\":1,\"y\":2,\"width\":3,\"height\":4}],\"exportDate\":\"2026-10-11\"}");
        return new LayoutDtos.LayoutSaveRequest(name, "Test", activate, layout);
    }
}
