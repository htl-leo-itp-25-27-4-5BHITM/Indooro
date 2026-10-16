export type ApiErrorKind =
  | "unauthorized"
  | "forbidden"
  | "validation"
  | "conflict"
  | "server"
  | "network"
  | "invalid-response";

export type FieldErrors = Record<string, string[]>;

export class ApiClientError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    public readonly status: number | null,
    message: string,
    public readonly fieldErrors: FieldErrors = {},
    cause?: unknown
  ) {
    super(message, { cause });
    this.name = "ApiClientError";
  }
}

export interface ApiClientOptions {
  /** Defaults to the browser's current origin. Inject an origin for tests. */
  origin?: string;
  fetcher?: typeof fetch;
  onUnauthorized?: () => void;
  onForbidden?: () => void;
}

export interface ApiRequestOptions extends Omit<RequestInit, "body" | "credentials"> {
  /** Serialized as JSON. Pass `body` instead for a FormData upload. */
  json?: unknown;
  body?: BodyInit | null;
}

export interface ApiClient {
  request<T>(path: string, options?: ApiRequestOptions): Promise<T>;
  get<T>(path: string, options?: ApiRequestOptions): Promise<T>;
  post<T>(path: string, json: unknown, options?: ApiRequestOptions): Promise<T>;
  put<T>(path: string, json: unknown, options?: ApiRequestOptions): Promise<T>;
  delete<T>(path: string, options?: ApiRequestOptions): Promise<T>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function messageFrom(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of ["error", "message", "detail", "title"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

function fieldErrorsFrom(value: unknown): FieldErrors {
  if (!isRecord(value)) return {};
  const result: FieldErrors = {};
  const errors = value.errors;
  if (isRecord(errors)) {
    for (const [field, messages] of Object.entries(errors)) {
      const entries = Array.isArray(messages) ? messages : [messages];
      const strings = entries.filter((entry): entry is string => typeof entry === "string" && !!entry.trim());
      if (strings.length) result[field] = strings;
    }
  }
  const violations = value.violations;
  if (Array.isArray(violations)) {
    for (const violation of violations) {
      if (!isRecord(violation)) continue;
      const field = violation.field ?? violation.propertyPath;
      const message = violation.message;
      if (typeof field === "string" && typeof message === "string" && message.trim()) {
        (result[field] ??= []).push(message.trim());
      }
    }
  }
  return result;
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === "AbortError";
}

function errorForStatus(status: number, payload: unknown): ApiClientError {
  if (status === 401) {
    return new ApiClientError("unauthorized", status, "Sitzung abgelaufen. Bitte erneut anmelden.");
  }
  if (status === 403) {
    return new ApiClientError("forbidden", status, "Für diese Aktion fehlen die Berechtigungen.");
  }
  if (status === 409) {
    return new ApiClientError("conflict", status, messageFrom(payload) ?? "Der Datensatz wurde inzwischen geändert.");
  }
  if (status === 400 || status === 422) {
    return new ApiClientError(
      "validation",
      status,
      messageFrom(payload) ?? "Bitte die Eingaben prüfen.",
      fieldErrorsFrom(payload)
    );
  }
  return new ApiClientError("server", status, status >= 500 ? "Serverfehler. Bitte später erneut versuchen." : messageFrom(payload) ?? "Anfrage fehlgeschlagen.");
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const origin = options.origin ?? (typeof window !== "undefined" ? window.location.origin : undefined);
  if (!origin) throw new Error("An API origin is required outside the browser");
  const normalizedOrigin = new URL(origin).origin;
  const fetcher = options.fetcher ?? globalThis.fetch;

  async function request<T>(path: string, requestOptions: ApiRequestOptions = {}): Promise<T> {
    if (!path.startsWith("/api/")) throw new TypeError("API paths must start with /api/");
    const url = new URL(path, normalizedOrigin);
    if (url.origin !== normalizedOrigin) throw new TypeError("Cross-origin API requests are not allowed");

    const { json, body, headers: initialHeaders, ...init } = requestOptions;
    if (Object.hasOwn(requestOptions, "json") && body !== undefined) {
      throw new TypeError("Use either json or body, not both");
    }
    const headers = new Headers(initialHeaders);
    headers.set("Accept", "application/json");
    const hasJson = Object.hasOwn(requestOptions, "json");
    if (hasJson) headers.set("Content-Type", "application/json");

    let response: Response;
    try {
      response = await fetcher(url.toString(), {
        ...init,
        credentials: "same-origin",
        headers,
        body: hasJson ? JSON.stringify(json) : body
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new ApiClientError("network", null, "Verbindung fehlgeschlagen. Bitte erneut versuchen.", {}, error);
    }

    // Read the response exactly once, including failures. JSON parsing uses that text.
    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new ApiClientError("network", response.status, "Antwort konnte nicht gelesen werden.", {}, error);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json") || contentType.includes("+json");
    let payload: unknown;
    if (text && isJson) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch (error) {
        if (response.ok) {
          throw new ApiClientError("invalid-response", response.status, "Ungültige Serverantwort.", {}, error);
        }
      }
    }

    if (!response.ok) {
      if (response.status === 401) options.onUnauthorized?.();
      if (response.status === 403) options.onForbidden?.();
      throw errorForStatus(response.status, payload);
    }
    if (text && !isJson) {
      throw new ApiClientError("invalid-response", response.status, "Unerwartete Serverantwort.");
    }
    return payload as T;
  }

  return {
    request,
    get: (path, opts) => request(path, { ...opts, method: "GET" }),
    post: (path, json, opts) => request(path, { ...opts, method: "POST", json }),
    put: (path, json, opts) => request(path, { ...opts, method: "PUT", json }),
    delete: (path, opts) => request(path, { ...opts, method: "DELETE" })
  };
}
