package at.htl.admin.service;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Local stand-in for api.openai.com on 127.0.0.1. Records the requests it sees and how many were in flight at once.
 * The in-flight count drops before the response is written, so a client that gets a response has already released
 * its slot in the stub's count.
 */
final class OpenAiStubServer implements AutoCloseable {

    private final HttpServer server;
    private final AtomicInteger inFlight = new AtomicInteger();
    private final AtomicInteger maxInFlight = new AtomicInteger();
    private final AtomicInteger requestCount = new AtomicInteger();
    private final AtomicReference<String> lastPath = new AtomicReference<>();
    private final AtomicReference<String> lastAuthorization = new AtomicReference<>();
    private volatile int status = 200;
    private volatile String responseBody = "{\"output\":[]}";
    private volatile long delayMs = 0;

    private OpenAiStubServer(HttpServer server) {
        this.server = server;
    }

    /** Starts the stub on the given port; port 0 picks a free one. */
    static OpenAiStubServer start(int port) throws IOException {
        HttpServer httpServer = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), port), 0);
        OpenAiStubServer stub = new OpenAiStubServer(httpServer);
        httpServer.createContext("/", stub::handle);
        httpServer.setExecutor(Executors.newCachedThreadPool());
        httpServer.start();
        return stub;
    }

    int port() {
        return server.getAddress().getPort();
    }

    String baseUrl() {
        return "http://127.0.0.1:" + port();
    }

    void respond(int status, String body) {
        this.status = status;
        this.responseBody = body;
    }

    void delay(long delayMs) {
        this.delayMs = delayMs;
    }

    int requestCount() {
        return requestCount.get();
    }

    int maxInFlight() {
        return maxInFlight.get();
    }

    String lastPath() {
        return lastPath.get();
    }

    String lastAuthorization() {
        return lastAuthorization.get();
    }

    private void handle(HttpExchange exchange) throws IOException {
        int current = inFlight.incrementAndGet();
        maxInFlight.accumulateAndGet(current, Math::max);
        requestCount.incrementAndGet();
        lastPath.set(exchange.getRequestURI().getPath());
        lastAuthorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
        byte[] responseBytes;
        int responseStatus;
        try {
            exchange.getRequestBody().readAllBytes();
            if (delayMs > 0) {
                Thread.sleep(delayMs);
            }
            responseStatus = status;
            responseBytes = responseBody.getBytes(StandardCharsets.UTF_8);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            responseStatus = 503;
            responseBytes = new byte[0];
        } finally {
            inFlight.decrementAndGet();
        }
        try {
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(responseStatus, responseBytes.length == 0 ? -1 : responseBytes.length);
            if (responseBytes.length > 0) {
                exchange.getResponseBody().write(responseBytes);
            }
        } catch (IOException ignored) {
            // The client gave up (timeout); nothing to answer.
        } finally {
            exchange.close();
        }
    }

    @Override
    public void close() {
        server.stop(0);
    }
}
