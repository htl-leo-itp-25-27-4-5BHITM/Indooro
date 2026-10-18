package at.htl.config;

import java.time.Duration;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.LongSupplier;

/**
 * In-Memory-Token-Bucket pro Regel und Client. Die Zeit wird injiziert, damit Tests ohne Warten laufen.
 * Der Speicher ist begrenzt: vollständig aufgefüllte (inaktive) Buckets werden zuerst entfernt,
 * danach der am längsten nicht genutzte Schlüssel.
 */
public final class RateLimiter {

    public record Policy(String name, int maxRequests, Duration window) {

        public Policy {
            if (name == null || name.isBlank()) {
                throw new IllegalArgumentException("Rate-Limit-Name fehlt.");
            }
            if (maxRequests < 1) {
                throw new IllegalArgumentException("maxRequests muss mindestens 1 sein.");
            }
            if (window == null || window.isZero() || window.isNegative()) {
                throw new IllegalArgumentException("window muss positiv sein.");
            }
        }
    }

    public record Decision(boolean allowed, long retryAfterSeconds) {
    }

    private static final class Bucket {
        private final Policy policy;
        private double tokens;
        private long lastMillis;

        private Bucket(Policy policy, long nowMillis) {
            this.policy = policy;
            this.tokens = policy.maxRequests();
            this.lastMillis = nowMillis;
        }

        private double refill(long nowMillis) {
            double perMilli = (double) policy.maxRequests() / policy.window().toMillis();
            return Math.min(policy.maxRequests(), tokens + (nowMillis - lastMillis) * perMilli);
        }
    }

    private final int maxKeys;
    private final LongSupplier clockMillis;
    private final LinkedHashMap<String, Bucket> buckets = new LinkedHashMap<>(16, 0.75f, true);

    public RateLimiter(int maxKeys, LongSupplier clockMillis) {
        if (maxKeys < 1) {
            throw new IllegalArgumentException("maxKeys muss mindestens 1 sein.");
        }
        this.maxKeys = maxKeys;
        this.clockMillis = clockMillis;
    }

    public synchronized Decision tryAcquire(Policy policy, String clientKey) {
        long now = clockMillis.getAsLong();
        String key = policy.name() + "|" + clientKey;
        Bucket bucket = buckets.get(key);
        if (bucket == null) {
            evictIfFull(now);
            bucket = new Bucket(policy, now);
            buckets.put(key, bucket);
        }

        bucket.tokens = bucket.refill(now);
        bucket.lastMillis = now;
        if (bucket.tokens >= 1.0) {
            bucket.tokens -= 1.0;
            return new Decision(true, 0);
        }

        double perMilli = (double) policy.maxRequests() / policy.window().toMillis();
        long waitMillis = (long) Math.ceil((1.0 - bucket.tokens) / perMilli);
        return new Decision(false, Math.max(1, (waitMillis + 999) / 1000));
    }

    /** Anzahl aktuell gespeicherter Schlüssel (für Tests und Diagnose). */
    public synchronized int trackedKeys() {
        return buckets.size();
    }

    private void evictIfFull(long now) {
        if (buckets.size() < maxKeys) {
            return;
        }
        Iterator<Map.Entry<String, Bucket>> iterator = buckets.entrySet().iterator();
        while (iterator.hasNext() && buckets.size() >= maxKeys) {
            Bucket candidate = iterator.next().getValue();
            if (candidate.refill(now) >= candidate.policy.maxRequests()) {
                iterator.remove();
            }
        }
        if (buckets.size() >= maxKeys) {
            buckets.remove(buckets.keySet().iterator().next());
        }
    }
}
