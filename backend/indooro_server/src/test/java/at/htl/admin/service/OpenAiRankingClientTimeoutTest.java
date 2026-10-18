package at.htl.admin.service;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.ConfigProvider;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Runs with the real CDI interceptors. The profile sets the HttpRequest timeout (openai.upsell.timeout-ms) to 5000 ms
 * and the @Timeout override to 300 ms. A slow stub therefore only returns empty within about 300 ms if the override
 * is really applied; otherwise the 2000 ms stub answer would arrive and the test fails.
 */
@QuarkusTest
@TestProfile(OpenAiRankingClientTimeoutTest.ShortTimeoutProfile.class)
class OpenAiRankingClientTimeoutTest {

    static final int STUB_PORT = 18761;
    private static OpenAiStubServer stub;

    @Inject
    OpenAiRankingClient client;

    @BeforeAll
    static void startStub() throws IOException {
        stub = OpenAiStubServer.start(STUB_PORT);
    }

    @AfterAll
    static void stopStub() {
        if (stub != null) {
            stub.close();
        }
    }

    @Test
    void slowStubYieldsEmptyWithinTimeoutOverride() {
        stub.respond(200, "{\"output\":[]}");
        stub.delay(2000);

        long startedNanos = System.nanoTime();
        Optional<String> result = client.post("test-key", "{}");
        long elapsedMs = (System.nanoTime() - startedNanos) / 1_000_000L;

        assertTrue(result.isEmpty(), "slow stub must fall back to empty");
        assertTrue(elapsedMs < 1500, "call must return near the 300 ms override, took " + elapsedMs + " ms");
    }

    @Test
    void fastStubStillReturnsBody() {
        stub.respond(200, "{\"output\":[{\"type\":\"message\"}]}");
        stub.delay(0);

        Optional<String> result = client.post("test-key", "{}");

        assertEquals(Optional.of("{\"output\":[{\"type\":\"message\"}]}"), result);
    }

    @Test
    void timeoutOverrideKeyResolvesFromApplicationProperties() {
        Long override = ConfigProvider.getConfig()
                .getValue("at.htl.admin.service.OpenAiRankingClient/post/Timeout/value", Long.class);

        assertEquals(300L, override);
    }

    public static class ShortTimeoutProfile implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of(
                    "openai.base-url", "http://127.0.0.1:" + STUB_PORT,
                    "openai.upsell.timeout-ms", "5000",
                    "at.htl.admin.service.OpenAiRankingClient/post/Timeout/value", "300"
            );
        }
    }
}
