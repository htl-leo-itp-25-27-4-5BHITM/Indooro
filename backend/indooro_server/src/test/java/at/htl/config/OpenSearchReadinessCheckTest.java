package at.htl.config;

import org.eclipse.microprofile.health.HealthCheckResponse;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OpenSearchReadinessCheckTest {

    @Test
    void reportsUpOnceIndicesArePrepared() {
        HealthCheckResponse response = check(true).call();

        assertEquals("opensearch-indices", response.getName());
        assertEquals(HealthCheckResponse.Status.UP, response.getStatus());
    }

    @Test
    void reportsDownWhileIndicesAreNotPrepared() {
        HealthCheckResponse response = check(false).call();

        assertEquals("opensearch-indices", response.getName());
        assertEquals(HealthCheckResponse.Status.DOWN, response.getStatus());
    }

    private static OpenSearchReadinessCheck check(boolean ready) {
        OpenSearchStartup startup = mock(OpenSearchStartup.class);
        when(startup.isReady()).thenReturn(ready);
        OpenSearchReadinessCheck check = new OpenSearchReadinessCheck();
        check.startup = startup;
        return check;
    }
}
