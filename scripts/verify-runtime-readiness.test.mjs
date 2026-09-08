import { describe, expect, it, vi } from "vitest";
import { fetchRuntimeConfig, validateRuntimeConfig } from "./verify-runtime-config.mjs";

const baseUrl = "https://deployment.staging.pages.dev";
const config = { VITE_SUPABASE_PROJECT_ID: "wrong-project" };
const ready = () => new Response(`window.__MAIPROP_RUNTIME_CONFIG__=${JSON.stringify(config)};`);

describe("new deployment runtime readiness", () => {
  it.each([404, 502, 503, 504])("waits for temporary HTTP %s propagation failures", async (status) => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("not ready", { status }))
      .mockResolvedValueOnce(ready());
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(fetchRuntimeConfig(baseUrl, { fetchImpl, sleep })).resolves.toEqual(config);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(5_000, undefined, { signal: expect.any(AbortSignal) });
    expect(fetchImpl.mock.calls[0][1].signal).toBe(fetchImpl.mock.calls[1][1].signal);
  });

  it("stops after twelve unavailable responses", async () => {
    const fetchImpl = vi.fn(async () => new Response("not ready", { status: 404 }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(fetchRuntimeConfig(baseUrl, { fetchImpl, sleep })).rejects.toThrow("HTTP 404");
    expect(fetchImpl).toHaveBeenCalledTimes(12);
    expect(sleep).toHaveBeenCalledTimes(11);
  });

  it.each([401, 403, 500])("fails immediately for HTTP %s", async (status) => {
    const fetchImpl = vi.fn(async () => new Response("denied", { status }));
    const sleep = vi.fn();
    await expect(fetchRuntimeConfig(baseUrl, { fetchImpl, sleep })).rejects.toThrow(`HTTP ${status}`);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does not retry malformed or incorrect configuration", async () => {
    const sleep = vi.fn();
    const malformed = vi.fn(async () => new Response("<html>not runtime config</html>"));
    await expect(fetchRuntimeConfig(baseUrl, { fetchImpl: malformed, sleep })).rejects.toThrow("assignment is missing");
    const fetchImpl = vi.fn(async () => ready());
    const actual = await fetchRuntimeConfig(baseUrl, { fetchImpl, sleep });
    expect(() => validateRuntimeConfig(actual, {
      supabaseUrl: "https://expected.supabase.co",
      supabaseProjectId: "expected",
      supabasePublishableKey: "expected-key",
      appUrl: baseUrl,
    })).toThrow();
    expect(malformed).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("still refuses redirects without retrying", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 302, headers: { location: "https://untrusted.example" },
    }));
    const sleep = vi.fn();
    await expect(fetchRuntimeConfig(baseUrl, { fetchImpl, sleep })).rejects.toThrow("refused redirect");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
