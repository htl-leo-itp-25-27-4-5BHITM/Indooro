package at.htl.admin.service;

import at.htl.admin.dto.CommonDtos;
import at.htl.admin.dto.RecipeDtos;
import at.htl.admin.entity.RecordStatus;
import at.htl.admin.entity.StoreEntity;
import at.htl.admin.entity.recipe.IngredientProductMappingEntity;
import at.htl.admin.entity.recipe.RecipeEntity;
import at.htl.admin.entity.recipe.RecipeIngredientEntity;
import at.htl.admin.entity.recipe.RecipeMappingType;
import at.htl.admin.entity.recipe.RecipeStatus;
import at.htl.admin.entity.recipe.RecipeStepEntity;
import at.htl.admin.entity.recipe.RecipeTagAssignmentEntity;
import at.htl.admin.entity.recipe.RecipeTagEntity;
import at.htl.admin.entity.recipe.RecipeUnitEntity;
import at.htl.admin.repository.StoreRepository;
import at.htl.admin.repository.recipe.IngredientProductMappingRepository;
import at.htl.admin.repository.recipe.RecipeIngredientRepository;
import at.htl.admin.repository.recipe.RecipeRepository;
import at.htl.admin.repository.recipe.RecipeStepRepository;
import at.htl.admin.repository.recipe.RecipeTagRepository;
import at.htl.admin.repository.recipe.RecipeUnitRepository;
import at.htl.model.Product;
import at.htl.service.OpenSearchService;
import io.quarkus.hibernate.orm.panache.PanacheQuery;
import io.quarkus.panache.common.Page;
import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@ApplicationScoped
public class RecipeService {

    private static final Logger LOG = Logger.getLogger(RecipeService.class);

    @Inject
    RecipeRepository recipeRepository;

    @Inject
    RecipeIngredientRepository ingredientRepository;

    @Inject
    RecipeStepRepository stepRepository;

    @Inject
    RecipeTagRepository tagRepository;

    @Inject
    RecipeUnitRepository unitRepository;

    @Inject
    IngredientProductMappingRepository mappingRepository;

    @Inject
    StoreRepository storeRepository;

    @Inject
    OpenSearchService openSearchService;

    @Inject
    AdminAccessService adminAccessService;

    @Inject
    AuditLogService auditLogService;

    @Inject
    EntityManager entityManager;

    public CommonDtos.PageResponse<RecipeDtos.RecipeSummaryResponse> listMobileRecipes(String query,
                                                                                       String tag,
                                                                                       int page,
                                                                                       int size,
                                                                                       UUID storeId) {
        return listRecipes(query, tag, RecipeStatus.PUBLISHED, page, Math.min(size, 50), storeId, null);
    }

    public CommonDtos.PageResponse<RecipeDtos.RecipeSummaryResponse> listAdminRecipes(String query,
                                                                                      String tag,
                                                                                      RecipeStatus status,
                                                                                      int page,
                                                                                      int size,
                                                                                      String sort) {
        adminAccessService.requireAdmin();
        return listRecipes(query, tag, status, page, Math.min(size, 100), null, sort);
    }

    public RecipeDtos.RecipeDetailResponse getMobileRecipe(UUID recipeId) {
        return toDetail(requirePublishedRecipe(recipeId));
    }

    public RecipeDtos.RecipeDetailResponse getAdminRecipe(UUID recipeId) {
        adminAccessService.requireAdmin();
        return toDetail(requireRecipe(recipeId));
    }

    @Transactional
    public RecipeDtos.RecipeDetailResponse createRecipe(RecipeDtos.RecipeCreateRequest request) {
        adminAccessService.requireAdmin();
        RecipeDtos.RecipeUpsertRequest recipeRequest = request.recipe();
        RecipeEntity recipe = new RecipeEntity();
        applyRecipeRequest(recipe, recipeRequest);
        AuditLogService.Actor actor = auditLogService.currentActor();
        recipe.createdByRole = actor.role();
        recipe.createdByLabel = actor.label();
        recipeRepository.persist(recipe);
        assignTags(recipe, recipeRequest.tagIds());

        if (request.ingredients() != null) {
            for (RecipeDtos.RecipeIngredientRequest ingredientRequest : request.ingredients()) {
                addIngredientInternal(recipe, ingredientRequest);
            }
        }
        if (request.steps() != null) {
            for (RecipeDtos.RecipeStepRequest stepRequest : request.steps()) {
                addStepInternal(recipe, stepRequest);
            }
        }

        RecipeDtos.RecipeDetailResponse response = toDetail(recipe);
        auditLogService.log("RECIPE", recipe.id, "CREATE", "Rezept angelegt", null, response);
        return response;
    }

