const PUBLIC_API_TIMEOUT_MS = 4_000;

type PublicApiOptions = {
  timeoutMs?: number;
};

export async function fetchPublicApi<T>(path: string, options: PublicApiOptions = {}): Promise<T | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), options.timeoutMs ?? PUBLIC_API_TIMEOUT_MS);
  try {
    const response = await fetch(path, {
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
