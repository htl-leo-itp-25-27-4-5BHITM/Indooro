package at.htl.admin.repository;

import at.htl.admin.entity.UpsellDismissalEntity;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@ApplicationScoped
public class UpsellDismissalRepository implements PanacheRepositoryBase<UpsellDismissalEntity, UUID> {

    /** Null-safe: a null argument matches only rows where that column is null. */
    private static final String STORE_AND_SESSION = """
            ((:storeId is null and d.storeId is null) or d.storeId = :storeId)
            and ((:sessionHash is null and d.sessionHash is null) or d.sessionHash = :sessionHash)
            """;

    /** Exact match on the checked product; a null suggestedProductId targets the product as a whole. */
    private static final String MATCH_KEYS = """
            d.checkedProductId = :checkedProductId
            and ((:suggestedProductId is null and d.suggestedProductId is null) or d.suggestedProductId = :suggestedProductId)
            and """ + STORE_AND_SESSION;

    public Optional<UpsellDismissalEntity> findMatching(
            Integer checkedProductId,
            Integer suggestedProductId,
            UUID storeId,
            String sessionHash
    ) {
        return getEntityManager()
                .createQuery("from UpsellDismissalEntity d where " + MATCH_KEYS, UpsellDismissalEntity.class)
                .setParameter("checkedProductId", checkedProductId)
                .setParameter("suggestedProductId", suggestedProductId)
                .setParameter("storeId", storeId)
                .setParameter("sessionHash", sessionHash)
                .setMaxResults(1)
                .getResultList()
                .stream()
                .findFirst();
    }

    /**
     * Dismissals still in force (suppressed_until after {@code now}) for the checked product, store and session,
     * both product-specific and whole-product ones. An empty list means nothing is suppressed.
     */
    public List<UpsellDismissalEntity> findActiveForCheckedProduct(
            Integer checkedProductId,
            UUID storeId,
            String sessionHash,
            Instant now
    ) {
        return getEntityManager()
                .createQuery("from UpsellDismissalEntity d where d.checkedProductId = :checkedProductId and "
                        + STORE_AND_SESSION + " and d.suppressedUntil > :now", UpsellDismissalEntity.class)
                .setParameter("checkedProductId", checkedProductId)
                .setParameter("storeId", storeId)
                .setParameter("sessionHash", sessionHash)
                .setParameter("now", now)
                .getResultList();
    }
}