    @Transactional
    public RecipeDtos.RecipeDetailResponse updateRecipe(UUID recipeId, RecipeDtos.RecipeUpsertRequest request) {
        adminAccessService.requireAdmin();
        RecipeEntity recipe = requireRecipe(recipeId);
        RecipeDtos.RecipeDetailResponse before = toDetail(recipe);
        applyRecipeRequest(recipe, request);
        assignTags(recipe, request.tagIds());
        RecipeDtos.RecipeDetailResponse after = toDetail(recipe);
        auditLogService.log("RECIPE", recipe.id, "UPDATE", "Rezept aktualisiert", before, after);
        return after;
    }

    @Transactional
    public RecipeDtos.RecipeDetailResponse publishRecipe(UUID recipeId) {
        adminAccessService.requireAdmin();
        RecipeEntity recipe = requireRecipe(recipeId);
        validatePublishable(recipe);
        RecipeDtos.RecipeDetailResponse before = toDetail(recipe);
        recipe.status = RecipeStatus.PUBLISHED;
        recipe.publishedAt = Instant.now();
        recipe.archivedAt = null;
        RecipeDtos.RecipeDetailResponse after = toDetail(recipe);
        auditLogService.log("RECIPE", recipe.id, "PUBLISH", "Rezept veroeffentlicht", before, after);
        return after;
    }

    @Transactional
    public RecipeDtos.RecipeDetailResponse deactivateRecipe(UUID recipeId) {
        adminAccessService.requireAdmin();
        RecipeEntity recipe = requireRecipe(recipeId);
        RecipeDtos.RecipeDetailResponse before = toDetail(recipe);
        recipe.status = RecipeStatus.DRAFT;
        recipe.publishedAt = null;
        recipe.archivedAt = null;
        RecipeDtos.RecipeDetailResponse after = toDetail(recipe);
        auditLogService.log("RECIPE", recipe.id, "DEACTIVATE", "Rezept deaktiviert", before, after);
        return after;
    }

    @Transactional
    public RecipeDtos.RecipeDetailResponse archiveRecipe(UUID recipeId) {
        adminAccessService.requireAdmin();
        RecipeEntity recipe = requireRecipe(recipeId);
        RecipeDtos.RecipeDetailResponse before = toDetail(recipe);
        recipe.status = RecipeStatus.ARCHIVED;
        recipe.archivedAt = Instant.now();
        RecipeDtos.RecipeDetailResponse after = toDetail(recipe);
        auditLogService.log("RECIPE", recipe.id, "ARCHIVE", "Rezept archiviert", before, after);
        return after;
    }

    @Transactional
    public RecipeDtos.RecipeIngredientResponse addIngredient(UUID recipeId, RecipeDtos.RecipeIngredientRequest request) {
        adminAccessService.requireAdmin();
        RecipeIngredientEntity ingredient = addIngredientInternal(requireRecipe(recipeId), request);
        auditLogService.log("RECIPE", recipeId, "ADD_INGREDIENT", "Rezeptzutat angelegt", null, toIngredient(ingredient));
        return toIngredient(ingredient);
    }

    @Transactional
    public RecipeDtos.RecipeIngredientResponse updateIngredient(UUID recipeId, UUID ingredientId, RecipeDtos.RecipeIngredientRequest request) {
        adminAccessService.requireAdmin();
        RecipeIngredientEntity ingredient = requireIngredient(recipeId, ingredientId);
        RecipeDtos.RecipeIngredientResponse before = toIngredient(ingredient);
        applyIngredientRequest(ingredient, request);
        RecipeDtos.RecipeIngredientResponse after = toIngredient(ingredient);
        auditLogService.log("RECIPE", recipeId, "UPDATE_INGREDIENT", "Rezeptzutat aktualisiert", before, after);
        return after;
    }

    @Transactional
    public void deleteIngredient(UUID recipeId, UUID ingredientId) {
        adminAccessService.requireAdmin();
        RecipeIngredientEntity ingredient = requireIngredient(recipeId, ingredientId);
        RecipeDtos.RecipeIngredientResponse before = toIngredient(ingredient);
        ingredientRepository.delete(ingredient);
        auditLogService.log("RECIPE", recipeId, "DELETE_INGREDIENT", "Rezeptzutat entfernt", before, null);
    }

    @Transactional
    public RecipeDtos.RecipeStepResponse addStep(UUID recipeId, RecipeDtos.RecipeStepRequest request) {
        adminAccessService.requireAdmin();
        RecipeStepEntity step = addStepInternal(requireRecipe(recipeId), request);
        auditLogService.log("RECIPE", recipeId, "ADD_STEP", "Rezeptschritt angelegt", null, toStep(step));
        return toStep(step);
    }

