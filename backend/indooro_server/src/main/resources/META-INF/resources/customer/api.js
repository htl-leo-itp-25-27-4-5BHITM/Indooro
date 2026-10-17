// Same-origin, cookie-free JSON client for the customer web view.
// Every failure is an Error with `kind` set to "network", "http" or "empty".
// Aborts are rethrown unchanged (error.name === "AbortError") so callers can ignore them.

const API_BASE = "/api";

function failure(kind, message, cause) {
  const error = new Error(message);
  error.kind = kind;
  if (cause) error.cause = cause;
  return error;
}

async function getJson(path, signal) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: "omit",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw failure("network", "Keine Verbindung", error);
  }

  if (!response.ok) throw failure("http", `HTTP ${response.status}`);

  try {
    return await response.json();
  } catch (error) {
    throw failure("empty", "Leere oder ungültige Antwort", error);
  }
}

const isObject = (value) => value !== null && typeof value === "object";

export async function fetchStores() {
  const data = await getJson("/mobile/stores");
  if (!Array.isArray(data)) throw failure("empty", "Märkte fehlen in der Antwort");
  return data.filter(isObject);
}

export async function fetchLayout(storeId) {
  const data = await getJson(`/mobile/stores/${encodeURIComponent(String(storeId))}/layout/current`);
  if (!isObject(data) || !isObject(data.layout)) throw failure("empty", "Layout fehlt in der Antwort");
  return data;
}

// `storeCode` is sent only when a store is known; otherwise the parameter is omitted.
export async function searchProducts(query, storeCode, signal) {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("size", "30");
  if (storeCode) params.set("storeCode", storeCode);

  const data = await getJson(`/products/search?${params.toString()}`, signal);
  if (!Array.isArray(data)) throw failure("empty", "Suchergebnis fehlt in der Antwort");
  return data.filter(isObject);
}
