package at.htl.admin.service;

import at.htl.admin.dto.RecipeDtos;
import at.htl.admin.entity.recipe.RecipeEntity;
import at.htl.admin.entity.recipe.RecipeTagAssignmentEntity;
import at.htl.admin.entity.recipe.RecipeTagEntity;
import at.htl.admin.repository.recipe.RecipeRepository;
import at.htl.admin.repository.recipe.RecipeTagRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RecipeTagAssignmentTest {
    private static final UUID RECIPE_ID = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static final UUID OLD_TAG_ID = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static final UUID NEW_TAG_ID = UUID.fromString("cccccccc-cccc-cccc-cccc-cccccccccccc");

    private RecipeService service;
    private RecipeEntity recipe;
    private RecipeTagRepository tagRepository;
    private EntityManager entityManager;

    @BeforeEach
    void setUp() {
        service = new RecipeService();
        service.adminAccessService = mock(AdminAccessService.class);
        service.auditLogService = mock(AuditLogService.class);
        service.recipeRepository = mock(RecipeRepository.class);
        tagRepository = mock(RecipeTagRepository.class);
        entityManager = mock(EntityManager.class);
        service.tagRepository = tagRepository;
        service.entityManager = entityManager;

        recipe = new RecipeEntity();
        recipe.id = RECIPE_ID;
        recipe.slug = "apfelkuchen";
        recipe.title = "Apfelkuchen";
        RecipeTagAssignmentEntity assignment = new RecipeTagAssignmentEntity();
        assignment.recipe = recipe;
        assignment.tag = tag(OLD_TAG_ID, "old", "Alt");
        recipe.tagAssignments.add(assignment);

        when(service.recipeRepository.findByIdOptional(RECIPE_ID)).thenReturn(Optional.of(recipe));
        when(service.recipeRepository.findBySlug("apfelkuchen")).thenReturn(Optional.of(recipe));
    }

    @Test
    void omittedTagsKeepExistingAssignments() {
        RecipeDtos.RecipeDetailResponse result = service.updateRecipe(RECIPE_ID, request(null));

        assertEquals(List.of(OLD_TAG_ID), result.tags().stream().map(RecipeDtos.RecipeTagResponse::id).toList());
        assertEquals(1, recipe.tagAssignments.size());
        verify(entityManager, never()).flush();
    }

    @Test
    void emptyTagsExplicitlyClearAssignments() {
        RecipeDtos.RecipeDetailResponse result = service.updateRecipe(RECIPE_ID, request(List.of()));

        assertEquals(List.of(), result.tags());
        assertEquals(0, recipe.tagAssignments.size());
        verify(entityManager).flush();
    }

    @Test
    void suppliedTagsReplaceAssignments() {
        RecipeTagEntity replacement = tag(NEW_TAG_ID, "new", "Neu");
        when(tagRepository.findByIdOptional(NEW_TAG_ID)).thenReturn(Optional.of(replacement));

        RecipeDtos.RecipeDetailResponse result = service.updateRecipe(RECIPE_ID, request(List.of(NEW_TAG_ID)));

        assertEquals(List.of(NEW_TAG_ID), result.tags().stream().map(RecipeDtos.RecipeTagResponse::id).toList());
        assertEquals(1, recipe.tagAssignments.size());
        verify(entityManager).flush();
        verify(entityManager).persist(recipe.tagAssignments.get(0));
    }

    private RecipeDtos.RecipeUpsertRequest request(List<UUID> tagIds) {
        return new RecipeDtos.RecipeUpsertRequest(
                "apfelkuchen", "Apfelkuchen", null, null, null, null,
                2, null, null, null, "DRAFT", tagIds
        );
    }

    private RecipeTagEntity tag(UUID id, String code, String name) {
        RecipeTagEntity tag = new RecipeTagEntity();
        tag.id = id;
        tag.code = code;
        tag.name = name;
        return tag;
    }
}
