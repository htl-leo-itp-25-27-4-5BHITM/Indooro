import assert from "node:assert/strict";
import test from "node:test";
import { ApiClientError, createApiClient } from "./client";

const origin = "https://indooro.example";

function jsonResponse(status: number, value: unknown, onRead?: () => void): Response {
  const response = new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" }
  });
  const read = response.text.bind(response);
  response.text = () => {
    onRead?.();
    return read();
  };
  return response;
}

test("sends same-origin cookies and parses a response with one body read", async () => {
  let reads = 0;
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;
  const client = createApiClient({
    origin,
    fetcher: async (url, init) => {
      requestedUrl = String(url);
      requestedInit = init;
      return jsonResponse(200, { id: "store-1" }, () => reads++);
    }
  });

  const result = await client.get<{ id: string }>("/api/stores/store-1");
  assert.deepEqual(result, { id: "store-1" });
  assert.equal(requestedUrl, `${origin}/api/stores/store-1`);
  assert.equal(requestedInit?.credentials, "same-origin");
  assert.equal((requestedInit?.headers as Headers).get("Accept"), "application/json");
  assert.equal(reads, 1);
});

test("serializes JSON writes without reading the error body twice", async () => {
  let reads = 0;
  let sent: RequestInit | undefined;
  const client = createApiClient({
    origin,
    fetcher: async (_url, init) => {
      sent = init;
      return jsonResponse(409, { error: "Version wurde geändert" }, () => reads++);
    }
  });

  await assert.rejects(client.put("/api/stores/store-1", { name: "Test" }), (error: unknown) => {
    assert.ok(error instanceof ApiClientError);
    assert.equal(error.kind, "conflict");
    assert.equal(error.status, 409);
    assert.equal(error.message, "Version wurde geändert");
    return true;
  });
  assert.equal(sent?.method, "PUT");
  assert.equal(sent?.body, '{"name":"Test"}');
  assert.equal((sent?.headers as Headers).get("Content-Type"), "application/json");
  assert.equal(reads, 1);
});

test("normalizes unauthorized and forbidden responses and notifies the caller", async () => {
  const notified: string[] = [];
  const client = createApiClient({
    origin,
    fetcher: async (url) => jsonResponse(String(url).includes("denied") ? 403 : 401, { error: "raw backend text" }),
    onUnauthorized: () => notified.push("401"),
    onForbidden: () => notified.push("403")
  });

  await assert.rejects(client.get("/api/session"), (error: unknown) => {
    assert.ok(error instanceof ApiClientError);
    assert.equal(error.kind, "unauthorized");
    assert.equal(error.status, 401);
    assert.notEqual(error.message, "raw backend text");
    return true;
  });
  await assert.rejects(client.get("/api/denied"), (error: unknown) => {
    assert.ok(error instanceof ApiClientError);
    assert.equal(error.kind, "forbidden");
    assert.equal(error.status, 403);
    return true;
  });
  assert.deepEqual(notified, ["401", "403"]);
});

test("normalizes backend validation messages and field errors", async () => {
  const client = createApiClient({
    origin,
    fetcher: async () => jsonResponse(400, {
      error: "Eingaben ungültig",
      errors: { name: ["Pflichtfeld"] },
      violations: [{ field: "price", message: "Muss positiv sein" }]
    })
  });

  await assert.rejects(client.post("/api/admin/products", {}), (error: unknown) => {
    assert.ok(error instanceof ApiClientError);
    assert.equal(error.kind, "validation");
    assert.equal(error.message, "Eingaben ungültig");
    assert.deepEqual(error.fieldErrors, { name: ["Pflichtfeld"], price: ["Muss positiv sein"] });
    return true;
  });
});

test("rejects non-API and cross-origin requests before fetch", async () => {
  let calls = 0;
  const client = createApiClient({
    origin,
    fetcher: async () => {
      calls++;
      return jsonResponse(200, {});
    }
  });
  await assert.rejects(client.get("https://another.example/api/stores"), TypeError);
  await assert.rejects(client.get("/admin/"), TypeError);
  assert.equal(calls, 0);
});

test("passes cancellation through without turning it into an API failure", async () => {
  const controller = new AbortController();
  const client = createApiClient({
    origin,
    fetcher: async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })
  });
  const pending = client.get("/api/stores", { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
});

test("reports malformed successful JSON and network failures distinctly", async () => {
  const malformed = createApiClient({
    origin,
    fetcher: async () => new Response("{broken", { headers: { "content-type": "application/json" } })
  });
  await assert.rejects(malformed.get("/api/stores"), (error: unknown) => error instanceof ApiClientError && error.kind === "invalid-response");

  const network = createApiClient({ origin, fetcher: async () => { throw new TypeError("offline"); } });
  await assert.rejects(network.get("/api/stores"), (error: unknown) => error instanceof ApiClientError && error.kind === "network");
});