    @Transactional
    public RecipeDtos.RecipeStepResponse updateStep(UUID recipeId, UUID stepId, RecipeDtos.RecipeStepRequest request) {
        adminAccessService.requireAdmin();
        RecipeStepEntity step = requireStep(recipeId, stepId);
        RecipeDtos.RecipeStepResponse before = toStep(step);
        applyStepRequest(step, request);
        RecipeDtos.RecipeStepResponse after = toStep(step);
        auditLogService.log("RECIPE", recipeId, "UPDATE_STEP", "Rezeptschritt aktualisiert", before, after);
        return after;
    }

    @Transactional
    public void deleteStep(UUID recipeId, UUID stepId) {
        adminAccessService.requireAdmin();
        RecipeStepEntity step = requireStep(recipeId, stepId);
        RecipeDtos.RecipeStepResponse before = toStep(step);
        stepRepository.delete(step);
        auditLogService.log("RECIPE", recipeId, "DELETE_STEP", "Rezeptschritt entfernt", before, null);
    }

    public List<RecipeDtos.RecipeTagResponse> listTags(RecordStatus status, String query) {
        if (status == null) {
            status = RecordStatus.ACTIVE;
        }
        StringBuilder hql = new StringBuilder("status = :status");
        Map<String, Object> params = new HashMap<>();
        params.put("status", status);
        if (query != null && !query.isBlank()) {
            hql.append(" and (lower(name) like :query or lower(code) like :query)");
            params.put("query", "%" + query.trim().toLowerCase(Locale.ROOT) + "%");
        }
        return tagRepository.find(hql.toString(), Sort.by("name"), params)
                .list()
                .stream()
                .map(this::toTag)
                .toList();
    }

    @Transactional
    public RecipeDtos.RecipeTagResponse createTag(RecipeDtos.RecipeTagRequest request) {
        adminAccessService.requireAdmin();
        tagRepository.findByCode(request.code().trim()).ifPresent(existing -> {
            throw conflict("Ein Rezept-Tag mit diesem Code existiert bereits.");
        });
        RecipeTagEntity tag = new RecipeTagEntity();
        applyTagRequest(tag, request);
        tagRepository.persist(tag);
        RecipeDtos.RecipeTagResponse response = toTag(tag);
        auditLogService.logByAdmin(adminAccessService.currentUser(), "RECIPE_TAG", tag.id, "CREATE",
                "Rezept-Tag angelegt", null, response);
        return response;
    }

    @Transactional
    public RecipeDtos.RecipeTagResponse updateTag(UUID tagId, RecipeDtos.RecipeTagRequest request) {
        adminAccessService.requireAdmin();
        RecipeTagEntity tag = tagRepository.findByIdOptional(tagId)
                .orElseThrow(() -> new NotFoundException("Rezept-Tag nicht gefunden."));
        tagRepository.findByCode(request.code().trim())
                .filter(existing -> !existing.id.equals(tagId))
                .ifPresent(existing -> {
                    throw conflict("Ein Rezept-Tag mit diesem Code existiert bereits.");
                });
        RecipeDtos.RecipeTagResponse before = toTag(tag);
        applyTagRequest(tag, request);
        RecipeDtos.RecipeTagResponse after = toTag(tag);
        auditLogService.logByAdmin(adminAccessService.currentUser(), "RECIPE_TAG", tag.id, "UPDATE",
                "Rezept-Tag aktualisiert", before, after);
        return after;
    }

    @Transactional
    public RecipeDtos.RecipeTagResponse archiveTag(UUID tagId) {
        adminAccessService.requireAdmin();
        RecipeTagEntity tag = tagRepository.findByIdOptional(tagId)
                .orElseThrow(() -> new NotFoundException("Rezept-Tag nicht gefunden."));
        RecipeDtos.RecipeTagResponse before = toTag(tag);
        tag.status = RecordStatus.ARCHIVED;
        RecipeDtos.RecipeTagResponse after = toTag(tag);
        auditLogService.logByAdmin(adminAccessService.currentUser(), "RECIPE_TAG", tag.id, "ARCHIVE",
                "Rezept-Tag archiviert", before, after);
        return after;
    }

    public RecipeDtos.RecipeProductMappingResponse mappingStatus(UUID recipeId, UUID storeId, String storeCode, boolean requirePublished) {
        RecipeEntity recipe = requirePublished ? requirePublishedRecipe(recipeId) : requireRecipe(recipeId);
        return new RecipeDtos.RecipeProductMappingResponse(
                recipe.id,
                storeId,
                normalizeOptional(storeCode),
                sortedIngredients(recipe).stream()
                        .map(ingredient -> mappingStatusFor(ingredient, storeId, storeCode))
                        .toList()
        );
    }

