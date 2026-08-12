import { describe, expect, it } from "vitest";
import {
  PUBLIC_RUNTIME_CONFIG_KEYS,
  buildRuntimeConfig,
  onRequestGet,
} from "./runtime-config.js";

const env = {
  SUPABASE_URL: "https://stagingref000000000.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_staging",
  VITE_APP_URL: "https://staging.portal.maiprop.co",
  VITE_MAPBOX_TOKEN: "public-mapbox-token",
  SITE_LOCK_PASSWORD: "must-never-leak",
  SUPABASE_SERVICE_ROLE_KEY: "must-never-leak",
  CLOUDFLARE_TURN_KEY_ID: "must-never-leak",
  CLOUDFLARE_TURN_API_TOKEN: "must-never-leak",
  VITE_MAIPROP_TURN_CREDENTIAL: "legacy-must-never-leak",
};

describe("Pages public runtime configuration", () => {
  it("exposes only the explicit public allowlist", () => {
    const config = buildRuntimeConfig(env);

    expect(config.VITE_SUPABASE_URL).toBe(env.SUPABASE_URL);
    expect(config.VITE_SUPABASE_PUBLISHABLE_KEY).toBe(
      env.SUPABASE_PUBLISHABLE_KEY,
    );
    expect(config.VITE_MAPBOX_TOKEN).toBe(env.VITE_MAPBOX_TOKEN);
    expect(config).not.toHaveProperty("SITE_LOCK_PASSWORD");
    expect(config).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
    expect(config).not.toHaveProperty("CLOUDFLARE_TURN_KEY_ID");
    expect(config).not.toHaveProperty("CLOUDFLARE_TURN_API_TOKEN");
    expect(config).not.toHaveProperty("VITE_MAIPROP_TURN_CREDENTIAL");
    expect(PUBLIC_RUNTIME_CONFIG_KEYS).not.toContain("SITE_LOCK_PASSWORD");
    expect(PUBLIC_RUNTIME_CONFIG_KEYS).not.toContain(
      "SUPABASE_SERVICE_ROLE_KEY",
    );
    expect(PUBLIC_RUNTIME_CONFIG_KEYS).not.toContain(
      "VITE_MAIPROP_TURN_CREDENTIAL",
    );
  });

  it("returns a synchronous no-store JavaScript assignment", async () => {
    const response = await onRequestGet({
      env,
      request: new Request("https://staging.portal.maiprop.co/runtime-config.js"),
    } as never);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toMatch(
      /application\/javascript/,
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toContain("window.__MAIPROP_RUNTIME_CONFIG__");
    expect(body).toContain("stagingref000000000");
    expect(body).not.toContain("must-never-leak");
  });
});
