package at.htl.admin.service;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.eclipse.microprofile.faulttolerance.Bulkhead;
import org.eclipse.microprofile.faulttolerance.Fallback;
import org.eclipse.microprofile.faulttolerance.Timeout;
import org.jboss.logging.Logger;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Optional;

/**
 * HTTP access to the OpenAI Responses API for the upsell ranking. At most four requests run concurrently and at most
 * sixteen wait; a request that is rejected, times out or fails yields Optional.empty() so the deterministic
 * fallback takes over without blocking the request thread.
 */
@ApplicationScoped
public class OpenAiRankingClient {

    private static final Logger LOG = Logger.getLogger(OpenAiRankingClient.class);
    private static final String RESPONSES_PATH = "/v1/responses";
    private static final int MAX_LOGGED_BODY_LENGTH = 500;

    @ConfigProperty(name = "openai.base-url", defaultValue = "https://api.openai.com")
    String baseUrl;

    @ConfigProperty(name = "openai.upsell.timeout-ms", defaultValue = "4500")
    long timeoutMs;

    private HttpClient httpClient;

    @PostConstruct
    void init() {
        httpClient = HttpClient.newBuilder()
                .connectTimeout(requestTimeout())
                .build();
    }

    /**
     * Posts the JSON body to the Responses API. Returns the response body only for 2xx responses. The @Timeout value
     * is overridden from openai.upsell.timeout-ms in application.properties.
     */
    @Bulkhead(value = 4, waitingTaskQueue = 16)
    @Timeout(4500)
    @Fallback(fallbackMethod = "postFallback")
    public Optional<String> post(String apiKey, String jsonBody) {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + RESPONSES_PATH))
                .timeout(requestTimeout())
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                .build();
        try {
            HttpResponse<String> response = httpClient.send(
                    request,
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
            );
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                LOG.warnf(
                        "OpenAI upsell request failed status=%d response=%s",
                        response.statusCode(),
                        truncate(response.body())
                );
                return Optional.empty();
            }
            return Optional.ofNullable(response.body());
        } catch (IOException exception) {
            LOG.warnf("OpenAI upsell request failed: %s", exception.getClass().getSimpleName());
            return Optional.empty();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return Optional.empty();
        }
    }

    /** Bulkhead rejection, timeout or unexpected failure of {@link #post}. */
    Optional<String> postFallback(String apiKey, String jsonBody) {
        LOG.warn("OpenAI upsell request rejected, timed out or failed; falling back");
        return Optional.empty();
    }

    private Duration requestTimeout() {
        return Duration.ofMillis(Math.max(1, timeoutMs));
    }

    private String truncate(String value) {
        if (value == null) {
            return "";
        }
        return value.length() <= MAX_LOGGED_BODY_LENGTH ? value : value.substring(0, MAX_LOGGED_BODY_LENGTH) + "...";
    }
}