    public List<RecipeDtos.MappedRecipeProduct> mappingSuggestions(UUID recipeId, UUID ingredientId, UUID storeId, String query, int size) {
        adminAccessService.requireAdmin();
        RecipeIngredientEntity ingredient = requireIngredient(recipeId, ingredientId);
        String searchQuery = normalizeOptional(query);
        if (searchQuery == null) {
            searchQuery = normalizeOptional(ingredient.canonicalName);
        }
        if (searchQuery == null) {
            searchQuery = ingredient.displayName;
        }
        String storeCode = null;
        if (storeId != null) {
            storeCode = storeRepository.findByIdOptional(storeId).map(store -> store.storeCode).orElse(null);
        }
        try {
            return openSearchService.searchProducts(searchQuery, Math.min(Math.max(size, 1), 25), storeId == null ? null : storeId.toString(), storeCode)
                    .stream()
                    .map(this::toMappedProduct)
                    .toList();
        } catch (IOException exception) {
            LOG.warn("Recipe mapping suggestions failed", exception);
            return List.of();
        }
    }

    @Transactional
    public RecipeDtos.IngredientMappingStatusResponse confirmMapping(UUID recipeId,
                                                                     UUID ingredientId,
                                                                     RecipeDtos.ProductMappingRequest request) {
        adminAccessService.requireAdmin();
        RecipeIngredientEntity ingredient = requireIngredient(recipeId, ingredientId);
        Product product = requireProduct(request.productId());
        StoreEntity store = request.storeId() == null
                ? null
                : storeRepository.findByIdOptional(request.storeId()).orElseThrow(() -> new NotFoundException("Filiale nicht gefunden."));
        validateProductStoreContext(product, request.storeId(), request.storeCode());
        mappingRepository.findActiveByIngredientAndProduct(ingredientId, request.productId(), request.storeId()).ifPresent(existing -> {
            throw conflict("Dieses Produkt ist fuer die Zutat bereits aktiv gemappt.");
        });

        IngredientProductMappingEntity mapping = new IngredientProductMappingEntity();
        mapping.recipeIngredient = ingredient;
        // Ingredient-scoped mappings already have a unique ingredient/product key.
        // canonicalName is reserved for reusable mappings without a recipe ingredient;
        // setting both keys prevents two recipes from using the same named product.
        mapping.canonicalName = null;
        mapping.store = store;
        mapping.storeCode = firstNonBlank(product.getStoreCode(), request.storeCode(), store == null ? null : store.storeCode);
        mapping.productId = product.getId();
        mapping.productNameSnapshot = normalizeOptional(product.getName());
        mapping.layoutCodeSnapshot = normalizeOptional(product.getLayoutCode());
        mapping.mappingType = parseMappingType(request.mappingType());
        mapping.confidence = request.confidence() == null ? BigDecimal.ONE : request.confidence();
        mapping.manuallyConfirmed = request.manuallyConfirmed() == null || request.manuallyConfirmed();
        mapping.status = RecordStatus.ACTIVE;

        mappingRepository.persist(mapping);
        auditLogService.log("RECIPE", recipeId, "CONFIRM_MAPPING", "Zutat einem Produkt zugeordnet", null, mapping.productNameSnapshot);
        return mappingStatusFor(ingredient, request.storeId(), mapping.storeCode);
    }

    @Transactional
    public void archiveMapping(UUID recipeId, UUID ingredientId, UUID mappingId) {
        adminAccessService.requireAdmin();
        requireIngredient(recipeId, ingredientId);
        IngredientProductMappingEntity mapping = mappingRepository.findByIdOptional(mappingId)
                .orElseThrow(() -> new NotFoundException("Produkt-Mapping nicht gefunden."));
        if (mapping.recipeIngredient == null || !mapping.recipeIngredient.id.equals(ingredientId)) {
            throw new NotFoundException("Produkt-Mapping nicht gefunden.");
        }
        mapping.status = RecordStatus.ARCHIVED;
        auditLogService.log("RECIPE", recipeId, "ARCHIVE_MAPPING", "Produkt-Mapping archiviert", mapping.productNameSnapshot, null);
    }

