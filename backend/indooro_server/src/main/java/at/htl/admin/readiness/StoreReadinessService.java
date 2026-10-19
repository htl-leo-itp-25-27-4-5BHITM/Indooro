package at.htl.admin.readiness;

import at.htl.admin.entity.BeaconAssignmentEntity;
import at.htl.admin.entity.LayoutVersionEntity;
import at.htl.admin.entity.StoreEntity;
import at.htl.admin.readiness.ReadinessDtos.AssignedBeacon;
import at.htl.admin.readiness.ReadinessDtos.ProductPage;
import at.htl.admin.readiness.ReadinessDtos.ReadinessInput;
import at.htl.admin.readiness.ReadinessDtos.ReadinessReport;
import at.htl.admin.repository.BeaconAssignmentRepository;
import at.htl.admin.repository.LayoutVersionRepository;
import at.htl.admin.repository.StoreRepository;
import at.htl.admin.service.AdminAccessService;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

/** Loads the data for the readiness report and delegates the evaluation to the pure evaluator. */
@ApplicationScoped
public class StoreReadinessService {

    private static final Logger LOG = Logger.getLogger(StoreReadinessService.class);

    @Inject
    AdminAccessService adminAccessService;

    @Inject
    StoreRepository storeRepository;

    @Inject
    LayoutVersionRepository layoutVersionRepository;

    @Inject
    BeaconAssignmentRepository beaconAssignmentRepository;

    @Inject
    StoreProductSource storeProductSource;

    private final StoreReadinessEvaluator evaluator = new StoreReadinessEvaluator();

    /** radius null: the default radius of the store's coverage profile. */
    public ReadinessReport evaluate(UUID storeId, Double requestedRadius) {
        adminAccessService.requireStoreAccess(storeId);
        StoreEntity store = storeRepository.findByIdOptional(storeId)
                .orElseThrow(() -> new NotFoundException("Filiale nicht gefunden."));
        String profile = CoverageRule.forProfile(store.readinessProfile) == null
                ? CoverageRule.PROFILE_MARKET : store.readinessProfile;
        double radius = requestedRadius != null ? requestedRadius : CoverageRule.forProfile(profile).radiusMeters();
        List<AssignedBeacon> assigned = beaconAssignmentRepository.listActiveByStoreId(storeId).stream()
                .map(this::toAssignedBeacon)
                .toList();

        // The active version is read directly: getCurrentLayout would substitute the default layout.
        LayoutVersionEntity active = layoutVersionRepository.findActiveByStoreId(storeId).orElse(null);
        if (active == null) {
            return evaluator.evaluate(new ReadinessInput(
                    storeId, null, null, null, List.of(), false, assigned, radius, profile));
        }

        ProductPage page = loadProducts(store);
        return evaluator.evaluate(new ReadinessInput(
                storeId,
                active.id,
                active.versionNo,
                active.layoutJson,
                page.products(),
                page.truncated(),
                assigned,
                radius,
                profile));
    }

    private ProductPage loadProducts(StoreEntity store) {
        try {
            return storeProductSource.loadStoreProducts(store.id, store.storeCode);
        } catch (IOException exception) {
            LOG.warn("Store product lookup for readiness failed", exception);
            throw new WebApplicationException(
                    "Produktkatalog ist nicht erreichbar.",
                    Response.Status.SERVICE_UNAVAILABLE
            );
        }
    }

    private AssignedBeacon toAssignedBeacon(BeaconAssignmentEntity assignment) {
        return new AssignedBeacon(
                assignment.beacon.id,
                assignment.beacon.beaconCode,
                assignment.beacon.identityKey,
                assignment.beacon.uuid,
                assignment.beacon.major,
                assignment.beacon.minor);
    }
}
