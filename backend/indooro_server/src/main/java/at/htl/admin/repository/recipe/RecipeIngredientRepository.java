package at.htl.admin.repository.recipe;

import at.htl.admin.entity.recipe.RecipeIngredientEntity;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@ApplicationScoped
public class RecipeIngredientRepository implements PanacheRepositoryBase<RecipeIngredientEntity, UUID> {

    public List<RecipeIngredientEntity> listByRecipe(UUID recipeId) {
        return list("recipe.id = ?1 order by position", recipeId);
    }

    /** Anzahl der Zutaten je Rezept fuer alle genannten Rezepte in einer Gruppierung. Rezepte ohne Zutaten fehlen. */
    public Map<UUID, Long> countByRecipeIds(Collection<UUID> recipeIds) {
        List<Object[]> rows = getEntityManager()
                .createQuery("select i.recipe.id, count(i) from RecipeIngredientEntity i "
                        + "where i.recipe.id in :recipeIds group by i.recipe.id", Object[].class)
                .setParameter("recipeIds", recipeIds)
                .getResultList();
        Map<UUID, Long> counts = new HashMap<>();
        for (Object[] row : rows) {
            counts.put((UUID) row[0], (Long) row[1]);
        }
        return counts;
    }
}
