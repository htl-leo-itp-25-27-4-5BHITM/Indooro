package at.htl.admin.service;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Plain JUnit test against a local stub on a free port; never contacts api.openai.com. */
class OpenAiRankingClientTest {

    private OpenAiStubServer stub;
    private OpenAiRankingClient client;

    @BeforeEach
    void setUp() throws IOException {
        stub = OpenAiStubServer.start(0);
        client = new OpenAiRankingClient();
        client.baseUrl = stub.baseUrl();
        client.timeoutMs = 2000;
        client.init();
    }

    @AfterEach
    void tearDown() {
        stub.close();
    }

    @Test
    void returnsBodyForSuccessfulResponseWithAuthorizationAndPath() {
        stub.respond(200, "{\"output\":[{\"type\":\"message\"}]}");

        Optional<String> result = client.post("test-key", "{\"model\":\"m\"}");

        assertEquals(Optional.of("{\"output\":[{\"type\":\"message\"}]}"), result);
        assertEquals("/v1/responses", stub.lastPath());
        assertEquals("Bearer test-key", stub.lastAuthorization());
        assertEquals(1, stub.requestCount());
    }

    @Test
    void returnsEmptyForServerError() {
        stub.respond(500, "{\"error\":\"internal\"}");

        Optional<String> result = client.post("test-key", "{}");

        assertTrue(result.isEmpty());
        assertEquals(1, stub.requestCount());
    }
}
