package at.htl.admin.repository.recipe;

import at.htl.admin.entity.recipe.RecipeEntity;
import at.htl.admin.entity.recipe.RecipeStatus;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.TypedQuery;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@ApplicationScoped
public class RecipeRepository implements PanacheRepositoryBase<RecipeEntity, UUID> {

    public Optional<RecipeEntity> findBySlug(String slug) {
        return find("lower(slug) = ?1", slug.toLowerCase()).firstResultOptional();
    }

    public Optional<RecipeEntity> findPublishedById(UUID recipeId) {
        return find("id = ?1 and status = ?2", recipeId, RecipeStatus.PUBLISHED).firstResultOptional();
    }

    /**
     * Eine Seite der Rezept-IDs fuer einen Filter (HQL-Bedingung ohne `where`). Sortierung wie bisher: neueste
     * Veroeffentlichung zuerst, dann Titel; die ID haelt die Reihenfolge bei Gleichstand stabil.
     */
    public List<UUID> listPageIds(String where, Map<String, Object> params, int page, int size) {
        TypedQuery<UUID> query = getEntityManager().createQuery(
                "select r.id from RecipeEntity r where " + where
                        + " order by r.publishedAt desc, r.title asc, r.id asc",
                UUID.class);
        params.forEach((name, value) -> query.setParameter(name, value));
        return query.setFirstResult(page * size).setMaxResults(size).getResultList();
    }

    public long countMatching(String where, Map<String, Object> params) {
        TypedQuery<Long> query = getEntityManager().createQuery(
                "select count(r) from RecipeEntity r where " + where,
                Long.class);
        params.forEach((name, value) -> query.setParameter(name, value));
        return query.getSingleResult();
    }

    /** Laedt Rezepte mit ihren Tag-Zuordnungen in einer Abfrage. Reihenfolge der Ergebnisse ist nicht garantiert. */
    public List<RecipeEntity> listWithTagsByIds(Collection<UUID> recipeIds) {
        return getEntityManager().createQuery(
                        "select r from RecipeEntity r "
                                + "left join fetch r.tagAssignments assignment "
                                + "left join fetch assignment.tag "
                                + "where r.id in :recipeIds",
                        RecipeEntity.class)
                .setParameter("recipeIds", recipeIds)
                .getResultList();
    }
}
