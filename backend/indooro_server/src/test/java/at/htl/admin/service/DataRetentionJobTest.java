package at.htl.admin.service;

import at.htl.service.LayoutService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DataRetentionJobTest {

    private DataRetentionService retention;
    private LayoutService layoutService;
    private DataRetentionJob job;

    @BeforeEach
    void setUp() {
        retention = mock(DataRetentionService.class);
        layoutService = mock(LayoutService.class);
        job = new DataRetentionJob();
        job.dataRetentionService = retention;
        job.layoutService = layoutService;
        job.upsellCacheDays = 1;
        job.upsellEventsDays = 180;
        job.upsellDismissalsDays = 30;
        job.legacyLayoutVersions = 50;
    }

    @Test
    void runsAllFourPurgesWithConfiguredThresholds() {
        job.purge();

        verify(retention).purgeUpsellCache(any(Instant.class), eq(1));
        verify(retention).purgeUpsellEvents(any(Instant.class), eq(180));
        verify(retention).purgeUpsellDismissals(any(Instant.class), eq(30));
        verify(layoutService).pruneLegacyVersions(50);
    }

    @Test
    void failingUpsellCachePurgeDoesNotStopTheOthers() {
        when(retention.purgeUpsellCache(any(Instant.class), anyInt())).thenThrow(new IllegalStateException("db down"));

        job.purge();

        verify(retention).purgeUpsellEvents(any(Instant.class), eq(180));
        verify(retention).purgeUpsellDismissals(any(Instant.class), eq(30));
        verify(layoutService).pruneLegacyVersions(50);
    }

    @Test
    void failingLegacyPruneDoesNotThrow() {
        when(layoutService.pruneLegacyVersions(anyInt())).thenThrow(new IllegalStateException("opensearch down"));

        job.purge();

        verify(retention).purgeUpsellCache(any(Instant.class), eq(1));
        verify(retention).purgeUpsellEvents(any(Instant.class), eq(180));
        verify(retention).purgeUpsellDismissals(any(Instant.class), eq(30));
    }
}
