const PUBLIC_API_TIMEOUT_MS = 4_000;
const PUBLIC_API_ORIGIN = import.meta.env.VITE_PUBLIC_API_ORIGIN ?? import.meta.env.VITE_APP_URL ?? "";

function getPublicApiUrl(path: string): string {
  const isNativeBundle = window.location.protocol === "capacitor:";
  if (!isNativeBundle || !path.startsWith("/") || !PUBLIC_API_ORIGIN) return path;
  return new URL(path, PUBLIC_API_ORIGIN).toString();
}

type PublicApiOptions = {
  timeoutMs?: number;
};

export async function fetchPublicApi<T>(path: string, options: PublicApiOptions = {}): Promise<T | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), options.timeoutMs ?? PUBLIC_API_TIMEOUT_MS);
  try {
    const response = await fetch(getPublicApiUrl(path), {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const contentType = response.headers.get("Content-Type") ?? "";
    if (!response.ok || !contentType.includes("application/json")) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}