    private CommonDtos.PageResponse<RecipeDtos.RecipeSummaryResponse> listRecipes(String query,
                                                                                  String tag,
                                                                                  RecipeStatus status,
                                                                                  int page,
                                                                                  int size,
                                                                                  UUID storeId,
                                                                                  String sort) {
        StringBuilder hql = new StringBuilder("1 = 1");
        Map<String, Object> params = new HashMap<>();
        if (status != null) {
            hql.append(" and status = :status");
            params.put("status", status);
        }
        if (query != null && !query.isBlank()) {
            hql.append(" and (lower(title) like :query or lower(slug) like :query or lower(summary) like :query or lower(description) like :query)");
            params.put("query", "%" + query.trim().toLowerCase(Locale.ROOT) + "%");
        }
        if (tag != null && !tag.isBlank()) {
            // Panache supplies the outer RecipeEntity alias. An unqualified `id`
            // inside the subquery resolves to the assignment instead and fails HQL
            // interpretation. Keep the tag predicate as a non-correlated ID set.
            hql.append(" and id in (select assignment.recipe.id from RecipeTagAssignmentEntity assignment where lower(assignment.tag.code) = :tag)");
            params.put("tag", tag.trim().toLowerCase(Locale.ROOT));
        }

        PanacheQuery<RecipeEntity> panacheQuery = recipeRepository.find(
                hql.toString(),
                Sort.descending("publishedAt").and("title"),
                params
        );
        if (sort != null) {
            // Sort the complete filtered result before taking a page. Sorting a page would
            // produce incorrect cross-page order for the legacy numeric-aware Title sort.
            List<RecipeEntity> sorted = new ArrayList<>(panacheQuery.list());
            sorted.sort(RecipeSort.comparator(sort));
            int normalizedPage = Math.max(page, 0);
            int normalizedSize = Math.max(size, 1);
            long start = (long) normalizedPage * normalizedSize;
            List<RecipeEntity> slice = start >= sorted.size() ? List.of()
                    : sorted.subList((int) start, (int) Math.min(start + normalizedSize, sorted.size()));
            return new CommonDtos.PageResponse<>(slice.stream().map(recipe -> toSummary(recipe, storeId)).toList(),
                    normalizedPage, normalizedSize, sorted.size());
        }
        panacheQuery.page(Page.of(Math.max(page, 0), Math.max(size, 1)));
        return new CommonDtos.PageResponse<>(
                panacheQuery.list().stream().map(recipe -> toSummary(recipe, storeId)).toList(),
                Math.max(page, 0),
                Math.max(size, 1),
                panacheQuery.count()
        );
    }

    private void applyRecipeRequest(RecipeEntity recipe, RecipeDtos.RecipeUpsertRequest request) {
        String normalizedSlug = normalizeSlug(request.slug());
        recipeRepository.findBySlug(normalizedSlug)
                .filter(existing -> recipe.id == null || !existing.id.equals(recipe.id))
                .ifPresent(existing -> {
                    throw conflict("Ein Rezept mit diesem Slug existiert bereits.");
                });
        recipe.slug = normalizedSlug;
        recipe.title = request.title().trim();
        recipe.summary = trimToNull(request.summary());
        recipe.description = trimToNull(request.description());
        recipe.imageUrl = trimToNull(request.imageUrl());
        recipe.imageAlt = trimToNull(request.imageAlt());
        recipe.servings = request.servings();
        recipe.prepTimeMinutes = request.prepTimeMinutes();
        recipe.cookTimeMinutes = request.cookTimeMinutes();
        recipe.totalTimeMinutes = request.totalTimeMinutes();
        if (request.status() != null && !request.status().isBlank()) {
            recipe.status = parseRecipeStatus(request.status());
        }
        if (recipe.status == RecipeStatus.PUBLISHED && recipe.publishedAt == null) {
            recipe.publishedAt = Instant.now();
        }
        if (recipe.status != RecipeStatus.PUBLISHED) {
            recipe.publishedAt = null;
        }
        if (recipe.status == RecipeStatus.ARCHIVED && recipe.archivedAt == null) {
            recipe.archivedAt = Instant.now();
        }
    }

    private RecipeIngredientEntity addIngredientInternal(RecipeEntity recipe, RecipeDtos.RecipeIngredientRequest request) {
        RecipeIngredientEntity ingredient = new RecipeIngredientEntity();
        ingredient.recipe = recipe;
        applyIngredientRequest(ingredient, request);
        recipe.ingredients.add(ingredient);
        ingredientRepository.persist(ingredient);
        return ingredient;
    }

    private void applyIngredientRequest(RecipeIngredientEntity ingredient, RecipeDtos.RecipeIngredientRequest request) {
        assertUniqueIngredientPosition(ingredient.recipe.id, ingredient.id, request.position());
        ingredient.position = request.position();
        ingredient.displayName = request.displayName().trim();
        ingredient.canonicalName = trimToNull(request.canonicalName());
        ingredient.quantity = request.quantity();
        ingredient.quantityText = trimToNull(request.quantityText());
        ingredient.unit = request.unitCode() == null || request.unitCode().isBlank()
                ? null
                : unitRepository.findByIdOptional(request.unitCode().trim()).orElseThrow(() -> new NotFoundException("Einheit nicht gefunden."));
        ingredient.preparationNote = trimToNull(request.preparationNote());
        ingredient.optional = request.optional() != null && request.optional();
    }

