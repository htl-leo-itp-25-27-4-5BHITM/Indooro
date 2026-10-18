package at.htl.admin.service;

import at.htl.admin.dto.RecipeDtos;
import at.htl.admin.entity.RecordStatus;
import at.htl.admin.entity.recipe.RecipeTagEntity;
import at.htl.admin.repository.recipe.RecipeTagRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RecipeTagAuditTest {

    private static final UUID TAG_ID = UUID.fromString("c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0");

    RecipeService service;
    RecipeTagRepository tagRepository;
    AuditLogService auditLog;
    AdminAccessService access;
    CurrentAdminUser admin;

    @BeforeEach
    void setUp() {
        service = new RecipeService();
        tagRepository = mock(RecipeTagRepository.class);
        auditLog = mock(AuditLogService.class);
        access = mock(AdminAccessService.class);
        admin = new CurrentAdminUser("keycloak-sub-1", "indooro-admin", null, AdminRole.ADMIN, null);
        when(access.currentUser()).thenReturn(admin);
        service.tagRepository = tagRepository;
        service.auditLogService = auditLog;
        service.adminAccessService = access;
    }

    @Test
    void createTagWritesCreateEntryForRecipeTag() {
        when(tagRepository.findByCode("vegan")).thenReturn(Optional.empty());
        doAnswer(invocation -> {
            RecipeTagEntity tag = invocation.getArgument(0);
            tag.id = TAG_ID;
            return null;
        }).when(tagRepository).persist(any(RecipeTagEntity.class));

        service.createTag(new RecipeDtos.RecipeTagRequest("vegan", "Vegan", null, null));

        verify(auditLog).logByAdmin(eq(admin), eq("RECIPE_TAG"), eq(TAG_ID), eq("CREATE"), anyString(),
                isNull(), any(RecipeDtos.RecipeTagResponse.class));
    }

    @Test
    void updateTagWritesUpdateEntryWithBeforeAndAfterState() {
        RecipeTagEntity tag = tag(TAG_ID, "vegan", "Vegan");
        when(tagRepository.findByIdOptional(TAG_ID)).thenReturn(Optional.of(tag));
        when(tagRepository.findByCode("vegan-neu")).thenReturn(Optional.empty());

        service.updateTag(TAG_ID, new RecipeDtos.RecipeTagRequest("vegan-neu", "Vegan neu", null, null));

        ArgumentCaptor<RecipeDtos.RecipeTagResponse> before = ArgumentCaptor.forClass(RecipeDtos.RecipeTagResponse.class);
        ArgumentCaptor<RecipeDtos.RecipeTagResponse> after = ArgumentCaptor.forClass(RecipeDtos.RecipeTagResponse.class);
        verify(auditLog).logByAdmin(eq(admin), eq("RECIPE_TAG"), eq(TAG_ID), eq("UPDATE"), anyString(),
                before.capture(), after.capture());
        assertEquals("Vegan", before.getValue().name());
        assertEquals("Vegan neu", after.getValue().name());
    }

    @Test
    void archiveTagWritesArchiveEntryWithStatusChange() {
        RecipeTagEntity tag = tag(TAG_ID, "vegan", "Vegan");
        when(tagRepository.findByIdOptional(TAG_ID)).thenReturn(Optional.of(tag));

        service.archiveTag(TAG_ID);

        ArgumentCaptor<RecipeDtos.RecipeTagResponse> before = ArgumentCaptor.forClass(RecipeDtos.RecipeTagResponse.class);
        ArgumentCaptor<RecipeDtos.RecipeTagResponse> after = ArgumentCaptor.forClass(RecipeDtos.RecipeTagResponse.class);
        verify(auditLog).logByAdmin(eq(admin), eq("RECIPE_TAG"), eq(TAG_ID), eq("ARCHIVE"), anyString(),
                before.capture(), after.capture());
        assertEquals("ACTIVE", before.getValue().status());
        assertEquals("ARCHIVED", after.getValue().status());
    }

    private static RecipeTagEntity tag(UUID id, String code, String name) {
        RecipeTagEntity tag = new RecipeTagEntity();
        tag.id = id;
        tag.code = code;
        tag.name = name;
        tag.status = RecordStatus.ACTIVE;
        return tag;
    }
}
