package at.htl.admin.service;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import jakarta.inject.Inject;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Bulkhead check with the real interceptors. The timeout is well above the 1 s stub delay, so every admitted call
 * keeps its permit until the stub has answered. The stub's in-flight count can then never exceed the bulkhead limit.
 */
@QuarkusTest
@TestProfile(OpenAiRankingBulkheadTest.SlowStubProfile.class)
class OpenAiRankingBulkheadTest {

    static final int STUB_PORT = 18762;
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
    void twentyConcurrentCallsNeverExceedFourAtTheStubAndNeverThrow() throws Exception {
        stub.respond(200, "{\"output\":[]}");
        stub.delay(1000);
        int callers = 20;
        ExecutorService executor = Executors.newFixedThreadPool(callers);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Optional<String>>> futures = new ArrayList<>();
        try {
            for (int i = 0; i < callers; i++) {
                futures.add(executor.submit(() -> {
                    start.await();
                    return client.post("test-key", "{}");
                }));
            }
            start.countDown();

            for (Future<Optional<String>> future : futures) {
                Optional<String> result = future.get(30, TimeUnit.SECONDS);
                assertNotNull(result, "every call must return an Optional");
            }
        } finally {
            executor.shutdownNow();
        }

        assertTrue(stub.maxInFlight() <= 4,
                "stub saw " + stub.maxInFlight() + " concurrent requests, limit is 4");
        assertTrue(stub.requestCount() <= callers, "more requests than callers");
    }

    public static class SlowStubProfile implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of(
                    "openai.base-url", "http://127.0.0.1:" + STUB_PORT,
                    "openai.upsell.timeout-ms", "3000"
            );
        }
    }
}
