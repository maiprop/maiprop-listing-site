import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { nativeGetMock, nativePlatformMock, nativeRequestMock, runtimeValues } = vi.hoisted(() => ({
  nativeGetMock: vi.fn(),
  nativePlatformMock: vi.fn(),
  nativeRequestMock: vi.fn(),
  runtimeValues: {} as Record<string, string | undefined>,
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: nativePlatformMock,
  },
  CapacitorHttp: {
    get: nativeGetMock,
    request: nativeRequestMock,
  },
}));

vi.mock("@/lib/runtimeConfig", () => ({
  getRuntimeValue: (key: string) => runtimeValues[key],
}));

function stubWindowLocation(protocol: string, origin: string): void {
  vi.stubGlobal("window", {
    location: { protocol, origin },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "Content-Type": "application/json; charset=utf-8" }),
    json: vi.fn().mockResolvedValue(data),
  } as unknown as Response;
}

describe("public API transport", () => {
  beforeEach(() => {
    vi.resetModules();
    nativeGetMock.mockReset();
    nativePlatformMock.mockReset().mockReturnValue(false);
    nativeRequestMock.mockReset();
    delete runtimeValues.VITE_PUBLIC_API_ORIGIN;
    delete runtimeValues.VITE_APP_URL;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps browser requests on same-origin relative API paths", async () => {
    runtimeValues.VITE_PUBLIC_API_ORIGIN = "https://api.example.invalid";
    runtimeValues.VITE_APP_URL = "https://app.example.invalid";
    stubWindowLocation("https:", "https://portal.maiprop.co");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: ["listing"] }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchPublicApi } = await import("@/lib/publicApi");
    await expect(fetchPublicApi<{ data: string[] }>("/api/public/listings?limit=1", {
      throwOnError: true,
    })).resolves.toEqual({ data: ["listing"] });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/public/listings?limit=1",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(nativeGetMock).not.toHaveBeenCalled();
  });

  it("does not misclassify a normal web app running on localhost as native", async () => {
    runtimeValues.VITE_PUBLIC_API_ORIGIN = "https://portal.maiprop.co";
    stubWindowLocation("https:", "https://localhost");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: ["listing"] }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchPublicApi } = await import("@/lib/publicApi");
    await fetchPublicApi("/api/public/listings?limit=1", { throwOnError: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/public/listings?limit=1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(nativeGetMock).not.toHaveBeenCalled();
  });

  it("rejects absolute browser URLs instead of opening a cross-origin escape hatch", async () => {
    stubWindowLocation("https:", "https://portal.maiprop.co");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { fetchPublicApi, PublicApiError } = await import("@/lib/publicApi");
    await expect(fetchPublicApi("https://api.example.invalid/api/public/listings", {
      throwOnError: true,
    })).rejects.toBeInstanceOf(PublicApiError);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(nativeGetMock).not.toHaveBeenCalled();
  });

  it("reports browser HTML fallbacks as structured public API errors", async () => {
    stubWindowLocation("https:", "https://portal.maiprop.co");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "text/html; charset=utf-8" }),
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token '<'")),
    } as unknown as Response));

    const { fetchPublicApi, PublicApiError } = await import("@/lib/publicApi");
    await expect(fetchPublicApi("/api/public/listings", {
      throwOnError: true,
    })).rejects.toMatchObject({
      name: PublicApiError.name,
      message: "Public API returned a non-JSON response",
      status: 200,
    });
  });

  it("uses Capacitor native HTTP for bundled native requests", async () => {
    runtimeValues.VITE_PUBLIC_API_ORIGIN = "https://portal.maiprop.co";
    runtimeValues.VITE_APP_URL = "https://ignored.example.invalid";
    nativePlatformMock.mockReturnValue(true);
    stubWindowLocation("https:", "https://localhost");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    nativeGetMock.mockResolvedValue({
      data: { data: ["auction"] },
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      url: "https://portal.maiprop.co/api/public/auctions?limit=1",
    });

    const { fetchPublicApi } = await import("@/lib/publicApi");
    await expect(fetchPublicApi<{ data: string[] }>("/api/public/auctions?limit=1", {
      throwOnError: true,
      timeoutMs: 4_000,
    })).resolves.toEqual({ data: ["auction"] });

    expect(nativeGetMock).toHaveBeenCalledWith({
      url: "https://portal.maiprop.co/api/public/auctions?limit=1",
      headers: { Accept: "application/json" },
      connectTimeout: 4_000,
      readTimeout: 4_000,
      responseType: "json",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("carries authenticated headers through the bounded native transport", async () => {
    runtimeValues.VITE_PUBLIC_API_ORIGIN = "https://portal.maiprop.co";
    nativePlatformMock.mockReturnValue(true);
    stubWindowLocation("capacitor:", "capacitor://localhost");
    nativeGetMock.mockResolvedValue({
      data: { data: ["auction"] },
      status: 200,
      headers: { "content-type": "application/json" },
      url: "https://portal.maiprop.co/api/public/auctions?limit=600",
    });

    const { fetchPublicApi } = await import("@/lib/publicApi");
    await fetchPublicApi("/api/public/auctions?limit=600", {
      headers: { Authorization: "Bearer test-access-token" },
      throwOnError: true,
    });

    expect(nativeGetMock).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://portal.maiprop.co/api/public/auctions?limit=600",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer test-access-token",
      },
    }));
  });

  it("carries authenticated POST bodies through the bounded native transport", async () => {
    runtimeValues.VITE_PUBLIC_API_ORIGIN = "https://portal.maiprop.co";
    nativePlatformMock.mockReturnValue(true);
    stubWindowLocation("capacitor:", "capacitor://localhost");
    nativeRequestMock.mockResolvedValue({
      data: { iceServers: [] },
      status: 200,
      headers: { "content-type": "application/json" },
      url: "https://portal.maiprop.co/api/turn-credentials",
    });

    const { fetchPublicApi } = await import("@/lib/publicApi");
    await fetchPublicApi("/api/turn-credentials", {
      method: "POST",
      body: { roomId: "video:viewing:room-id" },
      headers: { Authorization: "Bearer test-access-token" },
      throwOnError: true,
    });

    expect(nativeRequestMock).toHaveBeenCalledWith({
      url: "https://portal.maiprop.co/api/turn-credentials",
      method: "POST",
      data: { roomId: "video:viewing:room-id" },
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: "Bearer test-access-token",
      },
      connectTimeout: 6_500,
      readTimeout: 6_500,
      responseType: "json",
    });
    expect(nativeGetMock).not.toHaveBeenCalled();
  });

  it("propagates caller cancellation while a native request is pending", async () => {
    runtimeValues.VITE_PUBLIC_API_ORIGIN = "https://portal.maiprop.co";
    nativePlatformMock.mockReturnValue(true);
    stubWindowLocation("capacitor:", "capacitor://localhost");
    nativeGetMock.mockReturnValue(new Promise(() => undefined));
    const controller = new AbortController();

    const { fetchPublicApi } = await import("@/lib/publicApi");
    const request = fetchPublicApi("/api/public/listings", {
      throwOnError: true,
      signal: controller.signal,
      timeoutMs: 10_000,
    });
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });

  it("converts a native request deadline into the existing timeout error", async () => {
    vi.useFakeTimers();
    runtimeValues.VITE_PUBLIC_API_ORIGIN = "https://portal.maiprop.co";
    nativePlatformMock.mockReturnValue(true);
    stubWindowLocation("capacitor:", "capacitor://localhost");
    nativeGetMock.mockReturnValue(new Promise(() => undefined));

    const { fetchPublicApi, PublicApiError } = await import("@/lib/publicApi");
    const request = fetchPublicApi("/api/public/listings", {
      throwOnError: true,
      timeoutMs: 50,
    });
    const rejection = expect(request).rejects.toMatchObject({
      name: PublicApiError.name,
      message: "Public API request timed out",
    });

    await vi.advanceTimersByTimeAsync(50);
    await rejection;
  });
});

describe("Capacitor native HTTP configuration", () => {
  it("enables the bundled CapacitorHttp native transport", async () => {
    vi.resetModules();
    const { default: config } = await import("../../capacitor.config");

    expect(config.plugins?.CapacitorHttp).toEqual({ enabled: true });
  });

  it("packages bundled Android builds from dist without a remote server override", async () => {
    vi.stubEnv("CAPACITOR_BUNDLED_WEB", "true");
    vi.resetModules();
    try {
      const { default: config } = await import("../../capacitor.config");

      expect(config.webDir).toBe("dist");
      expect(config.server).toBeUndefined();
      expect(config.plugins?.CapacitorHttp).toEqual({ enabled: true });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
