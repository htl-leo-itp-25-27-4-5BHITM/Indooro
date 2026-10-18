package at.htl.admin.repository.recipe;

import at.htl.admin.entity.RecordStatus;
import at.htl.admin.entity.recipe.IngredientProductMappingEntity;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@ApplicationScoped
public class IngredientProductMappingRepository implements PanacheRepositoryBase<IngredientProductMappingEntity, UUID> {

    public List<IngredientProductMappingEntity> listActiveByIngredient(UUID ingredientId) {
        return list("recipeIngredient.id = ?1 and status = ?2 order by manuallyConfirmed desc, confidence desc nulls last",
                ingredientId,
                RecordStatus.ACTIVE);
    }

    public Optional<IngredientProductMappingEntity> findActiveByIngredientAndProduct(UUID ingredientId, Integer productId, UUID storeId) {
        if (storeId == null) {
            return find("recipeIngredient.id = ?1 and productId = ?2 and store is null and status = ?3",
                    ingredientId,
                    productId,
                    RecordStatus.ACTIVE).firstResultOptional();
        }
        return find("recipeIngredient.id = ?1 and productId = ?2 and store.id = ?3 and status = ?4",
                ingredientId,
                productId,
                storeId,
                RecordStatus.ACTIVE).firstResultOptional();
    }

    /**
     * Zutaten mit mindestens einer aktiven Zuordnung je Rezept, fuer alle genannten Rezepte in einer Gruppierung.
     * Die Bedingung spiegelt {@code RecipeService#preferredMappings}: Zuordnungen der Filiale oder, ohne
     * Filialtreffer, globale Zuordnungen (ohne Filiale und ohne Store-Code). Ohne storeId gelten nur globale Zuordnungen.
     */
    public Map<UUID, Long> countMappedIngredientsByRecipeIds(Collection<UUID> recipeIds, UUID storeId) {
        String storeMatch = storeId == null ? "" : "m.store.id = :storeId or ";
        var query = getEntityManager()
                .createQuery("select ingredient.recipe.id, count(distinct ingredient.id) "
                        + "from IngredientProductMappingEntity m "
                        + "join m.recipeIngredient ingredient "
                        + "where ingredient.recipe.id in :recipeIds "
                        + "and m.status = :status "
                        + "and (" + storeMatch + "(m.store is null and (m.storeCode is null or trim(m.storeCode) = ''))) "
                        + "group by ingredient.recipe.id", Object[].class)
                .setParameter("recipeIds", recipeIds)
                .setParameter("status", RecordStatus.ACTIVE);
        if (storeId != null) {
            query.setParameter("storeId", storeId);
        }
        List<Object[]> rows = query.getResultList();
        Map<UUID, Long> counts = new HashMap<>();
        for (Object[] row : rows) {
            counts.put((UUID) row[0], (Long) row[1]);
        }
        return counts;
    }
}
