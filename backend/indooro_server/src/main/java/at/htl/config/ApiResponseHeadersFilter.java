package at.htl.config;

import io.quarkus.vertx.http.runtime.filters.Filters;
import io.smallrye.config.ConfigMapping;
import io.vertx.core.http.HttpMethod;
import io.vertx.ext.web.RoutingContext;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Map;

@ApplicationScoped
public class ApiResponseHeadersFilter {

    private static final DateTimeFormatter HTTP_DATE =
            DateTimeFormatter.ofPattern("EEE, dd MMM uuuu HH:mm:ss 'GMT'", Locale.US);

    @ConfigMapping(prefix = "indooro.api.deprecation")
    public interface DeprecationConfig {
        LocalDate since();
        LocalDate sunset();
        Map<String, String> successors();
    }

    private final DeprecationConfig config;
    private final String deprecation;
    private final String sunset;

    public ApiResponseHeadersFilter(DeprecationConfig config) {
        this.config = config;
        if (config.sunset().isBefore(config.since().plusMonths(6))) {
            throw new IllegalArgumentException("API sunset must be at least six months after deprecation");
        }
        deprecation = "@" + config.since().atStartOfDay().toEpochSecond(ZoneOffset.UTC);
        sunset = HTTP_DATE.format(config.sunset().atStartOfDay());
    }

    void register(@Observes Filters filters) {
        // Set the headers before HTTP authentication and REST matching can terminate the request.
        filters.register(this::addHeaders, 3000);
    }

    private void addHeaders(RoutingContext context) {
        String path = context.normalizedPath();
        if (path.equals("/api") || path.startsWith("/api/")) {
            context.response().putHeader("Indooro-Api-Version", "1");
            if (context.request().method().equals(HttpMethod.POST)) {
                String canonicalPath = ApiVersionFilter.canonicalPath(path);
                if (canonicalPath.endsWith("/")) {
                    canonicalPath = canonicalPath.substring(0, canonicalPath.length() - 1);
                }
                String successor = config.successors().get(canonicalPath);
                if (successor != null) {
                    context.response().putHeader("Deprecation", deprecation)
                            .putHeader("Sunset", sunset)
                            .putHeader("Link", "<" + successor + ">; rel=\"successor-version\"");
                }
            }
        }
        context.next();
    }
}
