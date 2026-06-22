import { describe, expect, it } from "vitest";

import { evaluateEcasLiveEvidence } from "./check-ecas-live-evidence.mjs";

describe("ECAS live evidence rollup", () => {
  it("passes advisory mode when providers are explicitly unconfigured", () => {
    const result = evaluateEcasLiveEvidence(
      [
        { provider: "sentry", status: "unconfigured", missingEnv: ["SENTRY_AUTH_TOKEN"] },
        { provider: "cloudflare", status: "unconfigured", missingEnv: ["CLOUDFLARE_API_TOKEN"] },
        { provider: "github", status: "blocked", blockers: ["GitHub plan does not expose branch protection"] },
      ],
      { strict: false },
    );

    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(3);
    expect(result.failures).toEqual([]);
  });

  it("fails strict mode unless every provider is captured", () => {
    const result = evaluateEcasLiveEvidence(
      [
        { provider: "sentry", status: "captured" },
        { provider: "cloudflare", status: "unconfigured", missingEnv: ["CLOUDFLARE_API_TOKEN"] },
        { provider: "github", status: "captured" },
      ],
      { strict: true },
    );

    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(["cloudflare live evidence is unconfigured"]);
  });

  it("requires all expected provider evidence documents", () => {
    const result = evaluateEcasLiveEvidence([{ provider: "sentry", status: "captured" }], { strict: true });

    expect(result.failures).toEqual([
      "cloudflare live evidence is missing",
      "github live evidence is missing",
    ]);
  });
});