    private RecipeStepEntity addStepInternal(RecipeEntity recipe, RecipeDtos.RecipeStepRequest request) {
        RecipeStepEntity step = new RecipeStepEntity();
        step.recipe = recipe;
        applyStepRequest(step, request);
        recipe.steps.add(step);
        stepRepository.persist(step);
        return step;
    }

    private void applyStepRequest(RecipeStepEntity step, RecipeDtos.RecipeStepRequest request) {
        assertUniqueStepPosition(step.recipe.id, step.id, request.position());
        step.position = request.position();
        step.instruction = request.instruction().trim();
        step.durationMinutes = request.durationMinutes();
    }

    private void assignTags(RecipeEntity recipe, List<UUID> tagIds) {
        if (tagIds == null) {
            return;
        }
        recipe.tagAssignments.clear();
        entityManager.flush();
        for (UUID tagId : tagIds.stream().filter(Objects::nonNull).distinct().toList()) {
            RecipeTagEntity tag = tagRepository.findByIdOptional(tagId)
                    .orElseThrow(() -> new NotFoundException("Rezept-Tag nicht gefunden."));
            RecipeTagAssignmentEntity assignment = new RecipeTagAssignmentEntity();
            assignment.recipe = recipe;
            assignment.tag = tag;
            recipe.tagAssignments.add(assignment);
            entityManager.persist(assignment);
        }
    }

    private void applyTagRequest(RecipeTagEntity tag, RecipeDtos.RecipeTagRequest request) {
        tag.code = normalizeSlug(request.code());
        tag.name = request.name().trim();
        tag.kind = trimToNull(request.kind());
        tag.status = request.status() == null || request.status().isBlank()
                ? RecordStatus.ACTIVE
                : RecordStatus.valueOf(request.status().trim().toUpperCase(Locale.ROOT));
    }

    private RecipeDtos.IngredientMappingStatusResponse mappingStatusFor(RecipeIngredientEntity ingredient, UUID storeId, String storeCode) {
        List<IngredientProductMappingEntity> activeMappings = mappingRepository.listActiveByIngredient(ingredient.id);
        List<IngredientProductMappingEntity> preferred = preferredMappings(activeMappings, storeId, storeCode);
        if (preferred.isEmpty()) {
            return new RecipeDtos.IngredientMappingStatusResponse(
                    ingredient.id,
                    ingredient.displayName,
                    "UNMAPPED",
                    null,
                    List.of(),
                    null,
                    false,
                    "Keine Produktzuordnung vorhanden."
            );
        }

        List<RecipeDtos.MappedRecipeProduct> candidates = preferred.stream()
                .map(this::mappedProductFor)
                .filter(Objects::nonNull)
                .toList();
        if (candidates.isEmpty()) {
            return new RecipeDtos.IngredientMappingStatusResponse(
                    ingredient.id,
                    ingredient.displayName,
                    "UNAVAILABLE_IN_STORE",
                    null,
                    List.of(),
                    preferred.get(0).confidence,
                    preferred.get(0).manuallyConfirmed,
                    "Das gemappte Produkt konnte im Katalog nicht aufgeloest werden."
            );
        }
        if (candidates.size() > 1) {
            return new RecipeDtos.IngredientMappingStatusResponse(
                    ingredient.id,
                    ingredient.displayName,
                    "MULTIPLE_CANDIDATES",
                    null,
                    candidates,
                    preferred.get(0).confidence,
                    preferred.stream().anyMatch(mapping -> mapping.manuallyConfirmed),
                    "Mehrere passende Produkte vorhanden."
            );
        }

        RecipeDtos.MappedRecipeProduct product = candidates.get(0);
        String status = product.layoutCode() == null || product.layoutCode().isBlank()
                ? "PRODUCT_WITHOUT_LAYOUT"
                : "MAPPED";
        return new RecipeDtos.IngredientMappingStatusResponse(
                ingredient.id,
                ingredient.displayName,
                status,
                product,
                List.of(),
                preferred.get(0).confidence,
                preferred.get(0).manuallyConfirmed,
                status.equals("MAPPED") ? null : "Produkt hat keinen Layout-Code."
        );
    }

    private List<IngredientProductMappingEntity> preferredMappings(List<IngredientProductMappingEntity> mappings, UUID storeId, String storeCode) {
        String normalizedStoreCode = normalizeOptional(storeCode);
        List<IngredientProductMappingEntity> storeMatches = mappings.stream()
                .filter(mapping -> storeId != null && mapping.store != null && storeId.equals(mapping.store.id)
                        || normalizedStoreCode != null && normalizedStoreCode.equalsIgnoreCase(mapping.storeCode))
                .toList();
        if (!storeMatches.isEmpty()) {
            return storeMatches;
        }
        return mappings.stream()
                .filter(mapping -> mapping.store == null && normalizeOptional(mapping.storeCode) == null)
                .toList();
    }

