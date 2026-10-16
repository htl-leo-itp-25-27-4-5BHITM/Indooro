package at.htl.admin.repository;

import at.htl.admin.entity.LayoutUnderlayEntity;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.UUID;

@ApplicationScoped
public class LayoutUnderlayRepository implements PanacheRepositoryBase<LayoutUnderlayEntity, UUID> {
}
