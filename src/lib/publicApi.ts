const PUBLIC_API_TIMEOUT_MS = 4_000;
const PUBLIC_API_ORIGIN = import.meta.env.VITE_PUBLIC_API_ORIGIN ?? import.meta.env.VITE_APP_URL ?? "";

function getPublicApiUrl(path: string): string {
  if (!path.startsWith("/")) return path;

  const isNativeBundle = window.location.protocol === "capacitor:";
  if (isNativeBundle) {
    return PUBLIC_API_ORIGIN ? new URL(path, PUBLIC_API_ORIGIN).toString() : path;
  }

  const browserOrigin = window.location.origin && window.location.origin !== "null"
    ? window.location.origin
    : "";
  const origin = PUBLIC_API_ORIGIN || browserOrigin;
  return origin ? new URL(path, origin).toString() : path;
}

type PublicApiOptions = {
  timeoutMs?: number;
  throwOnError?: boolean;
  signal?: AbortSignal;
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

export function shouldLogPublicApiFallback(error: unknown): boolean {
  if (!import.meta.env.DEV) return true;
  if (isPublicApiAbort(error)) return false;
  if (error instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(error.message)) {
    return false;
  }
  return true;
}

export function isPublicApiAbort(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "name" in error
    && (error as { name?: unknown }).name === "AbortError",
  );
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
  const timer = window.setTimeout(() => controller.abort(), options.timeoutMs ?? PUBLIC_API_TIMEOUT_MS);
  try {
    const response = await fetch(getPublicApiUrl(path), {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const contentType = response.headers.get("Content-Type") ?? "";
    if (!response.ok) {
      if (options.throwOnError) {
        throw new PublicApiError(path, `Public API request failed with ${response.status}`, response.status);
      }
      return null;
    }
    if (!contentType.includes("application/json")) {
      if (options.throwOnError) {
        throw new PublicApiError(path, "Public API returned a non-JSON response", response.status);
      }
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    if (options.throwOnError) {
      if (error instanceof PublicApiError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        if (options.signal?.aborted) throw error;
        throw new PublicApiError(path, "Public API request timed out");
      }
      throw error;
    }
    return null;
  } finally {
    unlinkAbortSignal();
    window.clearTimeout(timer);
  }
}
