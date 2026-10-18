package at.htl.config;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.health.HealthCheck;
import org.eclipse.microprofile.health.HealthCheckResponse;
import org.eclipse.microprofile.health.Readiness;

/** Readiness (/q/health/ready): UP once the OpenSearch indices are prepared by {@link OpenSearchStartup}. */
@Readiness
@ApplicationScoped
public class OpenSearchReadinessCheck implements HealthCheck {

    static final String NAME = "opensearch-indices";

    @Inject
    OpenSearchStartup startup;

    @Override
    public HealthCheckResponse call() {
        return startup.isReady()
                ? HealthCheckResponse.up(NAME)
                : HealthCheckResponse.down(NAME);
    }
}
