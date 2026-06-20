import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkLoadTestContract } from "./check-load-test-contract.mjs";

const makeFixture = (scriptText) => {
  const root = mkdtempSync(join(tmpdir(), "maiprop-load-contract-"));
  mkdirSync(join(root, "scripts", "load-test"), { recursive: true });
  writeFileSync(join(root, "scripts", "load-test", "basic.js"), scriptText);
  return root;
};

const contractScript = (overrides = {}) => {
  const {
    baseUrlLine = "const BASE_URL = requireEnv(\"BASE_URL\");",
    profileLine = "const ECAS_LOAD_PROFILE = requireLoadProfile(requireEnv(\"ECAS_LOAD_PROFILE\"));",
    summary = `"load-test-summary.json": JSON.stringify(normalizeSummary(data), null, 2),
    "load-test-raw-summary.json": JSON.stringify(data, null, 2),`,
    extra = "",
  } = overrides;

  return `
    import http from "k6/http";
    const LOAD_TEST_APPROVED_PRODUCTION = __ENV.LOAD_TEST_APPROVED_PRODUCTION === "true";
    const LOAD_TEST_SUMMARY_DIR = ".";
    ${baseUrlLine}
    ${profileLine}
    const LOAD_PROFILES = {
      smoke: [{ duration: "10s", target: 10 }],
      baseline_100: [{ duration: "1m", target: 100 }],
      growth_10x: [{ duration: "5m", target: 1000 }],
      enterprise_soak: [{ duration: "30m", target: 250 }],
    };
    function requireEnv(name) {
      if (!__ENV[name]) throw new Error(\`\${name} is required\`);
      return __ENV[name];
    }
    function requireLoadProfile(profile) {
      if (!Object.prototype.hasOwnProperty.call(LOAD_PROFILES, profile)) throw new Error("Invalid ECAS_LOAD_PROFILE");
      return profile;
    }
    function normalizeSummary(data) {
      return { schemaVersion: 1, profile: ECAS_LOAD_PROFILE, metrics: data.metrics };
    }
    function isProductionHost(hostname) {
      return hostname === "maiprop.co" || hostname.endsWith(".maiprop.co");
    }
    if (isProductionHost(new URL(BASE_URL).hostname) && !LOAD_TEST_APPROVED_PRODUCTION) {
      throw new Error("Production load tests require LOAD_TEST_APPROVED_PRODUCTION=true");
    }
    export const options = {
      scenarios: { browse: { executor: "ramping-vus", stages: LOAD_PROFILES[ECAS_LOAD_PROFILE] } },
      thresholds: {
        http_req_duration: ["p(95)<2500"],
        errors: ["rate<0.01"],
        http_req_failed: ["rate<0.01"],
      },
    };
    export default function () {
      http.get(\`\${BASE_URL}/listings\`);
      http.get(\`\${BASE_URL}/auctions\`);
      http.get(\`\${BASE_URL}/api/public/listings\`);
      http.get(\`\${BASE_URL}/api/public/open-houses\`);
      http.get(\`\${BASE_URL}/sitemap-dynamic.xml\`);
    }
    export function handleSummary(data) {
      return {
        ${summary}
      };
    }
    ${extra}
  `;
};

describe("load test contract", () => {
  it("accepts the committed baseline k6 script", () => {
    const result = checkLoadTestContract(process.cwd());

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("requires thresholds, summary output, and critical public API coverage", () => {
    const root = makeFixture(`
      import http from "k6/http";
      export const options = {
        scenarios: { browse: { executor: "ramping-vus", stages: [{ target: 20 }] } },
        thresholds: { http_req_duration: ["p(95)<5000"] },
      };
      export default function () {
        http.get(\`\${BASE_URL}/\`);
      }
    `);

    const result = checkLoadTestContract(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("peak target must reach at least 1000 VUs");
    expect(result.failures.join("\n")).toContain("scripts/load-test/basic.js must mention http_req_failed");
    expect(result.failures.join("\n")).toContain("scripts/load-test/basic.js must mention /api/public/listings");
    expect(result.failures.join("\n")).toContain("scripts/load-test/basic.js must mention load-test-summary.json");
  });

  it("rejects k6 scripts that fall back to a default BASE_URL", () => {
    const root = makeFixture(contractScript({
      baseUrlLine: `const BASE_URL = __ENV.BASE_URL || "https://staging--maiprop.netlify.app";`,
    }));

    const result = checkLoadTestContract(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("scripts/load-test/basic.js must require BASE_URL from __ENV without a default fallback");
  });

  it("rejects k6 scripts that default or loosely validate the load profile", () => {
    const root = makeFixture(contractScript({
      profileLine: `const ECAS_LOAD_PROFILE = __ENV.ECAS_LOAD_PROFILE || "baseline_100";`,
    }));

    const result = checkLoadTestContract(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("scripts/load-test/basic.js must validate ECAS_LOAD_PROFILE against smoke, baseline_100, growth_10x, enterprise_soak");
  });

  it("requires a normalized summary artifact instead of only raw k6 output", () => {
    const root = makeFixture(contractScript({
      summary: `"load-test-summary.json": JSON.stringify(data, null, 2),`,
    }));

    const result = checkLoadTestContract(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("scripts/load-test/basic.js must write normalized load-test-summary.json output");
  });

  it("requires availability error rate to come from the status-only check", () => {
    const root = makeFixture(contractScript({
      extra: `
        const ok = check(res, {
          "status 2xx": (response) => response.status >= 200 && response.status < 300,
          "TTFB < 1500ms": (response) => response.timings.waiting < 1500,
        });
        errorRate.add(ok ? 0 : 1, { route: route.name });
      `,
    }));

    const result = checkLoadTestContract(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("scripts/load-test/basic.js must keep availability errorRate scoped to the status-only check");
  });
});
