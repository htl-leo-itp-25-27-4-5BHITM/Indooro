package at.htl.config;

import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RateLimiterTest {

    private static final RateLimiter.Policy TWO_PER_TEN_SECONDS =
            new RateLimiter.Policy("test", 2, Duration.ofSeconds(10));

    private long nowMillis = 1_000_000L;

    private RateLimiter limiter(int maxKeys) {
        return new RateLimiter(maxKeys, () -> nowMillis);
    }

    @Test
    void allowsUpToMaxRequestsThenDeniesWithRetryAfter() {
        RateLimiter limiter = limiter(10);

        assertTrue(limiter.tryAcquire(TWO_PER_TEN_SECONDS, "client-a").allowed());
        assertTrue(limiter.tryAcquire(TWO_PER_TEN_SECONDS, "client-a").allowed());

        RateLimiter.Decision denied = limiter.tryAcquire(TWO_PER_TEN_SECONDS, "client-a");
        assertFalse(denied.allowed());
        // Ein Token kommt nach window/max = 5 Sekunden zurück.
        assertEquals(5, denied.retryAfterSeconds());
    }

    @Test
    void retryAfterRoundsUpToWholeSeconds() {
        RateLimiter limiter = limiter(10);
        RateLimiter.Policy policy = new RateLimiter.Policy("odd", 1, Duration.ofMillis(2500));

        assertTrue(limiter.tryAcquire(policy, "client-a").allowed());
        nowMillis += 1_000;

        RateLimiter.Decision denied = limiter.tryAcquire(policy, "client-a");
        assertFalse(denied.allowed());
        assertEquals(2, denied.retryAfterSeconds());
    }

    @Test
    void clientsAreIsolatedFromEachOther() {
        RateLimiter limiter = limiter(10);

        limiter.tryAcquire(TWO_PER_TEN_SECONDS, "client-a");
        limiter.tryAcquire(TWO_PER_TEN_SECONDS, "client-a");
        assertFalse(limiter.tryAcquire(TWO_PER_TEN_SECONDS, "client-a").allowed());

        assertTrue(limiter.tryAcquire(TWO_PER_TEN_SECONDS, "client-b").allowed());
        assertTrue(limiter.tryAcquire(TWO_PER_TEN_SECONDS, "client-b").allowed());
    }

    @Test
    void rulesAreIsolatedFromEachOther() {
        RateLimiter limiter = limiter(10);
        RateLimiter.Policy other = new RateLimiter.Policy("other", 2, Duration.ofSeconds(10));

        limiter.tryAcquire(TWO_PER_TEN_SECONDS, "client-a");
        limiter.tryAcquire(TWO_PER_TEN_SECONDS, "client-a");

        assertTrue(limiter.tryAcquire(other, "client-a").allowed());
    }

    @Test
    void windowResetRestoresFullCapacity() {
        RateLimiter limiter = limiter(10);

        limiter.tryAcquire(TWO_PER_TEN_SECONDS, "client-a");
        limiter.tryAcquire(TWO_PER_TEN_SECONDS, "client-a");
        assertFalse(limiter.tryAcquire(TWO_PER_TEN_SECONDS, "client-a").allowed());

        nowMillis += Duration.ofSeconds(10).toMillis();

        assertTrue(limiter.tryAcquire(TWO_PER_TEN_SECONDS, "client-a").allowed());
        assertTrue(limiter.tryAcquire(TWO_PER_TEN_SECONDS, "client-a").allowed());
        assertFalse(limiter.tryAcquire(TWO_PER_TEN_SECONDS, "client-a").allowed());
    }

    @Test
    void partialRefillAllowsOneRequestAfterOneTokenPeriod() {
        RateLimiter limiter = limiter(10);

        limiter.tryAcquire(TWO_PER_TEN_SECONDS, "client-a");
        limiter.tryAcquire(TWO_PER_TEN_SECONDS, "client-a");
        nowMillis += 5_000;

        assertTrue(limiter.tryAcquire(TWO_PER_TEN_SECONDS, "client-a").allowed());
        assertFalse(limiter.tryAcquire(TWO_PER_TEN_SECONDS, "client-a").allowed());
    }

    @Test
    void memoryIsBoundedByMaxKeys() {
        RateLimiter limiter = limiter(3);

        for (int i = 0; i < 50; i++) {
            limiter.tryAcquire(TWO_PER_TEN_SECONDS, "client-" + i);
        }

        assertEquals(3, limiter.trackedKeys());
    }

    @Test
    void fullyRefilledIdleKeysAreEvictedBeforeKeysThatStillHoldState() {
        RateLimiter limiter = limiter(2);

        limiter.tryAcquire(TWO_PER_TEN_SECONDS, "busy");
        limiter.tryAcquire(TWO_PER_TEN_SECONDS, "busy");
        nowMillis += 1_000;
        limiter.tryAcquire(TWO_PER_TEN_SECONDS, "idle");
        nowMillis += 5_000;

        // "idle" ist wieder voll (inaktiv), "busy" noch nicht: nur "idle" darf verdrängt werden.
        limiter.tryAcquire(TWO_PER_TEN_SECONDS, "newcomer");

        assertEquals(2, limiter.trackedKeys());
        assertTrue(limiter.tryAcquire(TWO_PER_TEN_SECONDS, "busy").allowed());
        assertFalse(limiter.tryAcquire(TWO_PER_TEN_SECONDS, "busy").allowed());
    }

    @Test
    void evictionNeverExceedsCapEvenWithoutIdleKeys() {
        RateLimiter limiter = limiter(2);

        limiter.tryAcquire(TWO_PER_TEN_SECONDS, "a");
        limiter.tryAcquire(TWO_PER_TEN_SECONDS, "a");
        limiter.tryAcquire(TWO_PER_TEN_SECONDS, "b");
        limiter.tryAcquire(TWO_PER_TEN_SECONDS, "b");
        limiter.tryAcquire(TWO_PER_TEN_SECONDS, "c");

        assertEquals(2, limiter.trackedKeys());
    }

    @Test
    void invalidPolicyIsRejected() {
        assertThrows(IllegalArgumentException.class, () -> new RateLimiter.Policy("x", 0, Duration.ofSeconds(1)));
        assertThrows(IllegalArgumentException.class, () -> new RateLimiter.Policy("x", 1, Duration.ZERO));
        assertThrows(IllegalArgumentException.class, () -> new RateLimiter(0, () -> 0L));
    }
}
