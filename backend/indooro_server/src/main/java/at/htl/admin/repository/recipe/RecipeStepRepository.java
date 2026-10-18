package at.htl.admin.repository.recipe;

import at.htl.admin.entity.recipe.RecipeStepEntity;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@ApplicationScoped
public class RecipeStepRepository implements PanacheRepositoryBase<RecipeStepEntity, UUID> {

    public List<RecipeStepEntity> listByRecipe(UUID recipeId) {
        return list("recipe.id = ?1 order by position", recipeId);
    }

    /** Anzahl der Schritte je Rezept fuer alle genannten Rezepte in einer Gruppierung. Rezepte ohne Schritte fehlen. */
    public Map<UUID, Long> countByRecipeIds(Collection<UUID> recipeIds) {
        List<Object[]> rows = getEntityManager()
                .createQuery("select s.recipe.id, count(s) from RecipeStepEntity s "
                        + "where s.recipe.id in :recipeIds group by s.recipe.id", Object[].class)
                .setParameter("recipeIds", recipeIds)
                .getResultList();
        Map<UUID, Long> counts = new HashMap<>();
        for (Object[] row : rows) {
            counts.put((UUID) row[0], (Long) row[1]);
        }
        return counts;
    }
}
