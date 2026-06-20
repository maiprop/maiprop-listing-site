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
});
