package at.htl.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class MobileRateLimitFilterTest {

    @Test
    void mapsLimitedRoutesToRuleGroups() {
        assertEquals("upsell", MobileRateLimitFilter.routeGroup("/api/mobile/upsell/plan"));
        assertEquals("upsell", MobileRateLimitFilter.routeGroup("/api/mobile/upsell/suggestions"));
        assertEquals("upsell-event", MobileRateLimitFilter.routeGroup("/api/mobile/upsell/events"));
        assertEquals("upsell-event", MobileRateLimitFilter.routeGroup("/api/mobile/upsell/dismiss"));
        assertEquals("heavy", MobileRateLimitFilter.routeGroup("/api/export/pdf"));
        assertEquals("heavy", MobileRateLimitFilter.routeGroup("/api/convert/pdf-to-json"));
    }

    @Test
    void leavesOtherRoutesUnlimited() {
        assertNull(MobileRateLimitFilter.routeGroup("/api/mobile/recipes"));
        assertNull(MobileRateLimitFilter.routeGroup("/api/mobile/upsell/unknown"));
        assertNull(MobileRateLimitFilter.routeGroup("/api/products"));
        assertNull(MobileRateLimitFilter.routeGroup(null));
    }

    @Test
    void clientKeyUsesFirstForwardedForHop() {
        assertEquals("203.0.113.7", MobileRateLimitFilter.clientKey("203.0.113.7, 10.0.0.1", "10.0.0.9"));
        assertEquals("203.0.113.7", MobileRateLimitFilter.clientKey(" 203.0.113.7 ", "10.0.0.9"));
    }

    @Test
    void clientKeyFallsBackToRemoteAddress() {
        assertEquals("10.0.0.9", MobileRateLimitFilter.clientKey(null, "10.0.0.9"));
        assertEquals("10.0.0.9", MobileRateLimitFilter.clientKey("  ", "10.0.0.9"));
        assertEquals("unknown", MobileRateLimitFilter.clientKey(null, null));
    }
}