    private RecipeDtos.MappedRecipeProduct mappedProductFor(IngredientProductMappingEntity mapping) {
        Product product = resolveProduct(mapping.productId);
        if (product != null) {
            return toMappedProduct(product);
        }
        if (mapping.productNameSnapshot == null) {
            return null;
        }
        return new RecipeDtos.MappedRecipeProduct(
                mapping.productId,
                mapping.productNameSnapshot,
                null,
                mapping.layoutCodeSnapshot,
                mapping.store == null ? null : mapping.store.id.toString(),
                mapping.storeCode
        );
    }

    private Product resolveProduct(Integer productId) {
        try {
            return openSearchService.getProductById(productId);
        } catch (IOException exception) {
            LOG.warn("Could not resolve recipe product " + productId, exception);
            return null;
        }
    }

    private Product requireProduct(Integer productId) {
        Product product;
        try {
            product = openSearchService.getProductById(productId);
        } catch (IOException exception) {
            LOG.warn("Could not verify recipe mapping product " + productId, exception);
            throw new WebApplicationException("Produktkatalog nicht erreichbar.", Response.Status.INTERNAL_SERVER_ERROR);
        }
        if (product == null) {
            throw new NotFoundException("Produkt nicht gefunden.");
        }
        return product;
    }

    private void validateProductStoreContext(Product product, UUID requestedStoreId, String requestedStoreCode) {
        String productStoreId = normalizeOptional(product.getStoreId());
        if (requestedStoreId != null && productStoreId != null && !productStoreId.equalsIgnoreCase(requestedStoreId.toString())) {
            throw badRequest("Produkt gehoert nicht zur angefragten Filiale.");
        }

        String productStoreCode = normalizeOptional(product.getStoreCode());
        String normalizedRequestedStoreCode = normalizeOptional(requestedStoreCode);
        if (normalizedRequestedStoreCode != null && productStoreCode != null && !productStoreCode.equalsIgnoreCase(normalizedRequestedStoreCode)) {
            throw badRequest("Produkt gehoert nicht zum angefragten Store-Code.");
        }
    }

    private RecipeDtos.MappedRecipeProduct toMappedProduct(Product product) {
        return new RecipeDtos.MappedRecipeProduct(
                product.getId(),
                product.getName(),
                product.getPrice(),
                product.getLayoutCode(),
                product.getStoreId(),
                product.getStoreCode()
        );
    }

    private RecipeDtos.RecipeSummaryResponse toSummary(RecipeEntity recipe, UUID storeId) {
        List<RecipeIngredientEntity> ingredients = sortedIngredients(recipe);
        long mapped = ingredients.stream()
                .filter(ingredient -> !"UNMAPPED".equals(mappingStatusFor(ingredient, storeId, null).status()))
                .count();
        return new RecipeDtos.RecipeSummaryResponse(
                recipe.id,
                recipe.slug,
                recipe.title,
                recipe.summary,
                recipe.imageUrl,
                recipe.servings,
                recipe.prepTimeMinutes,
                recipe.cookTimeMinutes,
                recipe.totalTimeMinutes,
                recipe.steps.size(),
                recipe.status.name(),
                recipe.publishedAt,
                (int) mapped,
                ingredients.size(),
                sortedTags(recipe)
        );
    }

    private RecipeDtos.RecipeDetailResponse toDetail(RecipeEntity recipe) {
        return new RecipeDtos.RecipeDetailResponse(
                recipe.id,
                recipe.slug,
                recipe.title,
                recipe.summary,
                recipe.description,
                recipe.imageUrl,
                recipe.imageAlt,
                recipe.servings,
                recipe.prepTimeMinutes,
                recipe.cookTimeMinutes,
                recipe.totalTimeMinutes,
                recipe.status.name(),
                recipe.publishedAt,
                recipe.archivedAt,
                recipe.createdAt,
                recipe.updatedAt,
                sortedTags(recipe),
                sortedIngredients(recipe).stream().map(this::toIngredient).toList(),
                sortedSteps(recipe).stream().map(this::toStep).toList()
        );
    }

    private RecipeDtos.RecipeIngredientResponse toIngredient(RecipeIngredientEntity ingredient) {
        return new RecipeDtos.RecipeIngredientResponse(
                ingredient.id,
                ingredient.position,
                ingredient.displayName,
                ingredient.canonicalName,
                ingredient.quantity,
                ingredient.quantityText,
                ingredient.unit == null ? null : ingredient.unit.code,
                ingredient.unit == null ? null : ingredient.unit.displayName,
                ingredient.preparationNote,
                ingredient.optional
        );
    }

