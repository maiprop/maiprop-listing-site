import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { fetchReleaseResource } from "./release-http.mjs";

describe("release HTTP trust boundary", () => {
  it("refuses redirects before credentials can reach another origin", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { Location: "https://attacker.example/collect" },
      }));
    const headers = {
      "CF-Access-Client-Id": "client-id",
      "CF-Access-Client-Secret": "client-secret",
      Cookie: "maiprop_unlock=secret",
    };

    await expect(fetchReleaseResource(
      "https://staging.maiprop.co/api/release",
      { fetchImpl, headers },
    )).rejects.toThrow(/refused redirect.*attacker\.example/i);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("https://staging.maiprop.co/api/release"),
      expect.objectContaining({
        redirect: "manual",
        headers,
      }),
    );
  });

  it("rejects a successful response attributed to another origin", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      redirected: false,
      url: "https://attacker.example/api/release",
      headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => "{}",
    }));

    await expect(fetchReleaseResource(
      "https://staging.maiprop.co/api/release",
      { fetchImpl },
    )).rejects.toThrow(/unexpected response origin.*attacker\.example/i);
  });

  it("returns a same-origin non-redirect response", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      redirected: false,
      url: "https://staging.maiprop.co/api/release",
    }));

    await expect(fetchReleaseResource(
      "https://staging.maiprop.co/api/release",
      { fetchImpl },
    )).resolves.toMatchObject({ status: 200 });
  });

  it.each([
    "scripts/verify-live-release-marker.mjs",
    "scripts/verify-runtime-config.mjs",
    "scripts/check-production-deploy-public-api.mjs",
    "scripts/check-production-deploy.mjs",
  ])("pins privileged requests in %s to the release HTTP boundary", (path) => {
    const source = readFileSync(path, "utf8");

    expect(source).toContain("fetchReleaseResource");
    expect(source).not.toContain('redirect: "follow"');
  });
});
