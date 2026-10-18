package at.htl.config;

import at.htl.admin.dto.ErrorLogDtos;
import io.quarkus.vertx.http.runtime.CurrentVertxRequest;
import io.vertx.ext.web.RoutingContext;
import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.resteasy.reactive.server.ServerRequestFilter;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;

/**
 * Begrenzt POST-Anfragen pro Client (erster X-Forwarded-For-Hop, sonst Remote-Adresse):
 * Upsell plan/suggestions, Upsell events/dismiss sowie Export und Konvertierung.
 */
@ApplicationScoped
public class MobileRateLimitFilter {

    static final String UPSELL = "upsell";
    static final String UPSELL_EVENT = "upsell-event";
    static final String HEAVY = "heavy";
    static final String TOO_MANY_REQUESTS_MESSAGE = "Zu viele Anfragen. Bitte später erneut versuchen.";

    @ConfigProperty(name = "indooro.ratelimit.upsell.max-requests", defaultValue = "20")
    int upsellMaxRequests;

    @ConfigProperty(name = "indooro.ratelimit.upsell.window-seconds", defaultValue = "600")
    int upsellWindowSeconds;

    @ConfigProperty(name = "indooro.ratelimit.upsell-event.max-requests", defaultValue = "120")
    int upsellEventMaxRequests;

    @ConfigProperty(name = "indooro.ratelimit.upsell-event.window-seconds", defaultValue = "600")
    int upsellEventWindowSeconds;

    @ConfigProperty(name = "indooro.ratelimit.heavy.max-requests", defaultValue = "10")
    int heavyMaxRequests;

    @ConfigProperty(name = "indooro.ratelimit.heavy.window-seconds", defaultValue = "60")
    int heavyWindowSeconds;

    @ConfigProperty(name = "indooro.ratelimit.max-keys", defaultValue = "10000")
    int maxKeys;

    @Inject
    CurrentVertxRequest currentVertxRequest;

    private RateLimiter limiter;
    private Map<String, RateLimiter.Policy> policies;

    @PostConstruct
    void init() {
        limiter = new RateLimiter(maxKeys, System::currentTimeMillis);
        policies = Map.of(
                UPSELL, new RateLimiter.Policy(UPSELL, upsellMaxRequests, Duration.ofSeconds(upsellWindowSeconds)),
                UPSELL_EVENT, new RateLimiter.Policy(UPSELL_EVENT, upsellEventMaxRequests,
                        Duration.ofSeconds(upsellEventWindowSeconds)),
                HEAVY, new RateLimiter.Policy(HEAVY, heavyMaxRequests, Duration.ofSeconds(heavyWindowSeconds))
        );
    }

    @ServerRequestFilter
    public Response filter(ContainerRequestContext requestContext) {
        if (!"POST".equalsIgnoreCase(requestContext.getMethod())) {
            return null;
        }
        URI requestUri = requestContext.getUriInfo().getRequestUri();
        String path = normalizePath(requestUri.getPath());
        String group = routeGroup(path);
        if (group == null) {
            return null;
        }

        String clientKey = clientKey(requestContext.getHeaderString("X-Forwarded-For"), remoteAddress());
        RateLimiter.Decision decision = limiter.tryAcquire(policies.get(group), clientKey);
        if (decision.allowed()) {
            return null;
        }

        return Response.status(Response.Status.TOO_MANY_REQUESTS)
                .type(MediaType.APPLICATION_JSON)
                .header(HttpHeaders.RETRY_AFTER, decision.retryAfterSeconds())
                .entity(new ErrorLogDtos.ApiErrorResponse(
                        Response.Status.TOO_MANY_REQUESTS.getStatusCode(),
                        TOO_MANY_REQUESTS_MESSAGE,
                        requestContext.getMethod(),
                        path,
                        Instant.now()))
                .build();
    }

    /** Ordnet einen POST-Pfad einer Regelgruppe zu, sonst null. */
    static String routeGroup(String path) {
        if (path == null) {
            return null;
        }
        if (path.equals("/api/mobile/upsell/plan") || path.equals("/api/mobile/upsell/suggestions")) {
            return UPSELL;
        }
        if (path.equals("/api/mobile/upsell/events") || path.equals("/api/mobile/upsell/dismiss")) {
            return UPSELL_EVENT;
        }
        if (path.startsWith("/api/export/") || path.startsWith("/api/convert/")) {
            return HEAVY;
        }
        return null;
    }

    /** Erster Hop aus X-Forwarded-For; ohne Header die Remote-Adresse. */
    static String clientKey(String forwardedFor, String remoteAddress) {
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            String firstHop = forwardedFor.split(",", 2)[0].trim();
            if (!firstHop.isEmpty()) {
                return firstHop;
            }
        }
        return remoteAddress == null || remoteAddress.isBlank() ? "unknown" : remoteAddress;
    }

    private String remoteAddress() {
        RoutingContext context = currentVertxRequest == null ? null : currentVertxRequest.getCurrent();
        if (context == null || context.request() == null || context.request().remoteAddress() == null) {
            return null;
        }
        return context.request().remoteAddress().host();
    }

    private static String normalizePath(String path) {
        if (path == null || path.length() <= 1 || !path.endsWith("/")) {
            return path;
        }
        return path.substring(0, path.length() - 1);
    }
}