    private RecipeDtos.RecipeStepResponse toStep(RecipeStepEntity step) {
        return new RecipeDtos.RecipeStepResponse(step.id, step.position, step.instruction, step.durationMinutes);
    }

    private RecipeDtos.RecipeTagResponse toTag(RecipeTagEntity tag) {
        return new RecipeDtos.RecipeTagResponse(tag.id, tag.code, tag.name, tag.kind, tag.status.name());
    }

    private List<RecipeIngredientEntity> sortedIngredients(RecipeEntity recipe) {
        return recipe.ingredients.stream()
                .sorted(Comparator.comparing(ingredient -> ingredient.position))
                .toList();
    }

    private List<RecipeStepEntity> sortedSteps(RecipeEntity recipe) {
        return recipe.steps.stream()
                .sorted(Comparator.comparing(step -> step.position))
                .toList();
    }

    private List<RecipeDtos.RecipeTagResponse> sortedTags(RecipeEntity recipe) {
        return recipe.tagAssignments.stream()
                .map(assignment -> assignment.tag)
                .sorted(Comparator.comparing(tag -> tag.name))
                .map(this::toTag)
                .toList();
    }

    private RecipeEntity requireRecipe(UUID recipeId) {
        return recipeRepository.findByIdOptional(recipeId)
                .orElseThrow(() -> new NotFoundException("Rezept nicht gefunden."));
    }

    private RecipeEntity requirePublishedRecipe(UUID recipeId) {
        return recipeRepository.findPublishedById(recipeId)
                .orElseThrow(() -> new NotFoundException("Rezept nicht gefunden."));
    }

    private RecipeIngredientEntity requireIngredient(UUID recipeId, UUID ingredientId) {
        return ingredientRepository.find("id = ?1 and recipe.id = ?2", ingredientId, recipeId)
                .firstResultOptional()
                .orElseThrow(() -> new NotFoundException("Rezeptzutat nicht gefunden."));
    }

    private RecipeStepEntity requireStep(UUID recipeId, UUID stepId) {
        return stepRepository.find("id = ?1 and recipe.id = ?2", stepId, recipeId)
                .firstResultOptional()
                .orElseThrow(() -> new NotFoundException("Rezeptschritt nicht gefunden."));
    }

    private void validatePublishable(RecipeEntity recipe) {
        if (recipe.title == null || recipe.title.isBlank()) {
            throw badRequest("Titel ist erforderlich.");
        }
        if (recipe.ingredients.isEmpty()) {
            throw badRequest("Mindestens eine Zutat ist erforderlich.");
        }
        if (recipe.steps.isEmpty()) {
            throw badRequest("Mindestens ein Zubereitungsschritt ist erforderlich.");
        }
    }

    private void assertUniqueIngredientPosition(UUID recipeId, UUID ingredientId, Integer position) {
        ingredientRepository.find("recipe.id = ?1 and position = ?2", recipeId, position)
                .firstResultOptional()
                .filter(existing -> ingredientId == null || !existing.id.equals(ingredientId))
                .ifPresent(existing -> {
                    throw conflict("Diese Zutatenposition ist bereits vergeben.");
                });
    }

    private void assertUniqueStepPosition(UUID recipeId, UUID stepId, Integer position) {
        stepRepository.find("recipe.id = ?1 and position = ?2", recipeId, position)
                .firstResultOptional()
                .filter(existing -> stepId == null || !existing.id.equals(stepId))
                .ifPresent(existing -> {
                    throw conflict("Diese Schrittposition ist bereits vergeben.");
                });
    }

    private RecipeStatus parseRecipeStatus(String status) {
        try {
            return RecipeStatus.valueOf(status.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw badRequest("Ungueltiger Rezeptstatus.");
        }
    }

    private RecipeMappingType parseMappingType(String value) {
        if (value == null || value.isBlank()) {
            return RecipeMappingType.MANUAL;
        }
        try {
            return RecipeMappingType.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw badRequest("Ungueltiger Mapping-Typ.");
        }
    }

    private String normalizeSlug(String value) {
        return value.trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9\\-]+", "-").replaceAll("(^-|-$)", "");
    }

    private String trimToNull(String value) {
        String normalized = normalizeOptional(value);
        return normalized == null ? null : normalized;
    }

    private String normalizeOptional(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            String normalized = normalizeOptional(value);
            if (normalized != null) {
                return normalized;
            }
        }
        return null;
    }

    private WebApplicationException badRequest(String message) {
        return new WebApplicationException(message, Response.Status.BAD_REQUEST);
    }

    private WebApplicationException conflict(String message) {
        return new WebApplicationException(message, Response.Status.CONFLICT);
    }
}
