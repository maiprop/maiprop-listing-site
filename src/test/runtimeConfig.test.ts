import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertRuntimeConfigLoaded,
  getRuntimeConfigSnapshot,
  getRuntimeValue,
  hasRuntimeConfig,
} from "@/lib/runtimeConfig";

declare global {
  interface Window {
    __MAIPROP_RUNTIME_CONFIG__?: Record<string, string>;
  }
}

afterEach(() => {
  delete window.__MAIPROP_RUNTIME_CONFIG__;
  vi.unstubAllEnvs();
});

describe("public runtime configuration", () => {
  it("prefers the synchronous Pages runtime configuration over build stubs", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://buildstub0000000000.supabase.co");
    window.__MAIPROP_RUNTIME_CONFIG__ = {
      VITE_SUPABASE_URL: "https://stagingref000000000.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_staging",
    };

    expect(getRuntimeValue("VITE_SUPABASE_URL")).toBe(
      "https://stagingref000000000.supabase.co",
    );
    expect(hasRuntimeConfig()).toBe(true);
  });

  it("keeps local and test builds compatible with import.meta.env", () => {
    vi.stubEnv("VITE_MAPBOX_TOKEN", "local-mapbox-token");

    expect(getRuntimeValue("VITE_MAPBOX_TOKEN")).toBe("local-mapbox-token");
    expect(hasRuntimeConfig()).toBe(false);
  });

  it("returns only string runtime values in snapshots", () => {
    window.__MAIPROP_RUNTIME_CONFIG__ = {
      VITE_SUPABASE_URL: "https://stagingref000000000.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_staging",
      VITE_APP_URL: "https://staging.portal.maiprop.co",
      VITE_PLAUSIBLE_DOMAIN: "portal.maiprop.co",
    };

    expect(getRuntimeConfigSnapshot()).toEqual({
      VITE_SUPABASE_URL: "https://stagingref000000000.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_staging",
      VITE_APP_URL: "https://staging.portal.maiprop.co",
      VITE_PLAUSIBLE_DOMAIN: "portal.maiprop.co",
    });
  });

  it("treats empty and partial runtime objects as missing", () => {
    window.__MAIPROP_RUNTIME_CONFIG__ = {};
    expect(hasRuntimeConfig()).toBe(false);

    window.__MAIPROP_RUNTIME_CONFIG__ = {
      VITE_SUPABASE_URL: "https://stagingref000000000.supabase.co",
    };
    expect(hasRuntimeConfig()).toBe(false);

    expect(() =>
      assertRuntimeConfigLoaded({
        productionBuild: true,
        hostname: "portal.maiprop.co",
      }),
    ).toThrow(/runtime-config\.js/i);
  });

  it("fails closed when a deployed production build did not load runtime config", () => {
    expect(() =>
      assertRuntimeConfigLoaded({
        productionBuild: true,
        hostname: "portal.maiprop.co",
      }),
    ).toThrow(/runtime-config\.js/i);

    expect(() =>
      assertRuntimeConfigLoaded({
        productionBuild: true,
        hostname: "127.0.0.1",
      }),
    ).not.toThrow();
  });
});
