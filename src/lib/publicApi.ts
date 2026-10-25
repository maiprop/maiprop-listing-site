import { Capacitor, CapacitorHttp, type HttpResponse } from "@capacitor/core";
import { getRuntimeValue } from "@/lib/runtimeConfig";

const PUBLIC_API_TIMEOUT_MS = 6_500;
const PUBLIC_API_TIMEOUT_MESSAGE = "Public API request timed out";
const NATIVE_PUBLIC_API_ORIGIN =
  getRuntimeValue("VITE_PUBLIC_API_ORIGIN") ??
  getRuntimeValue("VITE_APP_URL") ??
  "";

type PublicApiTransportResponse = {
  status: number;
  contentType: string;
  data: unknown;
};

function boundedPublicApiPath(path: string): string {
  if (!path.startsWith("/api/") || path.startsWith("//") || path.includes("\\")) {
    throw new PublicApiError(path, "Public API requests must use a same-origin /api path");
  }

  const normalized = new URL(path, "https://public-api.invalid");
  if (normalized.origin !== "https://public-api.invalid" || !normalized.pathname.startsWith("/api/")) {
    throw new PublicApiError(path, "Public API requests must use a same-origin /api path");
  }

  return `${normalized.pathname}${normalized.search}`;
}

function nativePublicApiOrigin(path: string): string {
  if (!NATIVE_PUBLIC_API_ORIGIN) {
    throw new PublicApiError(path, "Native public API origin is not configured");
  }

  let configured: URL;
  try {
    configured = new URL(NATIVE_PUBLIC_API_ORIGIN);
  } catch {
    throw new PublicApiError(path, "Native public API origin must be an absolute HTTP(S) origin");
  }

  if (
    !["http:", "https:"].includes(configured.protocol)
    || configured.username
    || configured.password
    || configured.search
    || configured.hash
    || (configured.pathname !== "/" && configured.pathname !== "")
  ) {
    throw new PublicApiError(path, "Native public API origin must be an absolute HTTP(S) origin");
  }

  return configured.origin;
}

function isNativeBundle(): boolean {
  return Capacitor.isNativePlatform();
}

function headerValue(headers: Record<string, string>, name: string): string {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1] ?? "";
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Aborted", "AbortError");
}

async function withAbortSignal<T>(request: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw abortReason(signal);

  return await new Promise<T>((resolve, reject) => {
    const abort = () => reject(abortReason(signal));
    signal.addEventListener("abort", abort, { once: true });
    request.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

async function fetchNativePublicApi(
  path: string,
  signal: AbortSignal,
  timeoutMs: number,
  headers: Record<string, string>,
  method: "GET" | "POST",
  body: unknown,
): Promise<PublicApiTransportResponse> {
  const url = new URL(path, nativePublicApiOrigin(path)).toString();
  const requestOptions = {
    url,
    headers,
    connectTimeout: timeoutMs,
    readTimeout: timeoutMs,
    responseType: "json" as const,
  };
  const response = await withAbortSignal<HttpResponse>(
    method === "GET" && body === undefined
      ? CapacitorHttp.get(requestOptions)
      : CapacitorHttp.request({
          ...requestOptions,
          method,
          data: body,
        }),
    signal,
  );

  return {
    status: response.status,
    contentType: headerValue(response.headers, "Content-Type"),
    data: response.data,
  };
}

async function fetchWebPublicApi(
  path: string,
  signal: AbortSignal,
  headers: Record<string, string>,
  method: "GET" | "POST",
  body: unknown,
): Promise<PublicApiTransportResponse> {
  const response = await fetch(path, {
    method,
    headers,
    signal,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const contentType = response.headers.get("Content-Type") ?? "";

  return {
    status: response.status,
    contentType,
    data: response.ok && contentType.toLowerCase().includes("application/json")
      ? await response.json()
      : null,
  };
}

type PublicApiOptions = {
  timeoutMs?: number;
  throwOnError?: boolean;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: unknown;
};

export class PublicApiError extends Error {
  constructor(
    public readonly path: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "PublicApiError";
  }
}

export function isPublicApiAbort(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "name" in error
    && (error as { name?: unknown }).name === "AbortError",
  );
}

export function isPublicApiTimeoutError(error: unknown): boolean {
  return error instanceof PublicApiError && error.message === PUBLIC_API_TIMEOUT_MESSAGE;
}

function linkAbortSignal(source: AbortSignal | undefined, controller: AbortController): () => void {
  if (!source) return () => undefined;
  if (source.aborted) {
    controller.abort();
    return () => undefined;
  }

  const abort = () => controller.abort();
  source.addEventListener("abort", abort, { once: true });
  return () => source.removeEventListener("abort", abort);
}

export async function fetchPublicApi<T>(path: string, options: PublicApiOptions = {}): Promise<T | null> {
  const controller = new AbortController();
  const unlinkAbortSignal = linkAbortSignal(options.signal, controller);
  const timeoutMs = options.timeoutMs ?? PUBLIC_API_TIMEOUT_MS;
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const boundedPath = boundedPublicApiPath(path);
    const method = options.method ?? "GET";
    const headers = {
      Accept: "application/json",
      ...(options.body === undefined ? {} : {
        "Content-Type": "application/json",
      }),
      ...options.headers,
    };
    const response = isNativeBundle()
      ? await fetchNativePublicApi(
        boundedPath,
        controller.signal,
        timeoutMs,
        headers,
        method,
        options.body,
      )
      : await fetchWebPublicApi(
        boundedPath,
        controller.signal,
        headers,
        method,
        options.body,
      );
    if (response.status < 200 || response.status >= 300) {
      if (options.throwOnError) {
        throw new PublicApiError(path, `Public API request failed with ${response.status}`, response.status);
      }
      return null;
    }
    if (!response.contentType.toLowerCase().includes("application/json")) {
      if (options.throwOnError) {
        throw new PublicApiError(path, "Public API returned a non-JSON response", response.status);
      }
      return null;
    }
    return response.data as T;
  } catch (error) {
    if (options.throwOnError) {
      if (error instanceof PublicApiError) throw error;
      if (isPublicApiAbort(error)) {
        if (options.signal?.aborted) throw error;
        if (timedOut) throw new PublicApiError(path, PUBLIC_API_TIMEOUT_MESSAGE);
      }
      throw error;
    }
    return null;
  } finally {
    unlinkAbortSignal();
    window.clearTimeout(timer);
  }
}
